<script setup lang="ts">
import { computed, useId } from 'vue';
import type { TarotCard, TarotSuit } from '../../../shared/types/tarot.types';

/*
 * 程序化绘制的原创牌面（天枢风格：宣纸/夜墨底 + 鎏金线条）。
 * 大阿卡纳：每张一枚象征性几何纹样；小阿卡纳：点数排列或宫廷牌徽记。
 */
const props = defineProps<{ card: TarotCard }>();

const gid = `tf-${useId()}`;
const ROMAN = ['0', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI', 'XVII', 'XVIII', 'XIX', 'XX', 'XXI'];
const CN_NUM = ['', '首', '二', '三', '四', '五', '六', '七', '八', '九', '十', '侍从', '骑士', '王后', '国王'];

const isMajor = computed(() => props.card.arcana === 'major');
const suit = computed<TarotSuit | undefined>(() => props.card.suit);
const numLabel = computed(() => (isMajor.value ? ROMAN[props.card.number] : CN_NUM[props.card.number]));
const isCourt = computed(() => !isMajor.value && props.card.number > 10);

// Pip centres for 1–10 inside the central panel (60, 100)
const PIPS: Record<number, [number, number][]> = {
  1: [[60, 100]],
  2: [[60, 70], [60, 130]],
  3: [[60, 64], [60, 100], [60, 136]],
  4: [[43, 72], [77, 72], [43, 128], [77, 128]],
  5: [[43, 70], [77, 70], [60, 100], [43, 130], [77, 130]],
  6: [[43, 66], [77, 66], [43, 100], [77, 100], [43, 134], [77, 134]],
  7: [[43, 64], [77, 64], [60, 82], [43, 100], [77, 100], [43, 136], [77, 136]],
  8: [[43, 62], [77, 62], [60, 80], [43, 100], [77, 100], [60, 120], [43, 138], [77, 138]],
  9: [[43, 62], [77, 62], [43, 87], [77, 87], [60, 100], [43, 113], [77, 113], [43, 138], [77, 138]],
  10: [[43, 60], [77, 60], [60, 75], [43, 90], [77, 90], [43, 110], [77, 110], [60, 125], [43, 140], [77, 140]],
};
const pips = computed(() => (isMajor.value || isCourt.value ? [] : PIPS[props.card.number] || []));
const pipScale = computed(() => (props.card.number === 1 ? 2.2 : props.card.number <= 3 ? 1.05 : 0.85));

function star(cx: number, cy: number, R: number, r: number, n = 4, rot = -90): string {
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const a = ((rot + (180 / n) * i) * Math.PI) / 180;
    const d = i % 2 ? r : R;
    pts.push(`${(cx + Math.cos(a) * d).toFixed(2)},${(cy + Math.sin(a) * d).toFixed(2)}`);
  }
  return pts.join(' ');
}
function rays(cx: number, cy: number, r1: number, r2: number, n: number, alt = false) {
  return Array.from({ length: n }, (_, i) => {
    const a = (Math.PI * 2 * i) / n;
    const rr = alt && i % 2 ? r1 + (r2 - r1) * 0.55 : r2;
    return { x1: cx + Math.cos(a) * r1, y1: cy + Math.sin(a) * r1, x2: cx + Math.cos(a) * rr, y2: cy + Math.sin(a) * rr };
  });
}
const pentagram = (cx: number, cy: number, r: number, inverted = false) =>
  Array.from({ length: 5 }, (_, i) => {
    const a = ((inverted ? 90 : -90) + i * 144) * (Math.PI / 180);
    return `${(cx + Math.cos(a) * r).toFixed(2)},${(cy + Math.sin(a) * r).toFixed(2)}`;
  }).join(' ');
</script>

