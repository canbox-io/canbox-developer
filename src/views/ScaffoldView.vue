<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';
import notification from '@/utils/notification';

const router = useRouter();
const { t } = useI18n();

const CATEGORY_OPTIONS = [
    { value: 'other', label: t('scaffold.categoryOther') },
    { value: 'development', label: t('scaffold.categoryDevelopment') },
    { value: 'utility', label: t('scaffold.categoryUtility') },
    { value: 'office', label: t('scaffold.categoryOffice') },
    { value: 'network', label: t('scaffold.categoryNetwork') },
    { value: 'audio', label: t('scaffold.categoryAudio') },
    { value: 'video', label: t('scaffold.categoryVideo') },
    { value: 'game', label: t('scaffold.categoryGame') },
    { value: 'graphics', label: t('scaffold.categoryGraphics') },
    { value: 'education', label: t('scaffold.categoryEducation') }
];

// 技术栈：默认 Vue 3 + Vite + JS，其次 Vue 3 + TS，最后原生 JS（无构建）
const TEMPLATE_OPTIONS = [
    { value: 'vue3-js', label: t('scaffold.templateVue3Js') },
    { value: 'vue3-ts', label: t('scaffold.templateVue3Ts') },
    { value: 'vanilla-js', label: t('scaffold.templateVanilla') }
];

// 设置打开方式：切换界面 / 弹层 / 新窗口
const SETTINGS_MODE_OPTIONS = [
    { value: 'view', label: t('scaffold.settingsModeView') },
    { value: 'modal', label: t('scaffold.settingsModeModal') },
    { value: 'window', label: t('scaffold.settingsModeWindow') }
];

// APP 名称需可作为 package.json 的 name，仅允许字母数字与 . _ -
const NAME_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/;

const form = ref({
    name: '',
    displayName: '',
    description: '',
    author: '',
    template: 'vue3-js',
    settingsMode: 'view',
    targetDir: '',
    electronVersion: '',
    category: 'other'
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

/** 主进程返回的错误码 → i18n 文案 */
function errorText(result) {
    const byCode = {
        NAME_REQUIRED: t('scaffold.nameRequired'),
        INVALID_NAME: t('scaffold.nameInvalid'),
        DIR_REQUIRED: t('scaffold.dirRequired'),
        DIR_NOT_EMPTY: t('scaffold.dirNotEmpty')
    };
    return byCode[result.code] || result.error || t('scaffold.createFailed');
}

async function createProject() {
    if (!form.value.name) {
        notification.warning(t('scaffold.nameRequired'));
        return;
    }
    if (!NAME_PATTERN.test(form.value.name)) {
        notification.warning(t('scaffold.nameInvalid'));
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
                displayName: form.value.displayName.trim(),
                description: form.value.description,
                author: form.value.author,
                template: form.value.template,
                settingsMode: form.value.settingsMode,
                electronRange: form.value.electronVersion,
                category: form.value.category
            }
        );
        if (!result.success) {
            notification.error(errorText(result));
            return;
        }

        // 创建成功后直接加入开发项目列表，便于回到列表即可运行
        const addResult = await window.api.developer.addApp(result.sourceDir);
        if (addResult.success || addResult.code === 'APP_ALREADY_ADDED') {
            notification.success(t('scaffold.createSuccess'));
        } else {
            notification.warning(addResult.error || t('scaffold.addAfterCreateFailed'));
        }

        // 退出「新建项目」界面，回到开发项目列表
        router.push('/');
    } finally {
        creating.value = false;
    }
}

// Esc 退出「新建 APP」界面
function onKeydown(event) {
    if (event.key !== 'Escape') return;
    // 焦点在下拉框内时，Esc 交由组件收起下拉，不退出页面
    if (event.target instanceof Element && event.target.closest('.el-select')) return;
    router.push('/');
}

onMounted(async () => {
    // 加载 canbox 白名单中的 electron 版本列表
    const result = await window.api.developer.electronListAllowed();
    if (result.success && result.versions.length > 0) {
        electronVersions.value = result.versions;
        // 默认选第一个（最高版本，通常也是 builtin 版本）
        form.value.electronVersion = result.versions[0];
    }
    document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
});
</script>

<template>
    <div class="scaffold-view">
        <header class="view-header">
            <h1>{{ t('scaffold.title') }}</h1>
            <el-button text @click="$router.push('/')">&larr; {{ t('scaffold.back') }}</el-button>
        </header>
        <main class="view-body">
            <el-form :model="form" label-width="100px" style="max-width: 560px;">
                <el-form-item :label="t('scaffold.appName')" required>
                    <el-input v-model="form.name" :placeholder="t('scaffold.appNamePlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.displayName')">
                    <el-input v-model="form.displayName" :placeholder="t('scaffold.displayNamePlaceholder')" />
                    <div class="form-hint">{{ t('scaffold.displayNameHint') }}</div>
                </el-form-item>
                <el-form-item :label="t('scaffold.description')">
                    <el-input v-model="form.description" :placeholder="t('scaffold.descriptionPlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.author')">
                    <el-input v-model="form.author" :placeholder="t('scaffold.authorPlaceholder')" />
                </el-form-item>
                <el-form-item :label="t('scaffold.template')">
                    <el-select v-model="form.template" style="width: 100%;">
                        <el-option
                            v-for="opt in TEMPLATE_OPTIONS"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                </el-form-item>
                <el-form-item :label="t('scaffold.settingsMode')">
                    <el-select v-model="form.settingsMode" style="width: 100%;">
                        <el-option
                            v-for="opt in SETTINGS_MODE_OPTIONS"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
                        />
                    </el-select>
                    <div class="form-hint">{{ t('scaffold.settingsModeHint') }}</div>
                </el-form-item>
                <el-form-item :label="t('scaffold.targetDir')" required>
                    <el-input v-model="form.targetDir" :placeholder="t('scaffold.targetDirPlaceholder')" readonly>
                        <template #append>
                            <el-button @click="selectDirectory">{{ t('scaffold.browse') }}</el-button>
                        </template>
                    </el-input>
                    <div class="form-hint">{{ t('scaffold.targetDirHint') }}</div>
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
                <el-form-item :label="t('scaffold.category')">
                    <el-select v-model="form.category" style="width: 100%;">
                        <el-option
                            v-for="opt in CATEGORY_OPTIONS"
                            :key="opt.value"
                            :label="opt.label"
                            :value="opt.value"
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
.form-hint {
    width: 100%;
    margin-top: 4px;
    color: #909399;
    font-size: 12px;
    line-height: 1.5;
}
</style>
