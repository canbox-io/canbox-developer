<script setup>
import { ref, nextTick, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessageBox, ElSelect, ElOption } from 'element-plus';
import { h } from 'vue';
import { useI18n } from 'vue-i18n';
import notification from '@/utils/notification';

const router = useRouter();
const { t } = useI18n();
const projects = ref([]);
const packaging = ref({});

// 完整构建流水线：跟踪每个卡片的构建状态 sourceDir → { taskId, startTime, currentStep, currentStepName, logs[], status, zipPath, error }
const activeBuilds = ref({});
const buildNowTick = ref(Date.now());
let buildTimer = null;
let progressUnsubscribe = null;
// 自动清除已结束构建记录的定时器：sourceDir → Timeout
const cleanupTimers = new Map();

// 日志弹窗状态
const logModalVisible = ref(false);
const logModalSourceDir = ref('');
const logAutoScroll = ref(true); // 用户手动上滚时设为 false

// 平台 SVG 图标
const PLATFORM_ICONS_SVG = {
    windows: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
    darwin: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/></svg>'
};
const PLATFORM_NAMES = {
    windows: 'Windows',
    darwin: 'macOS',
    linux: 'Linux'
};

async function loadProjects() {
    projects.value = await window.api.developer.listApps();
}

async function addApp(presetSourceDir) {
    // presetSourceDir 由"选版本后重试"流程传入；模板 @click 调用时是 MouseEvent，需过滤
    if (typeof presetSourceDir !== 'string') presetSourceDir = undefined;
    const result = await window.api.developer.addApp(presetSourceDir);
    if (result.canceled) return;
    if (result.success) {
        notification.success(t('projects.added', { name: result.app.name }));
        await loadProjects();
        return;
    }
    // 缺失 .canbox-app：弹窗让用户选 electron 版本，写入后重试添加
    if (result.code === 'ELECTRON_RANGE_REQUIRED') {
        if (await promptWriteCanboxMeta(result.sourceDir, result.appInfo)) {
            // 用已选的 sourceDir 重新调用 addApp，跳过文件选择
            await addApp(result.sourceDir);
        }
        return;
    }
    notification.error(result.error || t('projects.addFailed'));
}

/**
 * 弹出 Electron 版本选择对话框并写入 .canbox-app
 * @param {string} sourceDir - 工程目录
 * @param {object} appInfo - 已读到的 APP 元数据（用于提示文案）
 * @returns {Promise<boolean>} 是否写入成功（用户取消返回 false）
 */
