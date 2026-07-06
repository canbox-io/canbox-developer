/**
 * canbox-developer — 主进程入口
 *
 * 标准 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js canbox-developer/ --app-id=canbox-developer
 *
 * 注册 developer 专用 IPC handlers（脚手架创建、源码目录调试启动、打包发布）。
 */

if (process.env.NODE_ENV === 'development') {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// 获取 canbox-core 注入的环境信息（injection.js 通过 -r 预加载时挂到 global）
const env = global.__CANBOX_ENV__;
const USERS_PATH = env.usersPath;
// canbox-core 根目录路径（用于 require store 等模块）
const CORE_PATH = global.__CANBOX_CORE_PATH__;

let mainWindow = null;

// ====== Developer 专用 IPC Handlers ======

/**
 * 获取 canbox-core 的 injection.js 路径
 * 从 {Users}/canbox.json 的 core.injectionPath 读取
 */
function getCoreInjectionPath() {
    const Store = require('electron-store');
    const coreStore = new Store({ cwd: USERS_PATH, name: 'canbox' });
    const corePath = coreStore.get('core.injectionPath');
    if (!corePath) {
        throw new Error('canbox-core path not found in canbox.json');
    }
    return path.join(corePath, 'injection.js');
}

/**
 * 启动源码目录中的 APP 进行调试
 * @param {string} sourceDir - APP 源码目录（含 package.json）
 * @returns {Promise<{success: boolean, error?: string}>}
 */
ipcMain.handle('developer.apps.launch', async (_e, sourceDir) => {
    if (!fs.existsSync(sourceDir)) {
        return { success: false, error: 'Source directory not found' };
    }

    const pkgPath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { success: false, error: 'package.json not found in source directory' };
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const appId = pkg.name;
        if (!appId) {
            return { success: false, error: 'package.json must have a "name" field' };
        }

        const coreInjection = getCoreInjectionPath();

        const child = spawn(process.execPath, [
            '-r', coreInjection,
            sourceDir,
            `--app-id=${appId}`
        ], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        return { success: true, appId };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * 打包 APP 源码目录为 zip
 * @param {string} sourceDir - APP 源码目录
 * @param {string} outputPath - 输出 zip 路径（可选，默认源码目录同级的 {name}-{version}.zip）
 * @returns {Promise<{success: boolean, path?: string, error?: string}>}
 */
ipcMain.handle('developer.apps.package', async (_e, sourceDir, outputPath) => {
    if (!fs.existsSync(sourceDir)) {
        return { success: false, error: 'Source directory not found' };
    }

    const pkgPath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { success: false, error: 'package.json not found in source directory' };
    }

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const zipName = `${pkg.name}-${pkg.version || '0.0.0'}.zip`;
        const zipPath = outputPath || path.join(path.dirname(sourceDir), zipName);

        const AdmZip = require('adm-zip');
        const zip = new AdmZip();

        // 排除的目录/文件
        const excludePatterns = ['node_modules', '.git', 'build', '.vscode', '.canbox-app'];

        function addDirToZip(dirPath, zipPath) {
            const entries = fs.readdirSync(dirPath, { withFileTypes: true });
            for (const entry of entries) {
                if (excludePatterns.includes(entry.name)) continue;
                const fullPath = path.join(dirPath, entry.name);
                const entryZipPath = zipPath ? `${zipPath}/${entry.name}` : entry.name;
                if (entry.isDirectory()) {
                    addDirToZip(fullPath, entryZipPath);
                } else {
                    zip.addLocalFile(fullPath, zipPath);
                }
            }
        }

        addDirToZip(sourceDir, '');
        zip.writeZip(zipPath);

        return { success: true, path: zipPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * 从模板创建新 APP 项目骨架
 * @param {string} targetDir - 目标目录
 * @param {object} options - { name, description, author, template }
 * @returns {Promise<{success: boolean, error?: string}>}
 */
ipcMain.handle('developer.scaffold.create', async (_e, targetDir, options) => {
    const { name, description, author } = options;

    if (!name) {
        return { success: false, error: 'APP name is required' };
    }

    try {
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 创建 .canbox-app 标识文件
        fs.writeFileSync(path.join(targetDir, '.canbox-app'), '');

        // 创建 package.json
        const pkg = {
            name,
            version: '0.0.1',
            description: description || '',
            main: 'main.js',
            author: author || '',
            license: 'Apache-2.0',
            scripts: {
                dev: 'vite --port 5173',
                build: 'vite build',
                start: `NODE_ENV=development electron -r /path/to/canbox-core/injection.js . --app-id=${name} --no-sandbox`
            },
            dependencies: {
                vue: '^3.4.21',
                'vue-router': '^4.4.5'
            },
            devDependencies: {
                '@vitejs/plugin-vue': '^5.1.2',
                electron: '^41.2.1',
                vite: '^5.4.6'
            }
        };
        fs.writeFileSync(
            path.join(targetDir, 'package.json'),
            JSON.stringify(pkg, null, 4)
        );

        // 创建 main.js
        const mainJs = `const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
`;
        fs.writeFileSync(path.join(targetDir, 'main.js'), mainJs);

        // 创建 preload.js（黑盒式 API 模板）
        const preloadJs = `const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
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
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData')
    }
});
`;
        fs.writeFileSync(path.join(targetDir, 'preload.js'), preloadJs);

        // 创建 index.html
        const indexHtml = `<!doctype html>
<html lang="en">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${name}</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.js"></script>
</body>
</html>
`;
        fs.writeFileSync(path.join(targetDir, 'index.html'), indexHtml);

        // 创建 src 目录及最小 Vue 骨架
        fs.mkdirSync(path.join(targetDir, 'src'), { recursive: true });
        fs.writeFileSync(
            path.join(targetDir, 'src', 'main.js'),
            `import { createApp } from 'vue'\nimport App from './App.vue'\n\ncreateApp(App).mount('#app')\n`
        );
        fs.writeFileSync(
            path.join(targetDir, 'src', 'App.vue'),
            `<template>\n    <div>\n        <h1>${name}</h1>\n        <p>${description || ''}</p>\n    </div>\n</template>\n\n<script setup>\n</script>\n`
        );

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// ====== 开发项目管理（通过 core store 持久化到 data/canbox-developer/store/） ======

/**
 * 获取 devApps store（黑盒式，appId=canbox-developer 自动路由）
 */
function getDevAppsStore() {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    return store.getStore('canbox-developer', 'devApps', path.join(USERS_PATH, 'data'));
}

/**
 * 获取 developer settings store（黑盒式，appId=canbox-developer 自动路由）
 */
function getSettingsStore() {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    return store.getStore('canbox-developer', 'settings', path.join(USERS_PATH, 'data'));
}

/**
 * 选择 package.json 文件，解析 APP 信息，加入开发项目列表
 */
ipcMain.handle('developer.apps.add', async () => {
    const result = await dialog.showOpenDialog({
        title: '选择 APP 的 package.json',
        filters: [{ name: 'package.json', extensions: ['json'] }],
        properties: ['openFile']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return { success: false, canceled: true };
    }

    const pkgPath = result.filePaths[0];
    const sourceDir = path.dirname(pkgPath);

    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const appId = pkg.name;
        if (!appId) {
            return { success: false, error: 'package.json 必须有 name 字段' };
        }

        const devApps = getDevAppsStore();
        let list = devApps.get('list') || [];

        // 避免重复添加
        if (list.some(item => item.appId === appId)) {
            return { success: false, error: '该 APP 已在开发列表中' };
        }

        // logo 读取：package.json 的 logo 字段 → 自动探测常见图标文件
        const logoPath = detectLogo(sourceDir, pkg);

        const appInfo = {
            appId,
            name: pkg.displayName || pkg.name || appId,
            version: pkg.version || '0.0.0',
            description: pkg.description || '',
            author: pkg.author || '',
            sourceDir,
            logo: logoPath,
            keywords: pkg.keywords || [],
            platforms: pkg.platforms || [],
            addedAt: Date.now()
        };
        list.push(appInfo);
        devApps.set('list', list);

        return { success: true, app: appInfo };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * 探测 APP 的 logo 并读取为 base64 data URI
 * 优先 package.json 的 logo 字段，其次自动探测常见图标文件
 * @param {string} sourceDir - APP 源码目录
 * @param {object} pkg - package.json 内容
 * @returns {string} logo 的 data URI，找不到返回空字符串
 */
function detectLogo(sourceDir, pkg) {
    const logoCandidates = pkg && pkg.logo
        ? [pkg.logo]
        : ['logo.png', 'logo.svg', 'icon.png', 'favicon.png', 'logo.jpg'];
    for (const candidate of logoCandidates) {
        const candidatePath = path.join(sourceDir, candidate);
        if (fs.existsSync(candidatePath)) {
            try {
                const ext = path.extname(candidate).slice(1).toLowerCase();
                const mimeMap = { png: 'image/png', svg: 'image/svg+xml', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif' };
                const mime = mimeMap[ext] || 'image/png';
                const buf = fs.readFileSync(candidatePath);
                return `data:${mime};base64,${buf.toString('base64')}`;
            } catch (e) {
                // 读取失败，继续尝试下一个
            }
        }
    }
    return '';
}

/**
 * 列出所有开发项目
 * 对旧数据（缺少 logo/keywords/platforms 字段）做补探测
 */
ipcMain.handle('developer.apps.list', async () => {
    const devApps = getDevAppsStore();
    const list = devApps.get('list') || [];

    let needUpdate = false;
    for (const app of list) {
        // 补探测 logo（旧数据可能是文件路径而非 data URI，或为空）
        if (!app.logo || !app.logo.startsWith('data:')) {
            let pkg = null;
            try {
                pkg = JSON.parse(fs.readFileSync(path.join(app.sourceDir, 'package.json'), 'utf-8'));
            } catch (e) {
                // 源码目录可能已删除
            }
            if (pkg) {
                app.logo = detectLogo(app.sourceDir, pkg);
                app.keywords = app.keywords || pkg.keywords || [];
                app.platforms = app.platforms || pkg.platforms || [];
                needUpdate = true;
            }
        }
    }

    // 有补全的数据写回 store
    if (needUpdate) {
        devApps.set('list', list);
    }

    return list;
});

/**
 * 从开发列表中移除（不删源码，只删记录）
 */
ipcMain.handle('developer.apps.remove', async (_e, appId) => {
    const devApps = getDevAppsStore();
    let list = devApps.get('list') || [];
    list = list.filter(item => item.appId !== appId);
    devApps.set('list', list);
    return { success: true };
});

/**
 * 清除 APP 运行数据（删 data/{appId}/）
 */
ipcMain.handle('developer.apps.clearData', async (_e, appId) => {
    const dataDir = path.join(USERS_PATH, 'data', appId);
    try {
        if (fs.existsSync(dataDir)) {
            fs.rmSync(dataDir, { recursive: true, force: true });
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

/**
 * 打开 APP 数据目录
 */
ipcMain.handle('developer.apps.openDataDir', async (_e, appId) => {
    const dataDir = path.join(USERS_PATH, 'data', appId);
    if (!fs.existsSync(dataDir)) {
        fs.mkdirSync(dataDir, { recursive: true });
    }
    shell.openPath(dataDir);
    return { success: true };
});

// ====== 缩放 ======

ipcMain.handle('developer.zoom.get', async () => {
    return { success: true, factor: getSettingsStore().get('zoomFactor') || 1.0 };
});

ipcMain.handle('developer.zoom.set', async (_e, factor) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(factor * 10) / 10));
    getSettingsStore().set('zoomFactor', clamped);

    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.setZoomFactor(clamped);
            win.webContents.send('developer:zoomChanged', clamped);
        }
    });
    return { success: true, factor: clamped };
});

ipcMain.handle('developer.zoom.reset', async () => {
    getSettingsStore().set('zoomFactor', 1.0);

    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.setZoomFactor(1.0);
            win.webContents.send('developer:zoomChanged', 1.0);
        }
    });
    return { success: true, factor: 1.0 };
});

// ====== 窗口创建 ======

// 选择目录对话框
ipcMain.handle('developer.dialog.selectDirectory', async () => {
    const result = await dialog.showOpenDialog({
        properties: ['openDirectory', 'createDirectory']
    });
    if (result.canceled || result.filePaths.length === 0) {
        return null;
    }
    return result.filePaths[0];
});

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 680,
        minWidth: 800,
        minHeight: 600,
        title: 'Canbox Developer',
        show: false,
        icon: path.join(__dirname, 'logo.png'),
        backgroundColor: '#f7f8fa',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        mainWindow.loadURL('http://localhost:5102');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }

    // 应用保存的缩放比例（dom-ready 后设置，避免闪烁）
    mainWindow.webContents.on('dom-ready', () => {
        try {
            const zoomFactor = getSettingsStore().get('zoomFactor') || 1.0;
            if (zoomFactor !== 1.0) {
                mainWindow.webContents.setZoomFactor(zoomFactor);
                console.log(`[startup] Applied zoom factor: ${zoomFactor}`);
            }
        } catch (e) {
            // 忽略
        }
    });
}

ipcMain.handle('developer.appReady', () => {
    if (mainWindow && !mainWindow.isVisible()) {
        mainWindow.show();
    }
});

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
