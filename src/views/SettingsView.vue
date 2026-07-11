<script setup>
import { ref, onMounted, onUnmounted } from 'vue';
import { useRouter } from 'vue-router';

const router = useRouter();
const zoomFactor = ref(1.0);
const coreVersion = ref('');

function back() {
    router.push('/');
}

// ESC 快捷键返回主界面
function onKeydown(e) {
    if (e.key === 'Escape') back();
}

onMounted(async () => {
    const result = await window.api.developer.zoomGet();
    if (result.success) zoomFactor.value = result.factor;
    coreVersion.value = await window.api.misc.getCoreVersion();
    document.addEventListener('keydown', onKeydown);
});

onUnmounted(() => {
    document.removeEventListener('keydown', onKeydown);
});

async function handleZoomChange(value) {
    zoomFactor.value = value;
    await window.api.developer.zoomSet(value);
}

async function handleZoomReset() {
    zoomFactor.value = 1.0;
    await window.api.developer.zoomReset();
}

// 监听主进程推送的 zoom 变化（快捷键调节后同步 UI）
window.api.developer.onZoomChanged((factor) => {
    zoomFactor.value = factor;
});

async function openHomepage() {
    try {
        await window.api.misc.openUrl('https://github.com/canbox-io/canbox-developer');
    } catch (e) {
        // 忽略打开失败
    }
}
</script>

<template>
    <div class="settings-view">
        <header class="view-header">
            <h1>设置</h1>
            <span class="close-btn" title="关闭（ESC）" @click="back">✕</span>
        </header>
        <main class="view-body">
            <!-- 通用 -->
            <el-card class="settings-section" shadow="never">
                <template #header>
                    <span class="section-title">通用</span>
                </template>

                <!-- 缩放比例 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">缩放比例</span>
                        <span class="label-hint">Ctrl+滚轮 / Ctrl++ / Ctrl+- / Ctrl+0 快捷调节，范围 0.5~2.0</span>
                    </div>
                    <div class="zoom-control">
                        <el-button size="small" @click="handleZoomChange(Math.max(0.5, zoomFactor - 0.1))">-</el-button>
                        <span class="zoom-value">{{ zoomFactor.toFixed(1) }}x</span>
                        <el-button size="small" @click="handleZoomChange(Math.min(2.0, zoomFactor + 0.1))">+</el-button>
                        <el-button size="small" plain @click="handleZoomReset">重置</el-button>
                    </div>
                </div>
            </el-card>

            <!-- 关于 -->
            <el-card class="settings-section" shadow="never">
                <template #header>
                    <span class="section-title">关于</span>
                </template>
                <div class="about-item">
                    <span class="label-text">canbox-developer</span>
                    <span class="about-value">0.1.0</span>
                </div>
                <div class="about-item">
                    <span class="label-text">canbox-core</span>
                    <span class="about-value">{{ coreVersion || '-' }}</span>
                </div>
                <div class="about-item">
                    <a href="https://github.com/canbox-io/canbox-developer" target="_blank" @click.prevent="openHomepage">项目主页</a>
                </div>
            </el-card>
        </main>
    </div>
</template>

<style scoped>
.settings-view {
    height: 100%;
    display: flex;
    flex-direction: column;
}
.view-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 24px;
    border-bottom: 1px solid #ebeef5;
    flex-shrink: 0;
}
.view-header h1 {
    margin: 0;
    font-size: 20px;
}
.close-btn {
    font-size: 20px;
    color: var(--el-text-color-placeholder);
    cursor: pointer;
    line-height: 1;
    padding: 4px 8px;
    border-radius: 6px;
    transition: all 0.2s;
}
.close-btn:hover {
    color: var(--el-text-color-primary);
    background-color: var(--el-fill-color-light);
}
.view-body {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}
.settings-section {
    margin-bottom: 20px;
}
.section-title {
    font-size: 17px;
    font-weight: 600;
}
.setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
}
.setting-item:last-child {
    border-bottom: none;
}
.setting-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
}
.label-text {
    font-size: 15px;
    color: var(--el-text-color-primary);
}
.label-hint {
    font-size: 13px;
    color: var(--el-text-color-placeholder);
}
.zoom-control {
    display: flex;
    align-items: center;
    gap: 8px;
}
.zoom-value {
    min-width: 44px;
    text-align: center;
    font-size: 15px;
    color: var(--el-text-color-primary);
}
.about-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
}
.about-item:last-child {
    border-bottom: none;
}
.about-value {
    font-size: 15px;
    color: var(--el-text-color-secondary);
    font-family: monospace;
}
.about-item a {
    color: var(--el-color-primary);
    text-decoration: none;
    font-size: 14px;
}
.about-item a:hover {
    text-decoration: underline;
}
</style>
