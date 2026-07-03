<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';

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
            <el-button type="primary" @click="addApp">添加 APP</el-button>
        </header>
        <main class="view-body">
            <div v-if="projects.length === 0" class="empty-state">
                <el-empty description="暂无开发项目，点击右上角「添加 APP」选择 package.json" />
            </div>
            <div v-else class="app-list">
                <el-card v-for="app in projects" :key="app.appId" class="app-card" shadow="hover">
                    <div class="app-card-header">
                        <div class="app-info">
                            <span class="app-name">{{ app.name }}</span>
                            <el-tag size="small" type="info">{{ app.version }}</el-tag>
                        </div>
                        <span class="app-appId">{{ app.appId }}</span>
                    </div>
                    <p class="app-desc">{{ app.description || '无描述' }}</p>
                    <p class="app-path">{{ app.sourceDir }}</p>
                    <div class="app-actions">
                        <el-button size="small" type="primary" @click="launchApp(app)">运行</el-button>
                        <el-button size="small" :loading="packaging[app.appId]" @click="packageApp(app)">打包</el-button>
                        <el-button size="small" @click="openDataDir(app)">数据目录</el-button>
                        <el-button size="small" @click="clearData(app)">清除数据</el-button>
                        <el-button size="small" type="danger" @click="removeApp(app)">移除</el-button>
                    </div>
                </el-card>
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
    font-size: 18px;
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
.app-list {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(460px, 1fr));
    gap: 16px;
}
.app-card {
    min-width: 0;
}
.app-card-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 8px;
}
.app-info {
    display: flex;
    align-items: center;
    gap: 8px;
}
.app-name {
    font-size: 16px;
    font-weight: 600;
}
.app-appId {
    font-size: 12px;
    color: #909399;
    font-family: monospace;
}
.app-desc {
    margin: 4px 0;
    font-size: 13px;
    color: #606266;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-path {
    margin: 4px 0 12px;
    font-size: 12px;
    color: #909399;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}
</style>