async function promptWriteCanboxMeta(sourceDir, appInfo) {
    // 拉取白名单版本
    const allowed = await window.api.developer.electronListAllowed();
    if (!allowed.success || allowed.versions.length === 0) {
        notification.error(t('projects.noAllowedElectron'));
        return false;
    }
    // 弹窗：下拉选版本（用 h 函数渲染 el-select）
    const selectedVersion = ref(allowed.versions[0]);
    const selectedCategory = ref('other');
    const categoryOptions = [
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
    try {
        await ElMessageBox({
            title: t('projects.electronRangeTitle'),
            message: () => [
                h('p', { style: 'margin: 0 0 12px 0; color: #606266; line-height: 1.6;' },
                    t('projects.electronRangePrompt', { name: appInfo.name })),
                h(ElSelect, {
                    modelValue: selectedVersion.value,
                    'onUpdate:modelValue': (v) => { selectedVersion.value = v; },
                    style: 'width: 100%; margin-bottom: 12px;'
                }, () => allowed.versions.map(v => h(ElOption, { label: v, value: v }))),
                h('p', { style: 'margin: 0 0 6px 0; color: #606266; font-size: 13px;' },
                    t('projects.categoryLabel')),
                h(ElSelect, {
                    modelValue: selectedCategory.value,
                    'onUpdate:modelValue': (v) => { selectedCategory.value = v; },
                    style: 'width: 100%;'
                }, () => categoryOptions.map(o => h(ElOption, { label: o.label, value: o.value })))
            ],
            confirmButtonText: t('projects.confirmWrite'),
            cancelButtonText: t('projects.cancel'),
            showCancelButton: true,
            closeOnClickModal: false
        });
        if (!selectedVersion.value) return false;
        const writeResult = await window.api.developer.writeCanboxMeta(sourceDir, selectedVersion.value, 'native', selectedCategory.value);
        if (!writeResult.success) {
            notification.error(writeResult.error || t('projects.writeMetaFailed'));
            return false;
        }
        notification.success(t('projects.metaWritten'));
        return true;
    } catch (e) {
        // 用户取消
        return false;
    }
}

/**
 * 重新定位：工程被移动、或整目录删除后重建时，把已有记录指向新目录
 * @param {object} app - 现有项目
 * @param {string} [presetDir] - 选版本后重试时传入，跳过文件选择
 */
async function relocateApp(app, presetDir) {
    if (typeof presetDir !== 'string') presetDir = undefined;
    const result = await window.api.developer.relocateApp(app.sourceDir, presetDir);
    if (result.canceled) return;
    if (result.success) {
        notification.success(t('projects.relocated'));
        await loadProjects();
        return;
    }
    if (result.code === 'ELECTRON_RANGE_REQUIRED') {
        if (await promptWriteCanboxMeta(result.sourceDir, result.appInfo)) {
            await relocateApp(app, result.sourceDir);
        }
        return;
    }
    notification.error(result.error || t('projects.relocateFailed'));
}

/**
 * 卡片状态文案，ok 状态不显示徽标
 * @param {string} status - 主进程返回的读取状态
 * @returns {string} 国际化文案
 */
function statusText(status) {
    if (status === 'missing-dir') return t('projects.statusMissingDir');
    if (status === 'missing-package') return t('projects.statusMissingPackage');
    if (status === 'invalid-json') return t('projects.statusInvalidJson');
    return '';
}

async function launchApp(app) {
    const result = await window.api.developer.launchApp(app.sourceDir);
    if (result.success) {
        notification.success(t('projects.launched', { name: app.name }));
    } else {
        notification.error(result.error || t('projects.launchFailed'));
    }
}

async function publishApp(app) {
    packaging.value[app.sourceDir] = true;
    try {
        const result = await window.api.developer.publishApp(app.sourceDir);
        if (result.canceled) return;

        // 完整构建模式：后端已启动流水线，前端跟踪进度
        if (result.mode === 'fullbuild' && result.taskId) {
            activeBuilds.value[app.sourceDir] = {
                taskId: result.taskId,
                startTime: Date.now(),
                currentStep: 0,
                currentStepName: t('projects.pipelineDetecting'),
                logs: [],
                status: 'running',
                zipPath: null,
                error: null,
            };
            // 自动打开日志弹窗，让用户立即看到进度
            openLogModalFor(app.sourceDir);
            return;
        }

        // 仅打包模式（手动选目录）
        if (result.success) {
            try {
                await ElMessageBox.confirm(
                    t('projects.publishedPrompt', { path: result.path }),
                    t('projects.publishedTitle'),
                    {
                        confirmButtonText: t('projects.openFolder'),
                        cancelButtonText: t('projects.close'),
                        type: 'success',
                        closeOnClickModal: false
                    }
                );
                const folder = result.path.split('/').slice(0, -1).join('/') || '/';
                await window.api.developer.openPath(folder);
            } catch (_) {}
        } else {
            notification.error(result.error || t('projects.publishFailed'));
        }
    } finally {
        packaging.value[app.sourceDir] = false;
    }
}

/**
 * 统一处理完整构建流水线的进度事件（来自后端 broadcast）
 */
function handleBuildProgress(payload) {
    // 在 activeBuilds 里找到匹配的任务
    const sourceDir = Object.keys(activeBuilds.value).find(
        (k) => activeBuilds.value[k].taskId === payload.taskId
    );
    if (!sourceDir) return;

    const build = activeBuilds.value[sourceDir];
    if (!build) return;

    switch (payload.type) {
        case 'started':
            // 后端发送 started，前端已知晓（publishApp 返回后设置了 activeBuilds），忽略
            break;
        case 'step':
            build.currentStep = payload.data.step;
            build.currentStepName = payload.data.name;
            break;
        case 'stepDone':
            // 步骤完成提示（可选，用于详细展示）
            break;
        case 'log':
            build.logs.push({ text: payload.data.text, stream: payload.data.stream });
            if (build.logs.length > 3000) build.logs.shift(); // 前端内存留最近 3000 行
            // 自动滚动：仅当用户未手动上滚时
            if (logAutoScroll.value) {
                requestAnimationFrame(scrollLogToBottom);
            }
            break;
        case 'done':
            build.status = 'success';
            build.zipPath = payload.data.zipPath;
            build.finalDuration = payload.data.duration;
            notification.success(t('projects.pipelineDoneMsg') + ' · ' + formatDuration(build.finalDuration));
            scheduleBuildCleanup(sourceDir);
            break;
        case 'failed':
            build.status = 'failed';
            build.error = payload.data.error;
            build.finalDuration = payload.data.duration;
            notification.error(t('projects.pipelineFailedMsg') + ': ' + (payload.data.error || ''));
            scheduleBuildCleanup(sourceDir);
            break;
        case 'stopped':
            build.status = 'stopped';
            build.finalDuration = payload.data.duration;
            notification.info(t('projects.pipelineStoppedMsg') + ' · ' + formatDuration(build.finalDuration));
            scheduleBuildCleanup(sourceDir);
            break;
    }
}

/**
 * 停止某个正在执行的流水线任务
 */
async function stopBuildTask(sourceDir) {
    const build = activeBuilds.value[sourceDir];
    if (!build) return;
    try {
        const result = await ElMessageBox.confirm(
            t('projects.pipelineStopConfirm'),
            t('projects.pipelineStopTitle'),
            { type: 'warning', confirmButtonText: t('projects.pipelineStop'), cancelButtonText: t('projects.cancel') }
        );
        if (result !== 'confirm') return;
    } catch (_) {
        // ElMessageBox 取消时会 throw，忽略
        return;
    }
    await window.api.developer.stopBuild(build.taskId);
    // 注意：这里不弹 toast，等后端真正 stopped 后 handleBuildProgress 里统一弹
}

/**
 * 打开日志弹窗（点击 spinner 或构建完成后自动打开）
 */
function openLogModalFor(sourceDir) {
    logModalSourceDir.value = sourceDir;
    logModalVisible.value = true;
    logAutoScroll.value = true;
    // 弹窗打开后自动滚到底
    nextTick(() => scrollLogToBottom());
}

/**
 * 关闭日志弹窗时，如果任务还在运行，继续在后台执行（spinner 会继续显示）
 */
function closeLogModal() {
    const sourceDir = logModalSourceDir.value;
    logModalVisible.value = false;
    // 弹窗关闭后，若该构建已结束则清除记录（恢复卡片上的打包按钮）
    if (sourceDir) clearFinishedBuild(sourceDir);
}

/**
 * 日志滚动事件：用户手动上滚时暂停自动滚动，滚回底部时恢复
 */
function onLogWheel(e) {
    const el = e.target.closest('.log-scroll-area');
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    // 用户向上滚（deltaY < 0）且离底部超过 20px → 暂停自动滚动
    if (e.deltaY < 0 && distanceFromBottom > 20) {
        logAutoScroll.value = false;
    } else if (distanceFromBottom <= 20) {
        logAutoScroll.value = true;
    }
}

/**
 * 日志滚动到最底部
 */
function scrollLogToBottom() {
    const el = document.querySelector('.log-scroll-area');
    if (el) el.scrollTop = el.scrollHeight;
}

/**
 * 格式化时长为 MM:SS 或 HH:MM:SS
 */
function formatDuration(ms) {
    const total = Math.floor(ms / 1000);
    const h = Math.floor(total / 3600);
    const m = Math.floor((total % 3600) / 60);
    const s = total % 60;
    if (h > 0) {
        return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
    }
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

/**
 * 复制日志到剪贴板
 */
async function copyLogsToClipboard() {
    const build = activeBuilds.value[logModalSourceDir.value];
    if (!build) return;
    const text = build.logs.map((l) => l.text).join('\n');
    try {
        await navigator.clipboard.writeText(text);
        notification.success(t('projects.pipelineLogsCopied'));
    } catch (_) {
        notification.error(t('projects.pipelineLogsCopyFailed'));
    }
}

/**
 * 打开打包好的 zip 所在目录
 */
async function openZipFolder(sourceDir) {
    const build = activeBuilds.value[sourceDir];
    if (!build || !build.zipPath) return;
    const folder = build.zipPath.split('/').slice(0, -1).join('/') || '/';
    await window.api.developer.openPath(folder);
}

/**
 * 计算构建时长
 * - running 状态：实时从 startTime 计算（依赖每秒 setInterval 刷新）
 * - 非 running 状态：使用 finalDuration（停止/完成时后端 onDone 回调时保存）
 */
function buildElapsed(build) {
    if (!build) return 0;
    if (build.status !== 'running' && typeof build.finalDuration === 'number') {
        return build.finalDuration;
    }
    return Math.max(0, buildNowTick.value - build.startTime);
}

/**
 * 延迟 5 秒自动清除已结束的构建记录
 * 给 spinner / 计时器留足时间展示结果，然后自动恢复按钮为"打包"
 * 用户在这 5 秒内点 ✕ 或弹窗底部"清除记录"可立即清除（取消定时器）
 */
function scheduleBuildCleanup(sourceDir) {
    // 取消之前可能存在的旧定时器（防止重复触发）
    const existing = cleanupTimers.get(sourceDir);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
        cleanupTimers.delete(sourceDir);
        // 弹窗正在展示该构建的日志时不清除，否则弹窗内容会消失只剩标题
        if (logModalVisible.value && logModalSourceDir.value === sourceDir) return;
        clearFinishedBuild(sourceDir);
    }, 5000);
    cleanupTimers.set(sourceDir, timer);
}

