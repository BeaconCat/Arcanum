<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue';
import { useProfileStore } from '../stores/use-profile-store';
import { apiCreateProfile, apiUpdateProfile, apiDeleteProfile, apiGetShareData, apiImportProfile } from '../api/profile.api';
import { apiGetBaziChart, apiGetZiweiChart } from '../api/chart.api';
import BaziChartCard from '../components/chart/BaziChartCard.vue';
import ZiweiChartCard from '../components/chart/ZiweiChartCard.vue';
import AstroChartCard from '../components/chart/AstroChartCard.vue';
import LoadingSpinner from '../components/common/LoadingSpinner.vue';
import PageHeader from '../components/common/PageHeader.vue';
import EmptyState from '../components/common/EmptyState.vue';
import AppModal from '../components/common/AppModal.vue';
import ProfileFormFields, { type ProfileFormModel } from '../components/profile/ProfileFormFields.vue';
import {
  Plus, Trash2, QrCode, BookOpen, Download, Copy, Check, Camera,
  Image as ImageIcon, Pencil, UserPlus, MapPin, CalendarDays, Clock, CheckCircle2,
} from 'lucide-vue-next';
import jsQR from 'jsqr';
import { useRouter } from 'vue-router';
import type { ProfileShareData } from '../../shared/types/profile.types';
import QRCode from 'qrcode';
import type { BaziChart } from '../../shared/types/bazi.types';
import type { ZiweiChart } from '../../shared/types/ziwei.types';
import { useFeedback, errorMessage } from '../composables/useFeedback';

const profileStore = useProfileStore();
const router = useRouter();
const { toast, confirm } = useFeedback();

const baziChart = ref<BaziChart | null>(null);
const ziweiChart = ref<ZiweiChart | null>(null);
const chartLoading = ref(false);
const chartError = ref('');
const chartTab = ref<'bazi' | 'ziwei' | 'astro'>('bazi');
// Bumped after edits so the 星盘 card recomputes with new birth data / coordinates
const astroVersion = ref(0);

onMounted(async () => {
  await profileStore.loadProfiles();
});

// Load charts when selected profile changes
watch(() => profileStore.currentProfileId, async (id) => {
  if (!id) {
    baziChart.value = null;
    ziweiChart.value = null;
    return;
  }
  await loadCharts(id);
}, { immediate: true });

async function loadCharts(profileId: string) {
  chartLoading.value = true;
  chartError.value = '';
  baziChart.value = null;
  ziweiChart.value = null;
  try {
    const [bazi, ziwei] = await Promise.all([
      apiGetBaziChart(profileId),
      apiGetZiweiChart(profileId),
    ]);
    baziChart.value = bazi;
    ziweiChart.value = ziwei;
  } catch (err) {
    chartError.value = errorMessage(err, '排盘失败');
  } finally {
    chartLoading.value = false;
  }
}

// ── Create / Edit (shared form) ──
function emptyForm(): ProfileFormModel {
  return { name: '', relation: '本人', birthDate: '', birthTime: '', gender: 'male', birthPlace: '', birthLat: '', birthLon: '' };
}

const showForm = ref(false);
const editingProfileId = ref<string | null>(null);
const form = ref<ProfileFormModel>(emptyForm());
const saving = ref(false);
const formError = ref('');
const formAdvancedOpen = ref(false);

/** Form strings → API payload (blank coordinates clear the manual override) */
function toPayload(f: ProfileFormModel) {
  const num = (v: string) => (v.trim() === '' ? null : Number(v));
  return { ...f, birthLat: num(f.birthLat), birthLon: num(f.birthLon) };
}

function openCreate() {
  editingProfileId.value = null;
  formAdvancedOpen.value = false;
  form.value = emptyForm();
  formError.value = '';
  showForm.value = true;
}

