<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';

const projects = ref([]);

async function selectAndLaunch() {
    const result = await window.api.developer.launchApp('');
    if (result.success) {
        ElMessage.success(`已启动: ${result.appId}`);
    } else {
        ElMessage.error(result.error || '启动失败');
    }
}

onMounted(() => {
    window.api.misc.hello().then(() => {
        console.log('[canbox-developer] canbox-core 已加载');
    });
});
</script>

<template>
    <div class="projects-view">
        <header class="view-header">
            <h1>项目</h1>
            <el-button type="primary" @click="$router.push('/scaffold')">新建项目</el-button>
        </header>
        <main class="view-body">
            <el-empty description="暂无项目，点击右上角新建">
            </el-empty>
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