/**
 * 清除已结束的构建记录（恢复按钮为"打包"）
 * 只清除非 running 状态的记录。会取消对应的自动清除定时器
 */
function clearFinishedBuild(sourceDir) {
    const build = activeBuilds.value[sourceDir];
    if (build && build.status !== 'running') {
        delete activeBuilds.value[sourceDir];
        // 取消自动清除定时器
        const timer = cleanupTimers.get(sourceDir);
        if (timer) {
            clearTimeout(timer);
            cleanupTimers.delete(sourceDir);
        }
    }
}

/**
 * 获取步骤列表（用于弹窗顶部的进度条）
 */
const PIPELINE_STEPS = [
    { step: 1, key: 'install', labelZh: '安装依赖', labelEn: 'Install' },
    { step: 2, key: 'build', labelZh: '前端构建', labelEn: 'Build' },
    { step: 3, key: 'dist', labelZh: 'Electron 打包', labelEn: 'Dist' },
    { step: 4, key: 'zip', labelZh: '打包 zip', labelEn: 'Zip' },
];

async function clearData(app) {
    try {
        await ElMessageBox.confirm(t('projects.confirmClearData', { name: app.name }), t('projects.confirmTitle'), { type: 'warning' });
        const result = await window.api.developer.clearData(app.appId);
        if (result.success) {
            notification.success(t('projects.dataCleared'));
        } else {
            notification.error(result.error || t('projects.clearFailed'));
        }
    } catch (e) {
        // 用户取消
    }
}