function openEdit(p: (typeof profileStore.profiles)[0], advanced = false) {
  editingProfileId.value = p.profileId;
  formAdvancedOpen.value = advanced;
  form.value = {
    name: p.name,
    relation: p.relation,
    birthDate: p.birthDate,
    birthTime: p.birthTime,
    gender: p.gender,
    birthPlace: p.birthPlace,
    birthLat: p.birthLat != null ? String(p.birthLat) : '',
    birthLon: p.birthLon != null ? String(p.birthLon) : '',
  };
  formError.value = '';
  showForm.value = true;
}

async function handleSubmitForm() {
  formError.value = '';
  saving.value = true;
  try {
    if (editingProfileId.value) {
      await apiUpdateProfile(editingProfileId.value, toPayload(form.value));
      astroVersion.value++;
      await profileStore.loadProfiles();
      toast.success('档案已保存');
      // Birth data may have changed — refresh charts for the active profile
      if (editingProfileId.value === profileStore.currentProfileId) await loadCharts(editingProfileId.value);
    } else {
      const profile = await apiCreateProfile(toPayload(form.value));
      await profileStore.loadProfiles();
      profileStore.switchProfile(profile.profileId);
      toast.success('档案已创建');
    }
    showForm.value = false;
  } catch (err) {
    formError.value = errorMessage(err, editingProfileId.value ? '保存失败' : '创建失败');
  } finally {
    saving.value = false;
  }
}

async function handleDelete(p: (typeof profileStore.profiles)[0]) {
  const ok = await confirm({
    title: '删除档案',
    message: `确定要删除「${p.name}」的档案吗？相关的运势数据也会一并删除，此操作不可恢复。`,
    confirmText: '删除',
    danger: true,
  });
  if (!ok) return;
  try {
    await apiDeleteProfile(p.profileId);
    await profileStore.loadProfiles();
    toast.success('档案已删除');
  } catch (err) {
    toast.error(errorMessage(err, '删除失败'));
  }
}

// ── QR Share ──
const showShareDialog = ref(false);
const shareQrUrl = ref('');
const shareJson = ref('');
const shareName = ref('');
const copiedText = ref(false);
const copiedImg = ref(false);

async function handleShare(profileId: string) {
  try {
    const data = await apiGetShareData(profileId);
    shareName.value = data.name;
    shareJson.value = JSON.stringify(data);
    shareQrUrl.value = await QRCode.toDataURL(shareJson.value, {
      width: 400, margin: 2,
      color: { dark: '#1a1a1a', light: '#ffffff' },
    });
    showShareDialog.value = true;
    copiedText.value = false;
    copiedImg.value = false;
  } catch (err) {
    toast.error(`获取分享数据失败：${errorMessage(err, '未知错误')}`);
  }
}

async function copyShareData() {
  try {
    await navigator.clipboard.writeText(shareJson.value);
    copiedText.value = true;
  } catch {
    const ta = document.createElement('textarea');
    ta.value = shareJson.value;
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);
    copiedText.value = true;
  }
  setTimeout(() => (copiedText.value = false), 2000);
}

async function copyQrImage() {
  try {
    const resp = await fetch(shareQrUrl.value);
    const blob = await resp.blob();
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
    copiedImg.value = true;
  } catch {
    toast.error('复制图片失败，请长按或右键图片保存');
  }
  setTimeout(() => (copiedImg.value = false), 2000);
}

function downloadQrImage() {
  const a = document.createElement('a');
  a.href = shareQrUrl.value;
  a.download = `${shareName.value || '档案'}-二维码.png`;
  a.click();
}

// ── Import ──
const showImportDialog = ref(false);
const importJson = ref('');
const importing = ref(false);
const importError = ref('');
const fileInputRef = ref<HTMLInputElement | null>(null);
const videoRef = ref<HTMLVideoElement | null>(null);
const scanning = ref(false);
let scanStream: MediaStream | null = null;
let scanRafId = 0;

function openImport() {
  importJson.value = '';
  importError.value = '';
  showImportDialog.value = true;
}

