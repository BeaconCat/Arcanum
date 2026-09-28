import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import type { Profile } from '../../shared/types/profile.types';
import { apiListProfiles } from '../api/profile.api';

export const useProfileStore = defineStore('profile', () => {
  const profiles = ref<Profile[]>([]);
  const currentProfileId = ref<string | null>(localStorage.getItem('arcanum.currentProfileId'));

  const currentProfile = computed(() =>
    profiles.value.find((p) => p.profileId === currentProfileId.value) || null,
  );

  const primaryProfile = computed(() =>
    profiles.value.find((p) => p.isPrimary) || null,
  );

  async function loadProfiles() {
    profiles.value = await apiListProfiles();
    if (!profiles.value.some(p => p.profileId === currentProfileId.value) && profiles.value.length > 0) {
      currentProfileId.value = profiles.value[0].profileId;
      localStorage.setItem('arcanum.currentProfileId', currentProfileId.value);
    }
  }

  function switchProfile(profileId: string) {
    currentProfileId.value = profileId;
    localStorage.setItem('arcanum.currentProfileId', profileId);
  }

  return { profiles, currentProfileId, currentProfile, primaryProfile, loadProfiles, switchProfile };
});