async function removeApp(app) {
    try {
        await ElMessageBox.confirm(t('projects.confirmRemoveApp', { name: app.name }), t('projects.confirmTitle'), { type: 'warning' });
        const result = await window.api.developer.removeApp(app.sourceDir);
        if (result.success) {
            notification.success(t('projects.removed'));
            await loadProjects();
        } else {
            notification.error(result.error || t('projects.removeFailed'));
        }
    } catch (e) {
        // 用户取消
    }
}

async function openDataDir(app) {
    await window.api.developer.openDataDir(app.appId);
}

// 拉起系统默认浏览器打开官方文档
function openDevDocs() {
    window.api.developer.openUrl('https://canbox-io.github.io/canbox-pages/app-dev.html');
}

function openApiDocs() {
    window.api.developer.openUrl('https://canbox-io.github.io/canbox-pages/docs.html');
}

// 主进程元数据监听推送的取消订阅函数
let unsubscribeAppsChanged = null;

// 窗口重新获得焦点 / 从隐藏变为可见时兜底刷新：
// fs.watch 在网络盘、无权限目录等场景可能收不到事件，需要一条不依赖监听的兜底路径
function refreshIfVisible() {
    if (!document.hidden) loadProjects();
}

onMounted(() => {
    window.api.misc.hello().then(() => {
        console.log('[canbox-developer] canbox-core 已加载');
    });
    loadProjects();
    unsubscribeAppsChanged = window.api.developer.onAppsChanged(() => loadProjects());
    window.addEventListener('focus', refreshIfVisible);
    document.addEventListener('visibilitychange', refreshIfVisible);

    // 订阅完整构建流水线进度（统一入口，按 taskId 分发）
    progressUnsubscribe = window.api.developer.onBuildProgress(handleBuildProgress);

    // 每秒刷新计时器（驱动 duration 显示）
    buildTimer = setInterval(() => { buildNowTick.value = Date.now(); }, 1000);
});

onUnmounted(() => {
    if (typeof unsubscribeAppsChanged === 'function') unsubscribeAppsChanged();
    window.removeEventListener('focus', refreshIfVisible);
    document.removeEventListener('visibilitychange', refreshIfVisible);
    if (typeof progressUnsubscribe === 'function') progressUnsubscribe();
    if (buildTimer) clearInterval(buildTimer);
});
</script>