<template>
  <svg class="tf" :class="[isMajor ? 'major' : `suit-${suit}`]" viewBox="0 0 120 200" role="img" :aria-label="card.nameZh">
    <defs>
      <linearGradient :id="`${gid}-bg`" x1="0" y1="0" x2="0.4" y2="1">
        <stop offset="0" class="bg1" />
        <stop offset="1" class="bg2" />
      </linearGradient>
    </defs>

    <!-- Card body & frames -->
    <rect x="1" y="1" width="118" height="198" rx="9" :fill="`url(#${gid}-bg)`" class="edge" />
    <rect x="6" y="6" width="108" height="188" rx="6" class="frame" />
    <rect x="9" y="9" width="102" height="182" rx="4" class="frame thin" />
    <g class="corner">
      <polygon :points="star(14, 14, 3.2, 1, 4)" /><polygon :points="star(106, 14, 3.2, 1, 4)" />
      <polygon :points="star(14, 186, 3.2, 1, 4)" /><polygon :points="star(106, 186, 3.2, 1, 4)" />
    </g>

    <!-- Number -->
    <text x="60" y="27" class="num" :class="{ cn: !isMajor }">{{ numLabel }}</text>
    <line x1="40" y1="34" x2="80" y2="34" class="rule" />

    <!-- Centre panel -->
    <rect x="22" y="44" width="76" height="112" rx="38" class="panel" />

    <!-- ── Major arcana emblems ── -->
    <g v-if="isMajor" class="em">
      <template v-if="card.number === 0">
        <circle cx="60" cy="96" r="26" class="dash" />
        <circle cx="80" cy="74" r="6" class="acc" />
        <line v-for="(r, i) in rays(80, 74, 8, 12, 8)" :key="i" v-bind="r" />
        <path d="M34 132 L64 132 L72 144" />
        <polygon :points="star(52, 100, 7, 2, 4)" class="gold" />
      </template>
      <template v-else-if="card.number === 1">
        <path d="M46 72 C46 63 57 63 60 72 C63 81 74 81 74 72 C74 63 63 63 60 72 C57 81 46 81 46 72Z" />
        <line x1="60" y1="86" x2="60" y2="134" class="bold" />
        <circle cx="60" cy="86" r="3" class="acc" /><circle cx="60" cy="134" r="3" class="gold" />
        <circle cx="38" cy="140" r="3" class="wx-f" /><circle cx="50" cy="143" r="3" class="wx-w" />
        <circle cx="70" cy="143" r="3" class="wx-a" /><circle cx="82" cy="140" r="3" class="wx-e" />
      </template>
      <template v-else-if="card.number === 2">
        <rect x="32" y="66" width="10" height="72" class="acc-fill" />
        <rect x="78" y="66" width="10" height="72" />
        <path d="M66 86 A15 15 0 1 0 66 114 A11 11 0 1 1 66 86Z" class="gold" />
      </template>
      <template v-else-if="card.number === 3">
        <circle cx="60" cy="86" r="14" />
        <line x1="60" y1="100" x2="60" y2="130" /><line x1="50" y1="116" x2="70" y2="116" />
        <path d="M34 136 Q36 110 30 92 M86 136 Q84 110 90 92" />
        <circle v-for="y in [98, 108, 118]" :key="`l${y}`" cx="32" :cy="y" r="2" class="acc" />
        <circle v-for="y in [98, 108, 118]" :key="`r${y}`" cx="88" :cy="y" r="2" class="acc" />
      </template>
      <template v-else-if="card.number === 4">
        <rect x="40" y="82" width="40" height="44" />
        <path d="M40 82 C30 82 28 68 38 66 C44 66 44 74 40 74 M80 82 C90 82 92 68 82 66 C76 66 76 74 80 74" />
        <circle cx="60" cy="104" r="7" class="acc" />
        <line x1="40" y1="136" x2="80" y2="136" class="bold" />
      </template>
      <template v-else-if="card.number === 5">
        <line x1="60" y1="64" x2="60" y2="126" class="bold" />
        <line x1="54" y1="74" x2="66" y2="74" /><line x1="51" y1="84" x2="69" y2="84" /><line x1="48" y1="94" x2="72" y2="94" />
        <line x1="44" y1="120" x2="76" y2="142" /><line x1="76" y1="120" x2="44" y2="142" />
        <circle cx="44" cy="120" r="3" class="gold" /><circle cx="76" cy="120" r="3" class="acc" />
      </template>
      <template v-else-if="card.number === 6">
        <polygon points="60,62 48,82 72,82" class="acc" />
        <circle cx="52" cy="108" r="17" /><circle cx="68" cy="108" r="17" />
        <path d="M60 94 A17 17 0 0 1 60 122 A17 17 0 0 1 60 94Z" class="gold" />
      </template>
      <template v-else-if="card.number === 7">
        <polygon :points="star(60, 70, 6, 2, 4)" class="gold" />
        <path d="M40 116 L40 86 Q60 76 80 86 L80 116 Z" />
        <circle cx="45" cy="126" r="9" /><circle cx="75" cy="126" r="9" />
        <circle cx="45" cy="126" r="2" class="acc" /><circle cx="75" cy="126" r="2" class="acc" />
      </template>
      <template v-else-if="card.number === 8">
        <path d="M49 70 C49 64 57 64 60 70 C63 76 71 76 71 70 C71 64 63 64 60 70 C57 76 49 76 49 70Z" />
        <circle cx="60" cy="112" r="14" class="acc" />
        <line v-for="(r, i) in rays(60, 112, 16, 23, 16, true)" :key="i" v-bind="r" />
      </template>
      <template v-else-if="card.number === 9">
        <line x1="80" y1="70" x2="80" y2="142" class="bold" />
        <line x1="60" y1="76" x2="60" y2="86" />
        <polygon :points="star(60, 102, 16, 16, 3, -90) " />
        <polygon :points="star(60, 102, 8, 3.5, 6)" class="gold" />
      </template>
      <template v-else-if="card.number === 10">
        <circle cx="60" cy="100" r="28" /><circle cx="60" cy="100" r="20" class="thin" />
        <circle cx="60" cy="100" r="7" class="acc" />
        <line v-for="(r, i) in rays(60, 100, 7, 28, 8)" :key="i" v-bind="r" />
      </template>
      <template v-else-if="card.number === 11">
        <line x1="60" y1="68" x2="60" y2="138" class="bold" /><line x1="34" y1="82" x2="86" y2="82" />
        <polygon :points="star(60, 68, 4, 1.5, 4)" class="gold" />
        <path d="M34 82 L28 104 M34 82 L40 104 M86 82 L80 104 M86 82 L92 104" class="thin" />
        <path d="M26 104 Q34 112 42 104 Z" class="acc" /><path d="M78 104 Q86 112 94 104 Z" class="acc" />
        <line x1="48" y1="138" x2="72" y2="138" class="bold" />
      </template>
      <template v-else-if="card.number === 12">
        <line x1="40" y1="66" x2="80" y2="66" class="bold" /><line x1="60" y1="66" x2="60" y2="80" />
        <polygon points="46,82 74,82 60,110" />
        <circle cx="60" cy="120" r="8" class="gold" />
        <line v-for="(r, i) in rays(60, 120, 11, 15, 10)" :key="i" v-bind="r" class="thin" />
      </template>
      <template v-else-if="card.number === 13">
        <path d="M38 74 Q62 58 84 80" class="bold" /><line x1="44" y1="70" x2="74" y2="140" />
        <rect x="30" y="116" width="10" height="26" /><rect x="80" y="116" width="10" height="26" />
        <path d="M46 138 A14 14 0 0 1 74 138 Z" class="acc" />
        <line v-for="(r, i) in rays(60, 138, 16, 22, 12).filter((x) => x.y2 < 136)" :key="i" v-bind="r" class="thin" />
      </template>
      <template v-else-if="card.number === 14">
        <path d="M34 104 L50 104 L47 118 L37 118 Z" /><path d="M70 82 L86 82 L83 96 L73 96 Z" />
        <path d="M49 104 C58 96 62 94 72 90" class="gold dash-flow" />
        <polygon points="60,122 52,136 68,136" class="acc" />
        <rect x="54" y="128" width="12" height="12" class="thin" />
      </template>
      <template v-else-if="card.number === 15">
        <circle cx="60" cy="94" r="24" />
        <polygon :points="pentagram(60, 94, 22, true)" class="acc-line" />
        <circle cx="50" cy="132" r="5" /><circle cx="60" cy="134" r="5" /><circle cx="70" cy="132" r="5" />
      </template>
      <template v-else-if="card.number === 16">
        <path d="M50 142 L50 88 L70 88 L70 142 Z" />
        <path d="M46 88 L50 80 L55 86 L60 78 L65 86 L70 80 L74 88 Z" class="acc" />
        <path d="M88 60 L72 78 L80 80 L64 98" class="bold gold-line" />
        <rect x="56" y="100" width="8" height="10" class="thin" /><rect x="56" y="118" width="8" height="10" class="thin" />
        <rect x="36" y="112" width="4" height="4" class="acc" /><rect x="82" y="120" width="4" height="4" class="acc" />
      </template>
      <template v-else-if="card.number === 17">
        <polygon :points="star(60, 92, 22, 7, 8)" class="gold" />
        <polygon v-for="(p, i) in [[36, 66], [84, 66], [30, 96], [90, 96], [38, 124], [82, 124], [60, 58]]" :key="i"
          :points="star(p[0], p[1], 5, 1.6, 8)" class="acc" />
        <path d="M32 140 Q46 132 60 140 T88 140" />
      </template>
      <template v-else-if="card.number === 18">
        <path d="M68 66 A22 22 0 1 0 68 110 A17 17 0 1 1 68 66Z" class="gold" />
        <rect x="30" y="118" width="9" height="24" /><rect x="81" y="118" width="9" height="24" />
        <path d="M60 144 Q52 134 60 126 Q68 118 60 112" />
        <line v-for="x in [50, 60, 70]" :key="x" :x1="x" y1="96" :x2="x" y2="102" class="thin" />
      </template>
      <template v-else-if="card.number === 19">
        <circle cx="60" cy="98" r="16" class="acc" />
        <line v-for="(r, i) in rays(60, 98, 19, 32, 16, true)" :key="i" v-bind="r" class="bold" />
      </template>
      <template v-else-if="card.number === 20">
        <path d="M38 66 L70 88 L78 80 Q80 96 70 102 L66 92 L34 72 Z" class="gold" />
        <line v-for="(r, i) in rays(74, 94, 12, 20, 7).filter((x) => x.y2 > 96)" :key="i" v-bind="r" class="thin" />
        <line x1="30" y1="134" x2="90" y2="134" />
        <circle cx="44" cy="126" r="5" /><circle cx="60" cy="124" r="5" class="acc" /><circle cx="76" cy="126" r="5" />
      </template>
      <template v-else-if="card.number === 21">
        <ellipse cx="60" cy="100" rx="20" ry="32" class="wreath" />
        <polygon :points="star(60, 100, 9, 3, 4)" class="gold" />
        <circle v-for="(p, i) in [[34, 66], [86, 66], [34, 134], [86, 134]]" :key="i" :cx="p[0]" :cy="p[1]" r="4" class="acc" />
      </template>
    </g>

    <!-- ── Minor arcana: pips ── -->
    <g v-else-if="!isCourt" class="pips">
      <g v-for="(p, i) in pips" :key="i" :transform="`translate(${p[0]} ${p[1]}) scale(${pipScale})`">
        <use :href="`#${gid}-${suit}`" />
      </g>
    </g>

    <!-- ── Minor arcana: court cards ── -->
    <g v-else class="court">
      <g transform="translate(60 108) scale(2.1)"><use :href="`#${gid}-${suit}`" /></g>
      <polygon v-if="card.number === 11" :points="star(60, 70, 6, 2, 4)" class="gold" />
      <path v-else-if="card.number === 12" d="M46 76 L60 64 L74 76 M50 80 L60 72 L70 80" class="bold" />
      <path v-else-if="card.number === 13" d="M44 74 L48 64 L54 72 L60 62 L66 72 L72 64 L76 74 Z M50 60 A10 5 0 0 0 70 60" class="gold" />
      <path v-else d="M42 76 L42 64 L50 70 L60 58 L70 70 L78 64 L78 76 Z" class="acc" />
    </g>

    <!-- Suit glyphs (drawn in a ±10 box) -->
    <defs>
      <g :id="`${gid}-wands`" class="glyph wands">
        <line x1="0" y1="-10" x2="0" y2="10" />
        <ellipse cx="-3.2" cy="-4" rx="2.4" ry="1.2" transform="rotate(-35 -3.2 -4)" class="fill" />
        <ellipse cx="3.2" cy="0" rx="2.4" ry="1.2" transform="rotate(35 3.2 0)" class="fill" />
        <circle cx="0" cy="-10.5" r="1.3" class="fill" />
      </g>
      <g :id="`${gid}-cups`" class="glyph cups">
        <path d="M-7 -8 H7 C7 -1 3.5 2 0 2 C-3.5 2 -7 -1 -7 -8 Z" class="fill-soft" />
        <line x1="0" y1="2" x2="0" y2="7" /><line x1="-4.5" y1="8" x2="4.5" y2="8" />
      </g>
      <g :id="`${gid}-swords`" class="glyph swords">
        <path d="M0 -11 L1.8 -8 L1.8 4 L-1.8 4 L-1.8 -8 Z" class="fill-soft" />
        <line x1="-5.5" y1="4" x2="5.5" y2="4" /><line x1="0" y1="4" x2="0" y2="9" />
        <circle cx="0" cy="10" r="1.3" class="fill" />
      </g>
      <g :id="`${gid}-pentacles`" class="glyph pentacles">
        <circle cx="0" cy="0" r="8.5" class="fill-soft" />
        <polygon :points="pentagram(0, 0, 6.8)" />
      </g>
    </defs>

    <!-- Name -->
    <line x1="30" y1="166" x2="90" y2="166" class="rule" />
    <text x="60" y="180" class="name">{{ card.nameZh }}</text>
    <text x="60" y="189" class="en">{{ card.nameEn.toUpperCase() }}</text>
  </svg>
