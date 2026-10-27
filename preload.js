/**
 * canbox-developer — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core API + developer 专用 API。
 * canbox-core API 为黑盒式（APP 不传 appId，由 core 自动路由）。
 *
 * 说明：dialog / window / shortcut / sudo / shell 等能力 canbox-core 不再提供，
 * developer 作为普通 APP 在自身 main.js 注册所需 IPC（见 developer.* 通道）。
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
    // === canbox-core 公共服务（仅数据隔离与环境信息，黑盒式）===
    store: {
        get: (name, key) => ipcRenderer.invoke('canbox.store.get', name, key),
        set: (name, key, value) => ipcRenderer.invoke('canbox.store.set', name, key, value),
        delete: (name, key) => ipcRenderer.invoke('canbox.store.delete', name, key),
        clear: (name) => ipcRenderer.invoke('canbox.store.clear', name)
    },
    db: {
        put: (doc) => ipcRenderer.invoke('canbox.db.put', doc),
        get: (docId) => ipcRenderer.invoke('canbox.db.get', docId),
        allDocs: (options) => ipcRenderer.invoke('canbox.db.allDocs', options),
        bulkDocs: (docs) => ipcRenderer.invoke('canbox.db.bulkDocs', docs),
        remove: (doc) => ipcRenderer.invoke('canbox.db.remove', doc),
        find: (query) => ipcRenderer.invoke('canbox.db.find', query),
        createIndex: (index) => ipcRenderer.invoke('canbox.db.createIndex', index)
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
        getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath'),
        getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo')
    },

    // === Developer 专用 API ===
    developer: {
        // 添加开发项目（选择 package.json，可选传入 sourceDir 跳过选择对话框）
        addApp: (sourceDir) => ipcRenderer.invoke('developer.apps.add', sourceDir),

        // 从模板生成 APP 项目骨架（新建项目）
        scaffoldCreate: (targetDir, options) => ipcRenderer.invoke('developer.scaffold.create', targetDir, options),

        // 为 APP 写入 .canbox-app（添加已有 APP 时缺失则由前端弹窗选版本后调用）
        writeCanboxMeta: (sourceDir, electronRange, type, category) =>
            ipcRenderer.invoke('developer.apps.writeCanboxMeta', sourceDir, electronRange, type, category),

        // 查询 canbox 白名单中的 electron 版本列表（供前端下拉选择）
        electronListAllowed: () => ipcRenderer.invoke('developer.electron.listAllowed'),

        // 列出所有开发项目
        listApps: () => ipcRenderer.invoke('developer.apps.list'),

        // 从开发列表移除（按工程目录，不删源码）
        removeApp: (sourceDir) => ipcRenderer.invoke('developer.apps.remove', sourceDir),

        // 重新定位：把已有记录指向新选择的 package.json 所在目录
        relocateApp: (oldSourceDir, presetNewDir) =>
            ipcRenderer.invoke('developer.apps.relocate', oldSourceDir, presetNewDir),

        // 元数据被外部修改/目录被删除后，主进程通知重新拉取列表
        // 返回取消订阅函数，避免视图重建后重复监听
        onAppsChanged: (callback) => {
            const handler = () => callback();
            ipcRenderer.on('developer:appsChanged', handler);
            return () => ipcRenderer.removeListener('developer:appsChanged', handler);
        },

        // 启动源码目录中的 APP 进行调试
        launchApp: (sourceDir) => ipcRenderer.invoke('developer.apps.launch', sourceDir),

        // 发布 APP（选构建产物目录，压标准 zip）
        publishApp: (sourceDir) => ipcRenderer.invoke('developer.apps.publish', sourceDir),

        // 清除 APP 运行数据
        clearData: (appId) => ipcRenderer.invoke('developer.apps.clearData', appId),

        // 打开 APP 数据目录
        openDataDir: (appId) => ipcRenderer.invoke('developer.apps.openDataDir', appId),

        // 缩放
        zoomGet: () => ipcRenderer.invoke('developer.zoom.get'),
        zoomSet: (factor) => ipcRenderer.invoke('developer.zoom.set', factor),
        zoomReset: () => ipcRenderer.invoke('developer.zoom.reset'),
        onZoomChanged: (callback) => {
            ipcRenderer.on('developer:zoomChanged', (_e, factor) => callback(factor));
        },

        // 设置（通用 key-value 持久化）
        settingsGet: (key) => ipcRenderer.invoke('developer.settings.get', key),
        settingsSet: (key, value) => ipcRenderer.invoke('developer.settings.set', key, value),
        settingsGetAll: () => ipcRenderer.invoke('developer.settings.getAll'),

        // 原生能力（APP 自有，非 canbox-core 提供）
        showOpenDialog: (options) => ipcRenderer.invoke('developer.dialog.showOpenDialog', options),
        openUrl: (url) => ipcRenderer.invoke('developer.shell.openUrl', url),
        // 打开本地文件/目录（shell.openPath，用于"打开所在目录"等场景）
        openPath: (targetPath) => ipcRenderer.invoke('developer.shell.openPath', targetPath),

        // Vue 挂载完成通知
        appReady: () => ipcRenderer.invoke('developer.appReady')
    }
};

contextBridge.exposeInMainWorld('api', api);