<template>
    <div class="projects-view">
        <header class="view-header">
            <h1>{{ t('projects.title') }}</h1>
            <div class="header-actions">
                <el-link
                    type="primary"
                    underline="never"
                    class="doc-link"
                    :title="t('projects.devDocsTitle')"
                    @click="openDevDocs"
                >{{ t('projects.devDocs') }}</el-link>
                <el-link
                    type="primary"
                    underline="never"
                    class="doc-link"
                    :title="t('projects.apiDocsTitle')"
                    @click="openApiDocs"
                >{{ t('projects.apiDocs') }}</el-link>
                <el-button @click="router.push('/scaffold')">{{ t('projects.newProject') }}</el-button>
                <el-button type="primary" @click="addApp()">{{ t('projects.addApp') }}</el-button>
                <el-button circle @click="loadProjects" :title="t('projects.refresh')">⟳</el-button>
                <el-button circle @click="router.push('/settings')" :title="t('projects.settingsWithShortcut')">
                    <span style="font-size: 18px;">⚙</span>
                </el-button>
            </div>
        </header>
        <main class="view-body">
            <div v-if="projects.length === 0" class="empty-state">
                <el-empty :description="t('projects.empty')" />
            </div>
            <div v-else class="app-list">
                <div
                    v-for="app in projects"
                    :key="app.sourceDir"
                    class="app-card"
                    :class="{ 'app-card--missing': app.status !== 'ok' }"
                >
                    <!-- Logo -->
                    <div class="logo-section">
                        <img v-if="app.logo" :src="app.logo" :alt="app.name" />
                        <span v-else class="logo-placeholder">📦</span>
                    </div>

                    <!-- 信息区域 -->
                    <div class="info-section">
                        <div class="name-row">
                            <span class="app-name">{{ app.name }}</span>
                            <span class="app-version">{{ app.version }}</span>
                            <!-- 工程目录丢失 / package.json 缺失或不可解析 -->
                            <el-tag v-if="app.status !== 'ok'" class="status-badge" type="warning" size="small" effect="light">
                                {{ statusText(app.status) }}
                            </el-tag>
                            <!-- 平台图标靠右，无 platforms 则默认全平台 -->
                            <span class="platforms">
                                <el-tooltip v-for="p in (app.platforms && app.platforms.length > 0 ? app.platforms : ['windows', 'darwin', 'linux'])" :key="p" :content="PLATFORM_NAMES[p] || p" placement="top">
                                    <span class="platform-icon" v-html="PLATFORM_ICONS_SVG[p] || ''"></span>
                                </el-tooltip>
                            </span>
                        </div>
                        <div class="app-desc">{{ app.description || t('projects.noDescription') }}</div>
                        <div class="app-path">{{ app.sourceDir }}</div>

                        <!-- keywords 标签 -->
                        <div v-if="app.keywords && app.keywords.length > 0" class="app-keywords">
                            <span v-for="kw in app.keywords" :key="kw" class="keyword-tag">#{{ kw }}</span>
                        </div>

                        <!-- 底部操作按钮 -->
                        <div class="app-actions">
                            <el-tooltip :content="t('projects.run')" placement="top">
                                <button class="icon-btn run-btn" :disabled="app.status !== 'ok'" @click="launchApp(app)">▶️</button>
                            </el-tooltip>
                            <!-- 完整构建中：显示 spinner + 计时器 + 点击打开日志弹窗 -->
                            <template v-if="activeBuilds[app.sourceDir]">
                                <button
                                    class="icon-btn pack-btn build-spinner"
                                    :class="{
                                        'build-running': activeBuilds[app.sourceDir].status === 'running',
                                        'build-success': activeBuilds[app.sourceDir].status === 'success',
                                        'build-failed': activeBuilds[app.sourceDir].status === 'failed',
                                        'build-stopped': activeBuilds[app.sourceDir].status === 'stopped',
                                    }"
                                    :title="activeBuilds[app.sourceDir].status === 'running' ? (t('projects.pipelineRunning') + ' ' + formatDuration(buildElapsed(activeBuilds[app.sourceDir])) + ' · ' + activeBuilds[app.sourceDir].currentStepName) : (t('projects.pipelineDone') + ' ' + formatDuration(buildElapsed(activeBuilds[app.sourceDir])))"
                                    @click="openLogModalFor(app.sourceDir)"
                                >
                                    <span v-if="activeBuilds[app.sourceDir].status === 'running'" class="spinner-icon">⏳</span>
                                    <span v-else-if="activeBuilds[app.sourceDir].status === 'success'" class="done-icon">✅</span>
                                    <span v-else-if="activeBuilds[app.sourceDir].status === 'failed'" class="fail-icon">❌</span>
                                    <span v-else class="stop-icon">⏹️</span>
                                </button>
                                <span class="build-timer" @click="openLogModalFor(app.sourceDir)" :title="t('projects.pipelineOpenLog')">
                                    {{ formatDuration(buildElapsed(activeBuilds[app.sourceDir])) }}
                                </span>
                                <!-- 已结束任务的清除按钮（✕），hover 显示，恢复按钮为"打包" -->
                                <button
                                    v-if="activeBuilds[app.sourceDir].status !== 'running'"
                                    class="build-clear-btn"
                                    :title="t('projects.pipelineClearRecord')"
                                    @click="clearFinishedBuild(app.sourceDir)"
                                >✕</button>
                            </template>
                            <!-- 无构建中：正常打包按钮 -->
                            <template v-else>
                                <el-tooltip :content="t('projects.publish')" placement="top">
                                    <button class="icon-btn pack-btn" :disabled="app.status !== 'ok' || packaging[app.sourceDir]" @click="publishApp(app)">📦</button>
                                </el-tooltip>
                            </template>
                            <el-tooltip :content="t('projects.openDataDir')" placement="top">
                                <button class="icon-btn open-data-dir-btn" :disabled="app.status !== 'ok'" @click="openDataDir(app)">📂</button>
                            </el-tooltip>
                            <el-tooltip :content="t('projects.clearData')" placement="top">
                                <button class="icon-btn clear-btn" :disabled="app.status !== 'ok'" @click="clearData(app)">🧹</button>
                            </el-tooltip>
                            <el-tooltip v-if="app.status !== 'ok'" :content="t('projects.relocate')" placement="top">
                                <button class="icon-btn relocate-btn" @click="relocateApp(app)">📍</button>
                            </el-tooltip>
                            <el-tooltip :content="t('projects.remove')" placement="top">
                                <button class="icon-btn delete-btn" @click="removeApp(app)">🗑️</button>
                            </el-tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </main>

        <!-- 完整构建流水线日志弹窗 -->
        <el-dialog
            :model-value="logModalVisible"
            @update:model-value="(v) => !v && closeLogModal()"
            :title="logModalSourceDir && activeBuilds[logModalSourceDir] ? (t('projects.pipelineTitle') + ' · ' + formatDuration(buildElapsed(activeBuilds[logModalSourceDir]))) : t('projects.pipelineTitle')"
            width="720px"
            top="8vh"
            :close-on-click-modal="false"
            :destroy-on-close="false"
        >
            <div v-if="activeBuilds[logModalSourceDir]" class="pipeline-dialog-body">
                <!-- 步骤进度条 -->
                <div class="pipeline-steps">
                    <div
                        v-for="step in PIPELINE_STEPS"
                        :key="step.step"
                        class="pipeline-step"
                        :class="{
                            'step-done': activeBuilds[logModalSourceDir].currentStep > step.step || (activeBuilds[logModalSourceDir].status !== 'running' && activeBuilds[logModalSourceDir].currentStep >= step.step),
                            'step-active': activeBuilds[logModalSourceDir].currentStep === step.step && activeBuilds[logModalSourceDir].status === 'running',
                            'step-pending': activeBuilds[logModalSourceDir].currentStep < step.step,
                            'step-success': activeBuilds[logModalSourceDir].status === 'success',
                            'step-failed': activeBuilds[logModalSourceDir].status === 'failed' && activeBuilds[logModalSourceDir].currentStep === step.step,
                        }"
                    >
                        <span class="step-indicator">
                            <span v-if="activeBuilds[logModalSourceDir].currentStep > step.step || activeBuilds[logModalSourceDir].status === 'success'">✓</span>
                            <span v-else-if="activeBuilds[logModalSourceDir].currentStep === step.step && activeBuilds[logModalSourceDir].status === 'running'" class="indicator-spinner">⏳</span>
                            <span v-else-if="activeBuilds[logModalSourceDir].status === 'failed' && activeBuilds[logModalSourceDir].currentStep === step.step">✗</span>
                            <span v-else>{{ step.step }}</span>
                        </span>
                        <span class="step-label">{{ t('projects.pipelineStep' + step.step) }}</span>
                    </div>
                </div>

                <!-- 当前步骤名（运行中显示在日志区上方） -->
                <div class="pipeline-current-step" v-if="activeBuilds[logModalSourceDir].status === 'running'">
                    {{ activeBuilds[logModalSourceDir].currentStepName }}
                </div>

                <!-- 日志滚动区 -->
                <div class="log-scroll-area" @wheel="onLogWheel">
                    <div
                        v-for="(line, idx) in activeBuilds[logModalSourceDir].logs"
                        :key="idx"
                        class="log-line"
                        :class="{ 'log-stderr': line.stream === 'stderr' }"
                    >{{ line.text }}</div>
                    <div v-if="activeBuilds[logModalSourceDir].logs.length === 0" class="log-empty">
                        {{ t('projects.pipelineLogWaiting') }}
                    </div>
                </div>

                <!-- 底部状态栏 + 操作 -->
                <div class="pipeline-status-bar">
                    <div class="status-info">
                        <span
                            class="status-dot"
                            :class="{
                                'dot-running': activeBuilds[logModalSourceDir].status === 'running',
                                'dot-success': activeBuilds[logModalSourceDir].status === 'success',
                                'dot-failed': activeBuilds[logModalSourceDir].status === 'failed',
                                'dot-stopped': activeBuilds[logModalSourceDir].status === 'stopped',
                            }"
                        ></span>
                        <span class="status-text">
                            <template v-if="activeBuilds[logModalSourceDir].status === 'running'">
                                {{ t('projects.pipelineRunning') }} · {{ activeBuilds[logModalSourceDir].currentStepName }} · {{ formatDuration(buildElapsed(activeBuilds[logModalSourceDir])) }}
                            </template>
                            <template v-else-if="activeBuilds[logModalSourceDir].status === 'success'">
                                ✅ {{ t('projects.pipelineDoneMsg') }} · {{ formatDuration(buildElapsed(activeBuilds[logModalSourceDir])) }}
                            </template>
                            <template v-else-if="activeBuilds[logModalSourceDir].status === 'failed'">
                                ❌ {{ t('projects.pipelineFailedMsg') }}{{ activeBuilds[logModalSourceDir].error ? '：' + activeBuilds[logModalSourceDir].error : '' }}
                            </template>
                            <template v-else>
                                ⏹️ {{ t('projects.pipelineStoppedMsg') }} · {{ formatDuration(buildElapsed(activeBuilds[logModalSourceDir])) }}
                            </template>
                        </span>
                    </div>
                    <div class="status-actions">
                        <button class="btn" @click="copyLogsToClipboard">{{ t('projects.pipelineCopyLogs') }}</button>
                        <button
                            v-if="activeBuilds[logModalSourceDir].status !== 'running'"
                            class="btn"
                            @click="closeLogModal()"
                        >{{ t('projects.pipelineClearRecord') }}</button>
                        <button
                            v-if="activeBuilds[logModalSourceDir].status === 'running'"
                            class="btn btn-danger"
                            @click="stopBuildTask(logModalSourceDir)"
                        >{{ t('projects.pipelineStop') }}</button>
                        <button
                            v-if="activeBuilds[logModalSourceDir].status === 'success' && activeBuilds[logModalSourceDir].zipPath"
                            class="btn btn-primary"
                            @click="openZipFolder(logModalSourceDir)"
                        >{{ t('projects.openFolder') }}</button>
                    </div>
                </div>
            </div>
        </el-dialog>
    </div>
