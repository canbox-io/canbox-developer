<script setup>
import { ref } from 'vue';
import { ElMessage } from 'element-plus';

const form = ref({
    name: '',
    description: '',
    author: '',
    targetDir: ''
});

const creating = ref(false);

async function selectDirectory() {
    const result = await window.api.dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
    });
    if (!result.canceled && result.filePaths.length > 0) {
        form.value.targetDir = result.filePaths[0];
    }
}

async function createProject() {
    if (!form.value.name) {
        ElMessage.warning('请填写 APP 名称');
        return;
    }
    if (!form.value.targetDir) {
        ElMessage.warning('请选择目标目录');
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
            ElMessage.success('项目创建成功');
            form.value = { name: '', description: '', author: '', targetDir: '' };
        } else {
            ElMessage.error(result.error || '创建失败');
        }
    } finally {
        creating.value = false;
    }
}
</script>

<template>
    <div class="scaffold-view">
        <header class="view-header">
            <h1>新建项目</h1>
            <el-button text @click="$router.push('/')">&larr; 返回</el-button>
        </header>
        <main class="view-body">
            <el-form :model="form" label-width="100px" style="max-width: 500px;">
                <el-form-item label="APP 名称">
                    <el-input v-model="form.name" placeholder="my-app" />
                </el-form-item>
                <el-form-item label="描述">
                    <el-input v-model="form.description" placeholder="APP 描述" />
                </el-form-item>
                <el-form-item label="作者">
                    <el-input v-model="form.author" placeholder="作者" />
                </el-form-item>
                <el-form-item label="目标目录">
                    <el-input v-model="form.targetDir" placeholder="选择目录" readonly>
                        <template #append>
                            <el-button @click="selectDirectory">浏览</el-button>
                        </template>
                    </el-input>
                </el-form-item>
                <el-form-item>
                    <el-button type="primary" :loading="creating" @click="createProject">
                        创建
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
