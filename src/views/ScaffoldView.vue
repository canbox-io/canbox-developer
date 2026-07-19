<script setup>
import { ref, onMounted } from 'vue';
import { useI18n } from 'vue-i18n';
import notification from '@/utils/notification';

const { t } = useI18n();
const form = ref({
    name: '',
    description: '',
    author: '',
    targetDir: '',
    electronVersion: ''
});

const creating = ref(false);
const electronVersions = ref([]);

async function selectDirectory() {
    const result = await window.api.developer.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        form.value.targetDir = result.filePaths[0];
    }
}

async function createProject() {
    if (!form.value.name) {
        notification.warning(t('scaffold.nameRequired'));
        return;
    }
    if (!form.value.targetDir) {
        notification.warning(t('scaffold.dirRequired'));
        return;
    }
    if (!form.value.electronVersion) {
        notification.warning(t('scaffold.electronRequired'));
        return;
    }

    creating.value = true;
    try {
        const result = await window.api.developer.scaffoldCreate(
            form.value.targetDir,
            {
                name: form.value.name,
                description: form.value.description,
                author: form.value.author,
                electronRange: form.value.electronVersion
            }
        );
        if (result.success) {
            notification.success(t('scaffold.createSuccess'));
            form.value = { name: '', description: '', author: '', targetDir: '', electronVersion: '' };
        } else {
            notification.error(result.error || t('scaffold.createFailed'));
        }
    } finally {
        creating.value = false;
    }
}

onMounted(async () => {
    // 加载 canbox 白名单中的 electron 版本列表
    const result = await window.api.developer.electronListAllowed();
    if (result.success && result.versions.length > 0) {
        electronVersions.value = result.versions;
        // 默认选第一个（最高版本，通常也是 builtin 版本）
        form.value.electronVersion = result.versions[0];
    }
});
</script>

<template>
    <div class="scaffold-view">
        <header class="view-header">
            <h1>{{ t('scaffold.title') }}</h1>
            <el-button text @click="$router.push('/')">&larr; {{ t('scaffold.back') }}</el-button>
        </header>
        <main class="view-body">
            <el-form :model="form" label-width="100px" style="max-width: 500px;">
                <el-form-item :label="t('scaffold.appName')">
                    <el-input v-model="form.name" :placeholder="t('scaffold.appNamePlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.description')">
                    <el-input v-model="form.description" :placeholder="t('scaffold.descriptionPlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.author')">
                    <el-input v-model="form.author" :placeholder="t('scaffold.authorPlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.targetDir')">
                    <el-input v-model="form.targetDir" :placeholder="t('scaffold.targetDirPlaceholder')" readonly>
                        <template #append>
                            <el-button @click="selectDirectory">{{ t('scaffold.browse') }}</el-button>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item :label="t('scaffold.electronVersion')">
                    <el-select v-model="form.electronVersion" :placeholder="t('scaffold.electronPlaceholder')" style="width: 100%;">
                        <el-option
                            v-for="ver in electronVersions"
                            :key="ver"
                            :label="ver"
                            :value="ver"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" :loading="creating" @click="createProject">
                        {{ t('scaffold.create') }}
                    </el-button>
                </el-form-item>
            </el-form>
        </main>
    </div>
</template>

<style scoped>
.scaffold-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid #ebeef5;
}
.view-header h1 {
    margin: 0;
    font-size: 18px;
}
.view-body {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}
</style>
