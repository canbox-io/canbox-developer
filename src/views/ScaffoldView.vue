<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const form = ref({
    name: '',
    description: '',
    author: '',
    targetDir: ''
});

const creating = ref(false);

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
        ElMessage.warning(t('scaffold.nameRequired'));
        return;
    }
    if (!form.value.targetDir) {
        ElMessage.warning(t('scaffold.dirRequired'));
        return;
    }

    creating.value = true;
    try {
        const result = await window.api.developer.scaffoldCreate(
            form.value.targetDir,
            {
                name: form.value.name,
                description: form.value.description,
                author: form.value.author
            }
        );
        if (result.success) {
            ElMessage.success(t('scaffold.createSuccess'));
            form.value = { name: '', description: '', author: '', targetDir: '' };
        } else {
            ElMessage.error(result.error || t('scaffold.createFailed'));
        }
    } finally {
        creating.value = false;
    }
}
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
