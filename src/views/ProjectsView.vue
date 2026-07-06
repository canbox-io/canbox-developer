<script setup>
import { ref, onMounted } from 'vue';
import { useRouter } from 'vue-router';
import { ElMessage, ElMessageBox } from 'element-plus';

const router = useRouter();
const projects = ref([]);
const packaging = ref({});

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
                        <img v-if="app.logo" :src="'file://' + app.logo" :alt="app.name" />
                        <span v-else class="logo-placeholder">📦</span>
                    </div>

                    <!-- 信息区域 -->
                    <div class="info-section">
                        <div class="name-row">
                            <span class="app-name">{{ app.name }}</span>
                            <span class="app-version">{{ app.version }}</span>
                        </div>
                        <div class="app-desc">{{ app.description || '无描述' }}</div>
                        <div class="app-path">{{ app.sourceDir }}</div>

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
