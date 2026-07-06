/**
 * canbox-developer — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core API + developer 专用 API。
 * canbox-core API 为黑盒式（APP 不传 appId，由 core 自动路由）。
 */

const { contextBridge, ipcRenderer } = require('electron');

const api = {
    // === canbox-core 公共服务（黑盒式） ===
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
    dialog: {
        showMessageBox: (options) => ipcRenderer.invoke('canbox.dialog.showMessageBox', options),
        showOpenDialog: (options) => ipcRenderer.invoke('canbox.dialog.showOpenDialog', options),
        showSaveDialog: (options) => ipcRenderer.invoke('canbox.dialog.showSaveDialog', options)
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
        getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath')
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

        // 打包 APP 源码目录为 zip
        packageApp: (sourceDir, outputPath) => ipcRenderer.invoke('developer.apps.package', sourceDir, outputPath),

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

        // Vue 挂载完成通知
        appReady: () => ipcRenderer.invoke('developer.appReady')
    }
};

contextBridge.exposeInMainWorld('api', api);