// Any way the import dialog closes must release the camera
watch(showImportDialog, (v) => {
  if (!v) stopScan();
});
onBeforeUnmount(stopScan);

async function handleImport() {
  importError.value = '';
  if (!importJson.value.trim()) {
    importError.value = '请粘贴档案数据';
    return;
  }
  importing.value = true;
  try {
    const shareData: ProfileShareData = JSON.parse(importJson.value.trim());
    if (!shareData.name || !shareData.birthDate || !shareData.birthTime) {
      throw new Error('数据格式不正确，缺少必要字段');
    }
    await apiImportProfile(shareData);
    await profileStore.loadProfiles();
    showImportDialog.value = false;
    importJson.value = '';
    toast.success(`已导入「${shareData.name}」`);
  } catch (err) {
    importError.value = errorMessage(err, '导入失败');
  } finally {
    importing.value = false;
  }
}

function decodeQrFromImageData(imageData: ImageData): string | null {
  const code = jsQR(imageData.data, imageData.width, imageData.height);
  return code?.data || null;
}

async function handlePasteImage(e: ClipboardEvent) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const blob = item.getAsFile();
      if (!blob) continue;
      await decodeQrFromBlob(blob);
      return;
    }
  }
}

async function handleFileSelect(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  if (!file) return;
  await decodeQrFromBlob(file);
  input.value = '';
}

async function decodeQrFromBlob(blob: Blob) {
  importError.value = '';
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = decodeQrFromImageData(imgData);
  if (result) {
    importJson.value = result;
  } else {
    importError.value = '未能识别二维码，请确保图片清晰';
  }
}

async function startScan() {
  importError.value = '';
  try {
    scanStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
    });
    scanning.value = true;
    await new Promise(r => setTimeout(r, 100));
    const video = videoRef.value;
    if (!video) return;
    video.srcObject = scanStream;
    await video.play();
    scanFrame(video);
  } catch {
    importError.value = '无法访问摄像头';
    stopScan();
  }
}

function scanFrame(video: HTMLVideoElement) {
  if (!scanning.value) return;
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  if (canvas.width === 0) {
    scanRafId = requestAnimationFrame(() => scanFrame(video));
    return;
  }
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(video, 0, 0);
  const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const result = decodeQrFromImageData(imgData);
  if (result) {
    importJson.value = result;
    stopScan();
    return;
  }
  scanRafId = requestAnimationFrame(() => scanFrame(video));
}

function stopScan() {
  scanning.value = false;
  cancelAnimationFrame(scanRafId);
  if (scanStream) {
    scanStream.getTracks().forEach(t => t.stop());
    scanStream = null;
  }
}
</script>

