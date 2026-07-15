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
        // 添加开发项目（选择 package.json）
        addApp: () => ipcRenderer.invoke('developer.apps.add'),

        // 列出所有开发项目
        listApps: () => ipcRenderer.invoke('developer.apps.list'),

        // 从开发列表移除
        removeApp: (appId) => ipcRenderer.invoke('developer.apps.remove', appId),

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

        // Vue 挂载完成通知
        appReady: () => ipcRenderer.invoke('developer.appReady')
    }
};

contextBridge.exposeInMainWorld('api', api);