</template>

<style scoped>
.tf {
  --tf-bg1: #fcf7ec;
  --tf-bg2: #efe2c6;
  --tf-line: #a8792b;
  --tf-ink: #3b2c1b;
  --tf-panel: rgba(168, 121, 43, 0.07);
  --tf-acc: var(--color-seal);
  display: block;
  width: 100%;
  height: 100%;
}
:global(html[data-theme='dark'] svg.tf) {
  --tf-bg1: #232839;
  --tf-bg2: #12151e;
  --tf-line: #e0b56a;
  --tf-ink: #efe3c8;
  --tf-panel: rgba(224, 181, 106, 0.07);
}
.suit-wands { --tf-acc: var(--wx-fire); }
.suit-cups { --tf-acc: var(--wx-water); }
.suit-swords { --tf-acc: var(--color-info); }
.suit-pentacles { --tf-acc: var(--wx-earth); }

.bg1 { stop-color: var(--tf-bg1); }
.bg2 { stop-color: var(--tf-bg2); }
.edge { stroke: var(--tf-line); stroke-opacity: 0.45; stroke-width: 1; }
.frame { fill: none; stroke: var(--tf-line); stroke-width: 1.1; }
.frame.thin { stroke-width: 0.5; stroke-opacity: 0.7; }
.corner polygon { fill: var(--tf-line); }
.rule { stroke: var(--tf-line); stroke-width: 0.6; stroke-opacity: 0.7; }
.panel { fill: var(--tf-panel); stroke: var(--tf-line); stroke-width: 0.5; stroke-opacity: 0.4; }