</template>

<style scoped>
.projects-view {
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
    flex-shrink: 0;
}
.view-header h1 {
    margin: 0;
    font-size: 20px;
}
.header-actions {
    display: flex;
    align-items: center;
    gap: 8px;
}
/* 文档入口为文字链接，与操作按钮区分开 */
.doc-link {
    font-size: 14px;
    margin-right: 4px;
}
.view-body {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}
.empty-state {
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
}

/* 卡片布局：logo 左侧 + 信息右侧 */
.app-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 12px;
}

.app-card {
    background: #f5f7fa;
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    padding: 20px;
    display: flex;
    align-items: flex-start;
    transition: box-shadow 0.2s;
}
.app-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
/* 工程目录丢失 / package.json 不可读：整体降饱和并加警示描边（不改变布局） */
.app-card--missing {
    opacity: 0.72;
    box-shadow: inset 0 0 0 1px #e6a23c;
}
.status-badge {
    flex-shrink: 0;
    align-self: center;
}

/* Logo */
.logo-section {
    flex-shrink: 0;
}
.logo-section img {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    object-fit: cover;
}
.logo-placeholder {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    background: #e9ecef;
}

/* 信息区域 */
.info-section {
    flex: 1;
    margin-left: 16px;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.name-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
}
.app-name {
    font-size: 19px;
    font-weight: 600;
    color: #303133;
}
.app-version {
    color: #606266;
    font-size: 15px;
}
.platforms {
    margin-left: auto;
    display: flex;
    gap: 6px;
}
.platform-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #606266;
    cursor: help;
}
.platform-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
.app-desc {
    color: #303133;
    font-size: 16px;
    margin-top: 6px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-path {
    color: #909399;
    font-size: 13px;
    margin-top: 4px;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}
.keyword-tag {
    font-size: 13px;
    color: #606266;
    background: #e9ecef;
    border-radius: 4px;
    padding: 2px 8px;
}

/* 操作按钮 */
.app-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-top: 12px;
}