<template>
  <div class="page page-medium profile-page">
    <PageHeader title="命盘档案" subtitle="管理命主出生信息，选中的档案将用于运势与 AI 对话">
      <template #actions>
        <button class="btn btn-secondary" @click="openImport">
          <Download :size="16" />
          导入
        </button>
        <button class="btn btn-primary" @click="openCreate">
          <Plus :size="17" />
          新建档案
        </button>
      </template>
    </PageHeader>

    <!-- Profile grid -->
    <div v-if="profileStore.profiles.length" class="profile-grid">
      <div
        v-for="p in profileStore.profiles"
        :key="p.profileId"
        class="card profile-card"
        :class="{ active: p.profileId === profileStore.currentProfileId }"
        role="button"
        tabindex="0"
        @click="profileStore.switchProfile(p.profileId)"
        @keydown.enter="profileStore.switchProfile(p.profileId)"
      >
        <div class="pc-top">
          <span class="pc-avatar" :class="p.gender">{{ p.name.slice(0, 1) }}</span>
          <div class="pc-title">
            <div class="pc-name">
              <span class="pc-name-text">{{ p.name }}</span>
              <span v-if="p.isPrimary" class="badge badge-solid">主档案</span>
            </div>
            <div class="pc-sub">{{ p.relation }} · {{ p.gender === 'male' ? '男' : '女' }}</div>
          </div>
          <CheckCircle2 v-if="p.profileId === profileStore.currentProfileId" :size="18" class="pc-current" />
        </div>

        <ul class="pc-info">
          <li><CalendarDays :size="14" /> {{ p.birthDate }}</li>
          <li><Clock :size="14" /> {{ p.birthTime }}</li>
          <li class="pc-place"><MapPin :size="14" /> <span>{{ p.birthPlace || '—' }}</span></li>
        </ul>

        <div class="pc-foot">
          <button class="pc-detail" @click.stop="router.push(`/profile/${p.profileId}/natal`)">
            <BookOpen :size="14" />
            本命详解
          </button>
          <div class="pc-actions">
            <button class="btn-icon sm" title="编辑" aria-label="编辑档案" @click.stop="openEdit(p)">
              <Pencil :size="15" />
            </button>
            <button class="btn-icon sm" title="二维码分享" aria-label="二维码分享" @click.stop="handleShare(p.profileId)">
              <QrCode :size="15" />
            </button>
            <button
              v-if="!p.isPrimary"
              class="btn-icon sm danger"
              title="删除"
              aria-label="删除档案"
              @click.stop="handleDelete(p)"
            >
              <Trash2 :size="15" />
            </button>
          </div>
        </div>
      </div>

      <button class="profile-add" @click="openCreate">
        <UserPlus :size="22" />
        <span>添加命主</span>
      </button>
    </div>

    <div v-else class="card">
      <EmptyState :icon="UserPlus" title="还没有档案" description="录入出生日期、时间与地点，天枢将为你排出八字与紫微命盘。">
        <template #actions>
          <button class="btn btn-primary" @click="openCreate"><Plus :size="16" /> 新建档案</button>
          <button class="btn btn-secondary" @click="openImport"><Download :size="16" /> 导入档案</button>
        </template>
      </EmptyState>
    </div>

    <!-- Charts for selected profile -->
    <section v-if="profileStore.currentProfile" class="charts-section">
      <div class="charts-head">
        <h2 class="section-title">
          <span class="text-accent">{{ profileStore.currentProfile.name }}</span> 的命盘
        </h2>
        <div class="tabs">
          <button class="tab" :class="{ active: chartTab === 'bazi' }" @click="chartTab = 'bazi'">八字</button>
          <button class="tab" :class="{ active: chartTab === 'ziwei' }" @click="chartTab = 'ziwei'">紫微</button>
          <button class="tab" :class="{ active: chartTab === 'astro' }" @click="chartTab = 'astro'">星盘</button>
        </div>
      </div>

      <div v-if="chartTab !== 'astro' && chartLoading" class="card"><LoadingSpinner>排盘计算中…</LoadingSpinner></div>
      <div v-else-if="chartTab !== 'astro' && chartError" class="alert alert-error">{{ chartError }}</div>
      <template v-else>
        <BaziChartCard
          v-if="chartTab === 'bazi' && baziChart"
          :chart="baziChart"
          :profile-id="profileStore.currentProfileId || undefined"
        />
        <ZiweiChartCard v-if="chartTab === 'ziwei' && ziweiChart" :chart="ziweiChart" />
      </template>
      <!-- 星盘 loads its own data (independent of the bazi/ziwei request) -->
      <AstroChartCard
        v-if="chartTab === 'astro' && profileStore.currentProfileId"
        :profile-id="profileStore.currentProfileId"
        :version="astroVersion"
        @edit-place="profileStore.currentProfile && openEdit(profileStore.currentProfile, true)"
      />
    </section>

    <!-- Create / Edit -->
    <AppModal v-model:open="showForm" :title="editingProfileId ? '编辑档案' : '新建档案'" size="lg">
      <form id="profile-form" @submit.prevent="handleSubmitForm">
        <ProfileFormFields v-model="form" :advanced-open="formAdvancedOpen" />
        <div v-if="formError" class="alert alert-error form-alert">{{ formError }}</div>
      </form>
      <template #footer>
        <button type="button" class="btn btn-secondary" @click="showForm = false">取消</button>
        <button type="submit" form="profile-form" class="btn btn-primary" :disabled="saving">
          {{ saving ? '保存中…' : editingProfileId ? '保存' : '创建' }}
        </button>
      </template>
    </AppModal>

    <!-- QR Share -->
    <AppModal v-model:open="showShareDialog" :title="`分享档案 · ${shareName}`">
      <div class="qr-body">
        <div class="qr-frame">
          <img :src="shareQrUrl" alt="档案二维码" class="qr-image" />
        </div>
        <p class="qr-hint">对方在「导入」中扫码、上传图片或粘贴数据即可添加此档案</p>
        <div class="qr-btn-row">
          <button class="btn btn-secondary btn-sm" @click="copyQrImage">
            <component :is="copiedImg ? Check : Copy" :size="14" />
            {{ copiedImg ? '已复制' : '复制图片' }}
          </button>
          <button class="btn btn-secondary btn-sm" @click="downloadQrImage">
            <Download :size="14" />
            下载图片
          </button>
          <button class="btn btn-secondary btn-sm" @click="copyShareData">
            <component :is="copiedText ? Check : Copy" :size="14" />
            {{ copiedText ? '已复制' : '复制数据' }}
          </button>
        </div>
        <code class="share-json">{{ shareJson }}</code>
      </div>
    </AppModal>

    <!-- Import -->
    <AppModal v-model:open="showImportDialog" title="导入档案">
      <div class="import-body">
        <div class="import-methods">
          <button class="import-method" @click="fileInputRef?.click()">
            <ImageIcon :size="20" />
            <span>选择二维码图片</span>
          </button>
          <button class="import-method" :class="{ active: scanning }" @click="scanning ? stopScan() : startScan()">
            <Camera :size="20" />
            <span>{{ scanning ? '停止扫码' : '摄像头扫码' }}</span>
          </button>
        </div>
        <input ref="fileInputRef" type="file" accept="image/*" hidden @change="handleFileSelect" />
        <video v-if="scanning" ref="videoRef" class="scan-video" playsinline muted></video>
        <div class="form-group">
          <label>或粘贴档案数据（也可在此 Ctrl+V 粘贴二维码图片）</label>
          <textarea
            v-model="importJson"
            class="input import-textarea"
            rows="5"
            placeholder='{"version":1,"name":"...","birthDate":"...","birthTime":"...","gender":"male","birthPlace":"...","timezone":"..."}'
            @paste="handlePasteImage"
          ></textarea>
        </div>
        <div v-if="importError" class="alert alert-error">{{ importError }}</div>
      </div>
      <template #footer>
        <button class="btn btn-secondary" @click="showImportDialog = false">取消</button>
        <button class="btn btn-primary" :disabled="importing || !importJson.trim()" @click="handleImport">
          {{ importing ? '导入中…' : '导入' }}
        </button>
      </template>
    </AppModal>
  </div>
