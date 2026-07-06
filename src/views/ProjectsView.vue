<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const projects = ref([]);
const packaging = ref({});

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

async function addApp() {
    const result = await window.api.developer.addApp();
    if (result.canceled) return;
    if (result.success) {
        ElMessage.success(`已添加: ${result.app.name}`);
        await loadProjects();
    } else {
        ElMessage.error(result.error || '添加失败');
    }
}

async function launchApp(app) {
    const result = await window.api.developer.launchApp(app.sourceDir);
    if (result.success) {
        ElMessage.success(`已启动: ${app.name}`);
    } else {
        ElMessage.error(result.error || '启动失败');
    }
}

async function packageApp(app) {
    packaging.value[app.appId] = true;
    try {
        const result = await window.api.developer.packageApp(app.sourceDir);
        if (result.success) {
            ElMessage.success(`已打包: ${result.path}`);
        } else {
            ElMessage.error(result.error || '打包失败');
        }
    } finally {
        packaging.value[app.appId] = false;
    }
}

async function clearData(app) {
    try {
        await ElMessageBox.confirm(`确认清除 ${app.name} 的运行数据？`, '提示', { type: 'warning' });
        const result = await window.api.developer.clearData(app.appId);
        if (result.success) {
            ElMessage.success('数据已清除');
        } else {
            ElMessage.error(result.error || '清除失败');
        }
    } catch (e) {
        // 用户取消
    }
}

async function removeApp(app) {
    try {
        await ElMessageBox.confirm(`确认从开发列表移除 ${app.name}？（不会删除源码）`, '提示', { type: 'warning' });
        const result = await window.api.developer.removeApp(app.appId);
        if (result.success) {
            ElMessage.success('已移除');
            await loadProjects();
        } else {
            ElMessage.error(result.error || '移除失败');
        }
    } catch (e) {
        // 用户取消
    }
}

async function openDataDir(app) {
    await window.api.developer.openDataDir(app.appId);
}

onMounted(() => {
    window.api.misc.hello().then(() => {
        console.log('[canbox-developer] canbox-core 已加载');
    });
    loadProjects();
    window.api.developer.appReady();
});
</script>

<template>
    <div class="projects-view">
        <header class="view-header">
            <h1>开发项目</h1>
            <div class="header-actions">
                <el-button type="primary" @click="addApp">添加 APP</el-button>
                <el-button circle @click="router.push('/settings')" title="设置">
                    <span style="font-size: 18px;">⚙</span>
                </el-button>
            </div>
        </header>
        <main class="view-body">
            <div v-if="projects.length === 0" class="empty-state">
                <el-empty description="暂无开发项目，点击右上角「添加 APP」选择 package.json" />
            </div>
            <div v-else class="app-list">
                <div v-for="app in projects" :key="app.appId" class="app-card">
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
                            <!-- 平台图标靠右 -->
                            <span v-if="app.platforms && app.platforms.length > 0" class="platforms">
                                <el-tooltip v-for="p in app.platforms" :key="p" :content="PLATFORM_NAMES[p] || p" placement="top">
                                    <span class="platform-icon" v-html="PLATFORM_ICONS_SVG[p] || ''"></span>
                                </el-tooltip>
                            </span>
                        </div>
                        <div class="app-desc">{{ app.description || '无描述' }}</div>
                        <div class="app-path">{{ app.sourceDir }}</div>

                        <!-- keywords 标签 -->
                        <div v-if="app.keywords && app.keywords.length > 0" class="app-keywords">
                            <span v-for="kw in app.keywords" :key="kw" class="keyword-tag">#{{ kw }}</span>
                        </div>

                        <!-- 底部操作按钮 -->
                        <div class="app-actions">
                            <el-tooltip content="运行" placement="top">
                                <button class="icon-btn run-btn" @click="launchApp(app)">▶️</button>
                            </el-tooltip>
                            <el-tooltip content="打包" placement="top">
                                <button class="icon-btn pack-btn" :disabled="packaging[app.appId]" @click="packageApp(app)">📦</button>
                            </el-tooltip>
                            <el-tooltip content="打开数据目录" placement="top">
                                <button class="icon-btn open-data-dir-btn" @click="openDataDir(app)">📂</button>
                            </el-tooltip>
                            <el-tooltip content="清除数据" placement="top">
                                <button class="icon-btn clear-btn" @click="clearData(app)">🧹</button>
                            </el-tooltip>
                            <el-tooltip content="移除" placement="top">
                                <button class="icon-btn delete-btn" @click="removeApp(app)">🗑️</button>
                            </el-tooltip>
                        </div>
                    </div>
                </div>
            </div>
        </main>
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
    grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
    gap: 16px;
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
.delete-btn:hover { background: #ffebee; }
</style>