.icon-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: #ebeff5;
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    line-height: 1;
}
.icon-btn:hover {
    background: #dde3eb;
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.icon-btn:active {
    transform: translateY(0);
}
.icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.5;
}
.run-btn:hover { background: #e8f5e9; }
.pack-btn:hover { background: #e3f2fd; }
.open-data-dir-btn:hover { background: #e0f2f1; }
.clear-btn:hover { background: #fff3e0; }
.relocate-btn:hover { background: #fff8e1; }
.delete-btn:hover { background: #ffebee; }

/* ===== 完整构建流水线样式 ===== */
.build-spinner {
    position: relative;
    transition: all 0.3s;
}
.build-spinner.build-running {
    background: #e3f2fd;
    border: 2px solid #409eff;
    animation: pulse-border 1.5s ease-in-out infinite;
}
.build-spinner.build-success {
    background: #e8f5e9;
    border: 2px solid #67c23a;
}
.build-spinner.build-failed {
    background: #fef0f0;
    border: 2px solid #f56c6c;
}
.build-spinner.build-stopped {
    background: #f4f4f5;
    border: 2px solid #909399;
}

@keyframes pulse-border {
    0%, 100% { border-color: #409eff; }
    50% { border-color: #79bbff; }
}

.build-timer {
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    color: #409eff;
    padding: 4px 6px;
    margin-left: 2px;
    background: #ecf5ff;
    border-radius: 4px;
    cursor: pointer;
    user-select: none;
    white-space: nowrap;
}
.build-running ~ .build-timer { color: #409eff; background: #ecf5ff; }
.build-success ~ .build-timer { color: #67c23a; background: #f0f9eb; }
.build-failed ~ .build-timer { color: #f56c6c; background: #fef0f0; }
.build-stopped ~ .build-timer { color: #909399; background: #f4f4f5; }

/* 清除已结束构建记录的按钮 */
.build-clear-btn {
    width: 22px;
    height: 22px;
    margin-left: 4px;
    font-size: 11px;
    line-height: 22px;
    text-align: center;
    border: none;
    background: transparent;
    color: #c0c4cc;
    border-radius: 4px;
    cursor: pointer;
    opacity: 0;
    transition: opacity 0.2s, background 0.2s;
}
.build-clear-btn:hover {
    background: #fef0f0;
    color: #f56c6c;
    opacity: 1;
}
/* hover actions 区域时显示清除按钮 */
.app-actions:hover .build-clear-btn {
    opacity: 0.8;
}

/* 弹窗内步骤进度条 */
.pipeline-dialog-body {
    display: flex;
    flex-direction: column;
    gap: 12px;
}
.pipeline-steps {
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 0;
    border-bottom: 1px solid #ebeef5;
}
.pipeline-step {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    font-size: 12px;
    color: #909399;
    transition: all 0.3s;
}
.pipeline-step .step-indicator {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 13px;
    font-weight: 600;
    background: #f4f4f5;
    border: 2px solid #dcdfe6;
    color: #909399;
}
.pipeline-step.step-done { color: #67c23a; }
.pipeline-step.step-done .step-indicator {
    background: #e1f3d8;
    border-color: #67c23a;
    color: #67c23a;
}
.pipeline-step.step-active { color: #409eff; }
.pipeline-step.step-active .step-indicator {
    background: #ecf5ff;
    border-color: #409eff;
    color: #409eff;
}
.pipeline-step.step-pending { color: #c0c4cc; }
.pipeline-step.step-pending .step-indicator {
    background: #f4f4f5;
    border-color: #e4e7ed;
    color: #c0c4cc;
}
.pipeline-step.step-failed { color: #f56c6c; }
.pipeline-step.step-failed .step-indicator {
    background: #fef0f0;
    border-color: #f56c6c;
    color: #f56c6c;
}
.indicator-spinner {
    display: inline-block;
    animation: spin 1s linear infinite;
}
@keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
}
.step-label {
    text-align: center;
    font-size: 12px;
    white-space: nowrap;
}

/* 当前步骤名提示 */
.pipeline-current-step {
    font-size: 13px;
    color: #409eff;
    background: #ecf5ff;
    padding: 6px 10px;
    border-radius: 4px;
}

/* 日志滚动区 */
.log-scroll-area {
    height: 320px;
    background: #1e1e1e;
    color: #d4d4d4;
    border-radius: 6px;
    padding: 10px 12px;
    overflow-y: auto;
    font-family: 'SF Mono', 'Menlo', 'Consolas', monospace;
    font-size: 12px;
    line-height: 1.55;
}
.log-scroll-area::-webkit-scrollbar {
    width: 8px;
}
.log-scroll-area::-webkit-scrollbar-track {
    background: #2d2d2d;
}
.log-scroll-area::-webkit-scrollbar-thumb {
    background: #555;
    border-radius: 4px;
}
.log-line {
    white-space: pre-wrap;
    word-break: break-all;
}
.log-line.log-stderr {
    color: #f48771;
}
.log-empty {
    color: #808080;
    font-style: italic;
    padding: 20px 0;
    text-align: center;
}

/* 底部状态栏 */
.pipeline-status-bar {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 12px;
    background: #f5f7fa;
    border-radius: 6px;
    gap: 12px;
}
.status-info {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 13px;
    color: #606266;
}
.status-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
}
.status-dot.dot-running {
    background: #409eff;
    animation: blink 1s ease-in-out infinite;
}
.status-dot.dot-success { background: #67c23a; }
.status-dot.dot-failed { background: #f56c6c; }
.status-dot.dot-stopped { background: #909399; }
@keyframes blink {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.3; }
}
.status-text {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 360px;
}
.status-actions {
    display: flex;
    gap: 6px;
}
.status-actions .btn {
    padding: 6px 12px;
    border-radius: 4px;
    font-size: 13px;
    border: 1px solid #dcdfe6;
    background: #fff;
    cursor: pointer;
    transition: all 0.2s;
    color: #606266;
}
.status-actions .btn:hover {
    border-color: #409eff;
    color: #409eff;
}
.status-actions .btn.btn-primary {
    background: #409eff;
    border-color: #409eff;
    color: #fff;
}
.status-actions .btn.btn-primary:hover {
    background: #66b1ff;
    border-color: #66b1ff;
}
.status-actions .btn.btn-danger {
    background: #f56c6c;
    border-color: #f56c6c;
    color: #fff;
}
.status-actions .btn.btn-danger:hover {
    background: #f78989;
    border-color: #f78989;
}
</style>