.num { fill: var(--tf-line); font-family: var(--font-serif); font-size: 12px; font-weight: 700; text-anchor: middle; letter-spacing: 0.08em; }
.num.cn { font-size: 10.5px; }
.name { fill: var(--tf-ink); font-family: var(--font-serif); font-size: 11.5px; font-weight: 700; text-anchor: middle; letter-spacing: 0.1em; }
.en { fill: var(--tf-line); font-family: var(--font-sans); font-size: 5px; text-anchor: middle; letter-spacing: 0.14em; }

.em, .court { fill: none; stroke: var(--tf-line); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
.em .thin, .court .thin { stroke-width: 0.9; }
.em .bold, .court .bold { stroke-width: 2.4; }
.em .dash { stroke-dasharray: 3 3; }
.em .dash-flow { stroke-dasharray: 2 2.5; fill: none; }
.em .acc, .court .acc { fill: var(--tf-acc); stroke: var(--tf-acc); }
.em .acc-fill { fill: var(--tf-acc); fill-opacity: 0.85; stroke: var(--tf-acc); }
.em .acc-line { stroke: var(--tf-acc); }
.em .gold, .court .gold { fill: var(--tf-line); fill-opacity: 0.9; }
.em .gold-line { stroke: var(--tf-line); fill: none; }
.em .wreath { stroke-width: 3; stroke-dasharray: 5 2.5; }
.em .wx-f { fill: var(--wx-fire); stroke: none; }
.em .wx-w { fill: var(--wx-water); stroke: none; }
.em .wx-a { fill: var(--color-info); stroke: none; }
.em .wx-e { fill: var(--wx-earth); stroke: none; }

.glyph { fill: none; stroke: var(--tf-acc); stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }
.glyph .fill { fill: var(--tf-acc); }
.glyph .fill-soft { fill: var(--tf-acc); fill-opacity: 0.18; }
</style>
