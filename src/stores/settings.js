import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref({
        language: 'zh-CN',
        zoomFactor: 1.0
    });
    const loading = ref(false);

    async function fetchSettings() {
        loading.value = true;
        try {
            const data = await window.api.developer.settingsGetAll();
            settings.value = { ...settings.value, ...data };
        } finally {
            loading.value = false;
        }
    }

    async function setSetting(key, value) {
        await window.api.developer.settingsSet(key, value);
        settings.value[key] = value;
    }

    return {
        settings,
        loading,
        fetchSettings,
        setSetting
    };
});