</template>

<style scoped>
/* ── Profile grid ── */
.profile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
  gap: var(--space-md);
}

.profile-card {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: var(--space-md) var(--space-md) 10px;
  cursor: pointer;
  transition: border-color var(--transition-fast), box-shadow var(--transition-fast), transform var(--transition-fast);
}
.profile-card:hover { box-shadow: var(--shadow-md); border-color: var(--color-border-strong); }
.profile-card.active {
  border-color: var(--color-accent);
  box-shadow: 0 0 0 3px var(--color-accent-soft), var(--shadow-sm);
}

.pc-top { display: flex; align-items: center; gap: 12px; }
.pc-avatar {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  flex-shrink: 0;
  border-radius: 50%;
  font-family: var(--font-serif);
  font-size: 1.2rem;
  font-weight: 700;
  background: var(--color-bg-tertiary);
  color: var(--color-text-secondary);
}
.pc-avatar.male { background: var(--color-info-soft); color: var(--color-info); }
.pc-avatar.female { background: var(--color-error-soft); color: var(--color-error); }
.pc-title { flex: 1; min-width: 0; }
.pc-name { display: flex; align-items: center; gap: 6px; }
.pc-name-text {
  font-family: var(--font-serif);
  font-size: 1.08rem;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pc-sub { font-size: 0.78rem; color: var(--color-text-muted); margin-top: 1px; }
.pc-current { color: var(--color-accent); flex-shrink: 0; align-self: flex-start; }

.pc-info {
  display: flex;
  flex-wrap: wrap;
  gap: 6px 14px;
  font-size: 0.82rem;
  color: var(--color-text-secondary);
}
.pc-info li { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.pc-info li :deep(svg) { color: var(--color-text-muted); flex-shrink: 0; }
.pc-place { flex-basis: 100%; }
.pc-place span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }

.pc-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-top: auto;
  padding-top: 8px;
  border-top: 1px dashed var(--color-border);
}
.pc-detail {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  height: 30px;
  padding: 0 10px 0 8px;
  margin-left: -8px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-accent);
  font-size: 0.82rem;
  font-weight: 500;
  cursor: pointer;
}
.pc-detail:hover { background: var(--color-accent-soft); }
.pc-actions { display: flex; gap: 2px; }

.profile-add {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  min-height: 170px;
  border: 1.5px dashed var(--color-border-strong);
  border-radius: var(--radius-lg);
  background: transparent;
  color: var(--color-text-muted);
  font-size: 0.88rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.profile-add:hover { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-soft); }

/* ── Charts ── */
.charts-section { margin-top: var(--space-xl); }
.charts-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--space-md);
  flex-wrap: wrap;
  margin-bottom: var(--space-md);
}
.charts-head .section-title { margin-bottom: 0; }

/* ── Modals ── */
.form-alert { margin-top: var(--space-md); }

.qr-body { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
.qr-frame {
  padding: 10px;
  border-radius: var(--radius-lg);
  background: #fff;
  border: 1px solid var(--color-border);
  box-shadow: var(--shadow-sm);
}
.qr-image { width: 220px; height: 220px; }
.qr-hint { font-size: 0.82rem; color: var(--color-text-muted); max-width: 320px; line-height: 1.6; }
.qr-btn-row { display: flex; gap: 8px; flex-wrap: wrap; justify-content: center; }
.share-json {
  display: block;
  width: 100%;
  max-height: 72px;
  overflow-y: auto;
  padding: 8px 10px;
  border-radius: var(--radius-sm);
  background: var(--color-bg-tertiary);
  color: var(--color-text-muted);
  font-family: var(--font-mono);
  font-size: 0.7rem;
  text-align: left;
  word-break: break-all;
}

.import-body { display: flex; flex-direction: column; gap: 14px; }
.import-methods { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
.import-method {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 14px 8px;
  border: 1px solid var(--color-border-strong);
  border-radius: var(--radius-md);
  background: var(--color-bg-secondary);
  color: var(--color-text-secondary);
  font-size: 0.84rem;
  cursor: pointer;
  transition: all var(--transition-fast);
}
.import-method:hover, .import-method.active { border-color: var(--color-accent); color: var(--color-accent); background: var(--color-accent-soft); }
.import-textarea { font-family: var(--font-mono); font-size: 0.8rem; line-height: 1.5; }
.scan-video {
  width: 100%;
  max-height: 240px;
  border-radius: var(--radius-md);
  background: #000;
  object-fit: cover;
}

@media (max-width: 640px) {
  .profile-grid { grid-template-columns: 1fr; gap: var(--space-sm); }
  .profile-add { min-height: 64px; flex-direction: row; }
  .charts-section { margin-top: var(--space-lg); }
  .qr-image { width: 200px; height: 200px; }
}
</style>
