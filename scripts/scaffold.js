/**
 * canbox-developer — APP 项目骨架模板生成
 *
 * 纯函数模块：根据技术栈与选项产出「相对路径 → 文件内容」映射，
 * 由 main.js 的 developer.scaffold.create 落盘。
 *
 * 支持的技术栈：
 *   vue3-js     Vue 3 + Vite + JavaScript（默认）
 *   vue3-ts     Vue 3 + Vite + TypeScript
 *   vanilla-js  原生 JavaScript，无构建步骤
 *
 * 所有模板内置 canbox APP 基础能力：
 *   1. 界面缩放（Ctrl+滚轮 / Ctrl+= / Ctrl+- / Ctrl+0，比例持久化）
 *   2. 窗口大小与位置记忆恢复
 *   3. 界面切换状态保持（keep-alive / DOM 不销毁）
 *   4. 全局禁止选中与复制（输入控件除外）
 *   5. 设置界面中的快捷键条目
 *   6. 中英双语（设置中切换，canbox store 持久化）
 *
 * 设置在创建时可选择三种打开方式：
 *   view    切换界面（同一窗口内的独立界面）
 *   modal   弹层（同一窗口内的遮罩弹层）
 *   window  新窗口（独立设置窗口，不阻塞主窗口）
 */

'use strict';

const VUE_ROUTER_VERSION = '^4.4.5';
const VUE_VERSION = '^3.4.21';
const VUE_I18N_VERSION = '^11.2.8';
const VITE_VERSION = '^5.4.6';
const PLUGIN_VUE_VERSION = '^5.1.2';
const TS_VERSION = '^5.6.2';

// 模板文件中的占位符
const TOKEN_NAME = '__NAME__';
const TOKEN_INJECTION = '__INJECTION__';
const TOKEN_ELECTRON = '__ELECTRON__';
const TOKEN_RENDERER = '__RENDERER__';

const SETTINGS_MODES = ['view', 'modal', 'window'];

const LOCALE_KEY = 'app.locale';

// 骨架内置的中英文案（替换 TOKEN_NAME 后写入各模板）
const MESSAGES = {
    'zh-CN': {
        app: { title: TOKEN_NAME },
        nav: { home: '首页', settings: '设置' },
        home: {
            title: '首页',
            hint: '切换界面后回到本页，输入内容与任务进度会原样保留。',
            note: '备忘',
            notePlaceholder: '输入内容，切到「设置」再回来看看',
            progress: '长任务进度：{percent}%',
            start: '开始任务',
            reset: '重置'
        },
        settings: {
            title: '设置',
            hint: '窗口大小与位置、缩放比例会被记住，重启后自动恢复。',
            language: '语言',
            shortcuts: '快捷键',
            shortcut: '快捷键',
            action: '功能',
            close: '关闭'
        },
        shortcut: {
            wheel: '滚轮',
            zoomWheel: '缩放界面（放大 / 缩小）',
            zoomIn: '放大界面',
            zoomOut: '缩小界面',
            zoomReset: '重置缩放为 100%',
            openSettings: '打开设置',
            closeSettings: '关闭设置'
        }
    },
    'en-US': {
        app: { title: TOKEN_NAME },
        nav: { home: 'Home', settings: 'Settings' },
        home: {
            title: 'Home',
            hint: 'Switch to Settings and come back — your input and task progress are preserved.',
            note: 'Note',
            notePlaceholder: 'Type something, open Settings and come back',
            progress: 'Task progress: {percent}%',
            start: 'Start task',
            reset: 'Reset'
        },
        settings: {
            title: 'Settings',
            hint: 'Window size, position and zoom are remembered and restored on restart.',
            language: 'Language',
            shortcuts: 'Shortcuts',
            shortcut: 'Shortcut',
            action: 'Action',
            close: 'Close'
        },
        shortcut: {
            wheel: 'Wheel',
            zoomWheel: 'Zoom the interface in / out',
            zoomIn: 'Zoom in',
            zoomOut: 'Zoom out',
            zoomReset: 'Reset zoom to 100%',
            openSettings: 'Open settings',
            closeSettings: 'Close settings'
        }
    }
};

/**
 * 校验 APP 名称可用作 package.json 的 name 与目录内代码标识
 * @param {string} name
 * @returns {boolean}
 */
function isValidAppName(name) {
    return typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** 主进程入口模板（各技术栈共用；window 模式追加独立设置窗口） */
function mainJsTemplate(withSettingsWindow) {
    return `/**
 * ${TOKEN_NAME} — 主进程入口
 *
 * 通过 canbox-core 注入启动：
 *   electron -r <canbox-core/injection.js> . --app-id=${TOKEN_NAME}
 */

const { app, BrowserWindow, Menu, screen, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const APP_ID = '${TOKEN_NAME}';

// 渲染层类型：'vite'（构建产物在 build/）| 'static'（直接加载 index.html）
const RENDERER = '${TOKEN_RENDERER}';

const ZOOM_MIN = 0.5;
const ZOOM_MAX = 2;
const ZOOM_STEP = 0.1;

// ===== 基础能力②：窗口状态记忆 / 基础能力①：缩放比例 —— 均通过 canbox-core store 持久化 =====
const CORE_PATH = global.__CANBOX_CORE_PATH__;
const ENV = global.__CANBOX_ENV__ || {};
const store = createStore();

function createStore() {
    try {
        const { getStore } = require(path.join(CORE_PATH, 'lib', 'store'));
        return getStore(APP_ID, 'winState', path.join(ENV.usersPath, 'data'));
    } catch (e) {
        // 未通过 canbox-core 注入启动（如直接 electron .）时的降级实现
        const file = path.join(app.getPath('userData'), 'winState.json');
        const read = () => {
            try {
                return JSON.parse(fs.readFileSync(file, 'utf-8'));
            } catch (_) {
                return {};
            }
        };
        return {
            get: (key) => read()[key],
            set: (key, value) => {
                const data = read();
                data[key] = value;
                fs.mkdirSync(path.dirname(file), { recursive: true });
                fs.writeFileSync(file, JSON.stringify(data, null, 4));
            }
        };
    }
}

const BUILT_INDEX = path.join(__dirname, 'build', 'index.html');
const STATIC_INDEX = path.join(__dirname, 'index.html');

let mainWindow = null;
${withSettingsWindow ? `let settingsWindow = null;` : ''}

function clampZoom(factor) {
    return Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(factor * 10) / 10));
}

/** 校验保存的窗口位置是否仍落在某个屏幕的可用区域内（外接显示器拔除等场景） */
function isVisibleOnScreen(bounds) {
    return screen.getAllDisplays().some((display) => {
        const area = display.workArea;
        const overlapX = Math.min(bounds.x + bounds.width, area.x + area.width) - Math.max(bounds.x, area.x);
        const overlapY = Math.min(bounds.y + bounds.height, area.y + area.height) - Math.max(bounds.y, area.y);
        return overlapX > 50 && overlapY > 50;
    });
}

/** 基础能力②：优先恢复上次窗口大小与位置，越界则回退默认尺寸并居中 */
function resolveWindowBounds() {
    const saved = store.get('bounds');
    if (saved && typeof saved.width === 'number' && typeof saved.height === 'number' && isVisibleOnScreen(saved)) {
        return saved;
    }
    return { width: 1000, height: 700, center: true };
}

/**
 * 加载渲染层
 * @param {BrowserWindow} win
 * @param {boolean} [isSettingsWindow] 是否为新窗口模式下的设置窗口
 */
function loadRenderer(win, isSettingsWindow) {
    const options = isSettingsWindow ? { query: { settingsWindow: '1' } } : undefined;
    if (RENDERER === 'static') {
        win.loadFile(STATIC_INDEX, options);
        return;
    }
    if (fs.existsSync(BUILT_INDEX)) {
        win.loadFile(BUILT_INDEX, options);
        return;
    }
    if (!app.isPackaged) {
        // 尚未构建（build/index.html 不存在）时连接 Vite 开发服务器，需先执行 npm run dev
        win.loadURL(isSettingsWindow ? 'http://localhost:5173/?settingsWindow=1' : 'http://localhost:5173');
        return;
    }
    win.loadFile(BUILT_INDEX, options);
}

/** 基础能力①：缩放比例同时应用并持久化，所有窗口保持一致的界面缩放 */
function applyZoom(factor) {
    const next = clampZoom(factor);
    store.set('zoomFactor', next);
    BrowserWindow.getAllWindows().forEach((win) => {
        if (win.isDestroyed()) return;
        win.webContents.setZoomFactor(next);
        win.webContents.send('app:zoomChanged', next);
    });
    return next;
}

/** 基础能力①：Ctrl+= 放大 / Ctrl+- 缩小 / Ctrl+0 重置（用物理按键 e.code 判断） */
function registerZoomShortcuts(win) {
    win.webContents.on('before-input-event', (event, input) => {
        if (!input.control || input.type !== 'keyDown') return;
        const current = win.webContents.getZoomFactor();
        let factor = null;
        if (input.code === 'Equal') factor = current + ZOOM_STEP;
        else if (input.code === 'Minus') factor = current - ZOOM_STEP;
        else if (input.code === 'Digit0' || input.code === 'Numpad0') factor = 1;
        if (factor === null) return;
        event.preventDefault();
        applyZoom(factor);
    });
}

function createWindow() {
    const bounds = resolveWindowBounds();
    mainWindow = new BrowserWindow({
        width: bounds.width,
        height: bounds.height,
        x: bounds.x,
        y: bounds.y,
        center: Boolean(bounds.center),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    Menu.setApplicationMenu(null);

    const savedZoom = store.get('zoomFactor');
    if (typeof savedZoom === 'number') {
        mainWindow.webContents.setZoomFactor(clampZoom(savedZoom));
    }

    registerZoomShortcuts(mainWindow);

    // 基础能力②：关闭前保存窗口状态
    mainWindow.on('close', () => {
        if (mainWindow && !mainWindow.isMinimized()) {
            store.set('bounds', mainWindow.getBounds());
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
        ${withSettingsWindow ? `if (settingsWindow && !settingsWindow.isDestroyed()) settingsWindow.close();` : ''}
    });

    loadRenderer(mainWindow);
}
${
    withSettingsWindow
        ? `
/** 独立设置窗口：单例，不阻塞主窗口 */
function createSettingsWindow() {
    if (settingsWindow && !settingsWindow.isDestroyed()) {
        settingsWindow.show();
        settingsWindow.focus();
        return;
    }
    settingsWindow = new BrowserWindow({
        width: 760,
        height: 680,
        center: true,
        show: true,
        parent: mainWindow || undefined,
        backgroundColor: '#f5f7fa',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    const savedZoom = store.get('zoomFactor');
    if (typeof savedZoom === 'number') {
        settingsWindow.webContents.setZoomFactor(clampZoom(savedZoom));
    }
    registerZoomShortcuts(settingsWindow);

    settingsWindow.on('closed', () => {
        settingsWindow = null;
    });

    loadRenderer(settingsWindow, true);
}

ipcMain.handle('app.settings.open', () => {
    createSettingsWindow();
});

ipcMain.handle('app.settings.close', (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (win) win.close();
});

// 设置窗口修改语言等设置后广播给所有窗口，主窗口据此同步界面
ipcMain.on('app.settings.changed', (_event, payload) => {
    BrowserWindow.getAllWindows().forEach((win) => {
        if (!win.isDestroyed()) win.webContents.send('app:settingsChanged', payload || {});
    });
});
`
        : ''
}

// 渲染进程 Ctrl+滚轮（基础能力①）
ipcMain.handle('app.zoom.set', (_event, factor) => applyZoom(Number(factor) || 1));
ipcMain.handle('app.zoom.get', (event) => event.sender.getZoomFactor());

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => app.quit());
`;
}

/** Preload 模板（各技术栈共用；window 模式追加设置窗口 API） */
function preloadTemplate(withSettingsWindow) {
    const appApi = [
        `        zoomSet: (factor) => ipcRenderer.invoke('app.zoom.set', factor),`,
        `        zoomGet: () => ipcRenderer.invoke('app.zoom.get'),`,
        `        onZoomChanged: (callback) => ipcRenderer.on('app:zoomChanged', (_e, factor) => callback(factor)),`
    ];
    if (withSettingsWindow) {
        appApi.push(
            `        openSettings: () => ipcRenderer.invoke('app.settings.open'),`,
            `        closeSettings: () => ipcRenderer.invoke('app.settings.close'),`,
            `        notifySettingsChanged: (payload) => ipcRenderer.send('app.settings.changed', payload),`,
            `        onSettingsChanged: (callback) => ipcRenderer.on('app:settingsChanged', (_e, payload) => callback(payload))`
        );
    }

    return `/**
 * ${TOKEN_NAME} — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core 公共服务（黑盒式，APP 不传 appId）
 * 以及本 APP 自有能力（缩放${withSettingsWindow ? '、设置窗口' : ''}）。
 */

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // === canbox-core 公共服务 ===
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
    },

    // === 本 APP 自有能力 ===
    app: {
${appApi.join('\n')}
    }
});
`;
}

/** 基础能力④：全局禁止选中与复制（输入控件除外），并提供桌面风格基础样式 */
function globalCssTemplate() {
    return `/* ${TOKEN_NAME} — 全局样式 */

* {
    box-sizing: border-box;
}

html,
body,
#app {
    height: 100%;
    margin: 0;
}

body {
    font-family: 'Segoe UI', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    font-size: 14px;
    color: #303133;
    background: #f5f7fa;
    /* 基础能力④：全局禁止选中与复制 */
    user-select: none;
    -webkit-user-select: none;
    -moz-user-select: none;
    -ms-user-select: none;
}

/* 例外：输入类控件恢复可选中，保证正常编辑 */
input,
textarea,
select,
[contenteditable='true'] {
    user-select: text;
    -webkit-user-select: text;
}

.shell {
    display: flex;
    flex-direction: column;
    height: 100%;
}

.shell-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #ffffff;
    border-bottom: 1px solid #e4e7ed;
}

.shell-title {
    font-size: 16px;
    font-weight: 600;
}

.shell-nav {
    display: flex;
    gap: 8px;
}

.nav-btn {
    padding: 6px 16px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #606266;
    font-size: 14px;
    cursor: pointer;
}

.nav-btn:hover {
    background: #ecf5ff;
}

.nav-btn.active {
    background: #409eff;
    color: #ffffff;
}

.shell-body {
    flex: 1;
    padding: 20px;
    overflow-y: auto;
}

/* 基础能力③：切换界面仅改变显示，不销毁界面内容，状态得以保留 */
.view[hidden] {
    display: none;
}

.view h2 {
    margin: 0 0 8px 0;
    font-size: 18px;
}

.view h3 {
    margin: 20px 0 8px 0;
    font-size: 15px;
}

.hint {
    margin: 0 0 16px 0;
    color: #909399;
    line-height: 1.6;
}

.field {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-bottom: 16px;
}

.field input,
.select {
    padding: 8px 10px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #ffffff;
    font-size: 14px;
    outline: none;
}

.field input:focus,
.select:focus {
    border-color: #409eff;
}

.settings-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
}

.settings-header h2 {
    margin: 0;
}

.settings-row {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 16px;
}

.settings-label {
    min-width: 72px;
    color: #606266;
}

/* 设置打开方式：新窗口 */
.settings-window {
    height: 100%;
    padding: 20px 24px;
    overflow-y: auto;
}

/* 设置打开方式：弹层 */
.modal-mask {
    position: fixed;
    inset: 0;
    z-index: 1000;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.45);
}

.modal-mask[hidden] {
    display: none;
}

.modal-panel {
    width: min(680px, 90vw);
    max-height: 85vh;
    padding: 20px 24px;
    overflow-y: auto;
    border-radius: 10px;
    background: #ffffff;
}

.progress {
    height: 10px;
    background: #ebeef5;
    border-radius: 5px;
    overflow: hidden;
}

.progress-bar {
    height: 100%;
    width: 0;
    background: #409eff;
    transition: width 0.2s;
}

.actions {
    display: flex;
    gap: 8px;
}

.btn {
    padding: 7px 16px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    background: #ffffff;
    color: #606266;
    font-size: 14px;
    cursor: pointer;
}

.btn:hover {
    border-color: #409eff;
    color: #409eff;
}

.btn.primary {
    background: #409eff;
    border-color: #409eff;
    color: #ffffff;
}

.btn.primary:hover {
    background: #66b1ff;
    color: #ffffff;
}

/* 基础能力⑤：设置界面中的快捷键条目 */
.shortcuts {
    border-collapse: collapse;
    min-width: 320px;
}

.shortcuts th,
.shortcuts td {
    padding: 8px 12px;
    border: 1px solid #e4e7ed;
    text-align: left;
    font-size: 14px;
}

.shortcuts th {
    background: #fafafa;
    font-weight: 600;
}

kbd {
    display: inline-block;
    padding: 1px 6px;
    border: 1px solid #d0d0d0;
    border-bottom-width: 2px;
    border-radius: 4px;
    background: #ffffff;
    font-family: inherit;
    font-size: 12px;
}

.plus {
    color: #909399;
}
`;
}

/** 渲染进程缩放逻辑（Vue 模板共用） */
function zoomModuleTemplate(ts) {
    const returns = ts ? ': void' : '';
    const param = ts ? ': number' : '';
    return `/**
 * 基础能力①：界面缩放 —— Ctrl + 鼠标滚轮（主进程 setZoomFactor 生效，比例持久化）
 */
let zoomFactor = 1;

export function setupZoom()${returns} {
    window.api.app.zoomGet().then((value${param}) => {
        if (typeof value === 'number') zoomFactor = value;
    });
    window.api.app.onZoomChanged((value${param}) => {
        zoomFactor = value;
    });

    window.addEventListener(
        'wheel',
        (event) => {
            if (!event.ctrlKey) return;
            event.preventDefault();
            const next = zoomFactor + (event.deltaY > 0 ? -0.1 : 0.1);
            window.api.app.zoomSet(Math.min(2, Math.max(0.5, Math.round(next * 10) / 10)));
        },
        { passive: false }
    );
}
`;
}

function vueIndexHtml(ext) {
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${TOKEN_NAME}</title>
</head>
<body>
    <div id="app"></div>
    <script type="module" src="/src/main.${ext}"></script>
</body>
</html>
`;
}

function viteConfigTemplate() {
    return `import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
    plugins: [vue()],
    // Electron 以 file:// 加载构建产物，必须使用相对路径
    base: './',
    build: {
        outDir: 'build',
        emptyOutDir: true
    },
    server: {
        port: 5173,
        strictPort: true
    }
});
`;
}

/** 各技术栈共用的 Vue i18n 初始化 */
function vueI18nTemplate() {
    return `import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const SUPPORTED = ['zh-CN', 'en-US'];

function detectLocale() {
    try {
        const saved = localStorage.getItem('app.locale');
        if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
    } catch (e) {}
    return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US';
}

const i18n = createI18n({
    legacy: false,
    locale: detectLocale(),
    fallbackLocale: 'en-US',
    messages: {
        'zh-CN': zhCN,
        'en-US': enUS
    }
});

/**
 * 语言设置的最终来源是 canbox store；
 * localStorage 仅作为首帧镜像，避免异步读取完成前出现语言闪烁。
 */
export async function loadSavedLocale() {
    try {
        const saved = await window.api.store.get('settings', 'language');
        if (typeof saved === 'string' && SUPPORTED.indexOf(saved) >= 0) {
            i18n.global.locale.value = saved;
            localStorage.setItem('app.locale', saved);
        }
    } catch (e) {}
}

export default i18n;
`;
}

function appVueTemplate(settingsMode, ts) {
    const lang = ts ? ' lang="ts"' : '';
    const typing = ts ? ': KeyboardEvent' : '';
    const returns = ts ? ': void' : '';

    if (settingsMode === 'view') {
        return `<script setup${lang}>
import { onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const route = useRoute();
const router = useRouter();

function onKeydown(event${typing})${returns} {
    // 基础能力⑤：Ctrl+, 打开设置（用物理按键 e.code 判断，避免修饰键/输入法干扰）
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        router.push('/settings');
        return;
    }
    if (event.key === 'Escape' && route.name === 'settings') {
        router.push('/');
    }
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="shell">
        <header class="shell-header">
            <span class="shell-title">{{ t('app.title') }}</span>
            <nav class="shell-nav">
                <button class="nav-btn" :class="{ active: route.name === 'home' }" @click="router.push('/')">{{ t('nav.home') }}</button>
                <button class="nav-btn" :class="{ active: route.name === 'settings' }" @click="router.push('/settings')">{{ t('nav.settings') }}</button>
            </nav>
        </header>
        <main class="shell-body">
            <!-- 基础能力③：keep-alive 缓存视图实例，切换界面不中断、不重置 -->
            <router-view v-slot="{ Component }">
                <keep-alive>
                    <component :is="Component" />
                </keep-alive>
            </router-view>
        </main>
    </div>
</template>
`;
    }

    if (settingsMode === 'modal') {
        return `<script setup${lang}>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import HomeView from './views/HomeView.vue';
import SettingsView from './views/SettingsView.vue';

const { t } = useI18n();
const showSettings = ref(false);

function openSettings()${returns} {
    showSettings.value = true;
}

function closeSettings()${returns} {
    showSettings.value = false;
}

function onKeydown(event${typing})${returns} {
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        openSettings();
        return;
    }
    if (event.key === 'Escape' && showSettings.value) closeSettings();
}

onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div class="shell">
        <header class="shell-header">
            <span class="shell-title">{{ t('app.title') }}</span>
            <nav class="shell-nav">
                <button class="nav-btn" :class="{ active: !showSettings }" @click="closeSettings">{{ t('nav.home') }}</button>
                <button class="nav-btn" :class="{ active: showSettings }" @click="openSettings">{{ t('nav.settings') }}</button>
            </nav>
        </header>
        <main class="shell-body">
            <!-- 基础能力③：主界面始终挂载，弹层打开设置不丢失状态 -->
            <HomeView />
        </main>
    </div>
    <div v-if="showSettings" class="modal-mask" @click.self="closeSettings">
        <div class="modal-panel">
            <SettingsView @close="closeSettings" />
        </div>
    </div>
</template>
`;
    }

    // window 模式
    return `<script setup${lang}>
import { onMounted, onBeforeUnmount } from 'vue';
import { useI18n } from 'vue-i18n';
import HomeView from './views/HomeView.vue';
import SettingsView from './views/SettingsView.vue';

const { t, locale } = useI18n();
const isSettingsWindow${ts ? ': boolean' : ''} = new URLSearchParams(window.location.search).has('settingsWindow');

function openSettings()${returns} {
    window.api.app.openSettings();
}

function closeSettings()${returns} {
    window.api.app.closeSettings();
}

function onKeydown(event${typing})${returns} {
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        openSettings();
        return;
    }
    if (event.key === 'Escape' && isSettingsWindow) closeSettings();
}

onMounted(() => {
    window.addEventListener('keydown', onKeydown);
    // 设置窗口修改语言后，主窗口据此同步界面
    window.api.app.onSettingsChanged((payload${ts ? ': { language?: string }' : ''}) => {
        if (payload && typeof payload.language === 'string') locale.value = payload.language;
    });
});
onBeforeUnmount(() => window.removeEventListener('keydown', onKeydown));
</script>

<template>
    <div v-if="isSettingsWindow" class="settings-window">
        <SettingsView @close="closeSettings" />
    </div>
    <div v-else class="shell">
        <header class="shell-header">
            <span class="shell-title">{{ t('app.title') }}</span>
            <nav class="shell-nav">
                <button class="nav-btn active">{{ t('nav.home') }}</button>
                <button class="nav-btn" @click="openSettings">{{ t('nav.settings') }}</button>
            </nav>
        </header>
        <main class="shell-body">
            <HomeView />
        </main>
    </div>
</template>
`;
}

function homeViewTemplate(ts) {
    return `<script setup${ts ? ' lang="ts"' : ''}>
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();
const note = ref('');
const progress = ref(0);
${ts ? 'let timer: ReturnType<typeof setInterval> | null = null;' : 'let timer = null;'}

// 演示基础能力③：切到「设置」再回到本页，输入内容与任务进度原样保留
function startTask()${ts ? ': void' : ''} {
    if (timer) return;
    timer = setInterval(() => {
        progress.value += 5;
        if (progress.value >= 100) {
            progress.value = 100;
            clearInterval(timer);
            timer = null;
        }
    }, 300);
}

function resetTask()${ts ? ': void' : ''} {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    progress.value = 0;
}
</script>

<template>
    <section class="view">
        <h2>{{ t('home.title') }}</h2>
        <p class="hint">{{ t('home.hint') }}</p>
        <label class="field">
            <span>{{ t('home.note') }}</span>
            <input v-model="note" :placeholder="t('home.notePlaceholder')" />
        </label>
        <div class="field">
            <span>{{ t('home.progress', { percent: progress }) }}</span>
            <div class="progress">
                <div class="progress-bar" :style="{ width: progress + '%' }"></div>
            </div>
        </div>
        <div class="actions">
            <button class="btn primary" @click="startTask">{{ t('home.start') }}</button>
            <button class="btn" @click="resetTask">{{ t('home.reset') }}</button>
        </div>
    </section>
</template>
`;
}

function settingsViewTemplate(settingsMode, ts) {
    const withClose = settingsMode !== 'view';
    const notifyMainWindow = settingsMode === 'window';
    const emitDecl = withClose ? `\nconst emit = defineEmits(['close']);\n` : '';
    const closeButton = withClose
        ? `\n            <button class="btn" @click="emit('close')">{{ t('settings.close') }}</button>`
        : '';

    return `<script setup${ts ? ' lang="ts"' : ''}>
import { computed, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t, locale } = useI18n();
const currentLocale = ref(locale.value);${emitDecl}
const LANGUAGES = [
    { value: 'zh-CN', label: '简体中文' },
    { value: 'en-US', label: 'English' }
];

// 基础能力⑤：快捷键清单需与主进程、渲染层实际实现保持一致
const shortcuts = computed(() => [
    { keys: 'Ctrl + ' + t('shortcut.wheel'), desc: t('shortcut.zoomWheel') },
    { keys: 'Ctrl + =', desc: t('shortcut.zoomIn') },
    { keys: 'Ctrl + -', desc: t('shortcut.zoomOut') },
    { keys: 'Ctrl + 0', desc: t('shortcut.zoomReset') },
    { keys: 'Ctrl + ,', desc: t('shortcut.openSettings') },
    { keys: 'Esc', desc: t('shortcut.closeSettings') }
]);

/** 语言设置以 canbox store 为准，localStorage 仅作首帧镜像 */
function applyLocale(value${ts ? ': string' : ''})${ts ? ': void' : ''} {
    locale.value = value;
    currentLocale.value = value;
    try {
        localStorage.setItem('app.locale', value);
    } catch (e) {}
    window.api.store.set('settings', 'language', value).catch(() => {});
    ${notifyMainWindow ? "window.api.app.notifySettingsChanged({ language: value });" : ''}
}

function onLanguageChange(event${ts ? ': Event' : ''})${ts ? ': void' : ''} {
    const target = event.target${ts ? ' as HTMLSelectElement' : ''};
    applyLocale(target.value);
}
</script>

<template>
    <section class="view settings-view">
        <div class="settings-header">
            <h2>{{ t('settings.title') }}</h2>${closeButton}
        </div>
        <p class="hint">{{ t('settings.hint') }}</p>
        <div class="settings-row">
            <span class="settings-label">{{ t('settings.language') }}</span>
            <select class="select" :value="currentLocale" @change="onLanguageChange">
                <option v-for="lang in LANGUAGES" :key="lang.value" :value="lang.value">{{ lang.label }}</option>
            </select>
        </div>
        <h3>{{ t('settings.shortcuts') }}</h3>
        <table class="shortcuts">
            <thead>
                <tr><th>{{ t('settings.shortcut') }}</th><th>{{ t('settings.action') }}</th></tr>
            </thead>
            <tbody>
                <tr v-for="item in shortcuts" :key="item.desc">
                    <td>
                        <template v-for="(key, index) in item.keys.split(' + ')" :key="index">
                            <span v-if="index > 0"> + </span><kbd>{{ key }}</kbd>
                        </template>
                    </td>
                    <td>{{ item.desc }}</td>
                </tr>
            </tbody>
        </table>
    </section>
</template>
`;
}

function routerTemplate() {
    return `import { createRouter, createWebHashHistory } from 'vue-router';
import HomeView from './views/HomeView.vue';
import SettingsView from './views/SettingsView.vue';

const router = createRouter({
    history: createWebHashHistory(),
    routes: [
        { path: '/', name: 'home', component: HomeView },
        { path: '/settings', name: 'settings', component: SettingsView }
    ]
});

export default router;
`;
}

function vueEntryTemplate(settingsMode) {
    const withRouter = settingsMode === 'view';
    const routerImport = withRouter ? `import router from './router';\n` : '';
    const routerUse = withRouter ? `    .use(router)\n` : '';

    return `import { createApp } from 'vue';
import App from './App.vue';
${routerImport}import i18n, { loadSavedLocale } from './i18n';
import './styles/global.css';
import { setupZoom } from './zoom';

createApp(App)
${routerUse}    .use(i18n)
    .mount('#app');

setupZoom();
loadSavedLocale();
`;
}

function tsConfigTemplate() {
    return `{
    "compilerOptions": {
        "target": "ES2022",
        "module": "ESNext",
        "moduleResolution": "Bundler",
        "strict": true,
        "isolatedModules": true,
        "esModuleInterop": true,
        "skipLibCheck": true,
        "noEmit": true,
        "lib": ["ES2022", "DOM", "DOM.Iterable"],
        "types": ["vite/client"]
    },
    "include": ["src/**/*.ts", "src/**/*.d.ts", "src/**/*.vue", "vite.config.js"]
}
`;
}

function envDTemplate() {
    return `/// <reference types="vite/client" />

interface Window {
    api: {
        store: {
            get: (name: string, key: string) => Promise<unknown>;
            set: (name: string, key: string, value: unknown) => Promise<void>;
            delete: (name: string, key: string) => Promise<void>;
            clear: (name: string) => Promise<void>;
        };
        app: {
            zoomGet: () => Promise<number>;
            zoomSet: (factor: number) => Promise<number>;
            onZoomChanged: (callback: (factor: number) => void) => void;
            openSettings: () => Promise<void>;
            closeSettings: () => Promise<void>;
            notifySettingsChanged: (payload: Record<string, unknown>) => void;
            onSettingsChanged: (callback: (payload: Record<string, unknown>) => void) => void;
        };
    };
}

declare module '*.vue' {
    import type { DefineComponent } from 'vue';
    const component: DefineComponent<Record<string, never>, Record<string, never>, unknown>;
    export default component;
}
`;
}

const SETTINGS_MODE_LABELS = {
    view: '切换界面',
    modal: '弹层',
    window: '新窗口'
};

function readmeTemplate(templateId, settingsMode) {
    const vue = templateId !== 'vanilla-js';
    const lines = [
        `# ${TOKEN_NAME}`,
        '',
        '基于 canbox 平台的桌面 APP，由 canbox-developer 生成。',
        ''
    ];
    if (vue) {
        lines.push(
            '## 开发',
            '',
            '```bash',
            'npm install',
            '```',
            '',
            '调试时先在终端启动 Vite 开发服务器：',
            '',
            '```bash',
            'npm run dev',
            '```',
            '',
            '然后在 canbox-developer 的「开发项目」中点击运行，或执行 `npm run start`。',
            '',
            '## 构建',
            '',
            '```bash',
            'npm run build',
            '```',
            '',
            '构建产物输出到 `build/`，`npm run start` 会优先加载构建产物（无需开发服务器）。',
            '',
            '## 打包分发',
            '',
            '在 canbox-developer 的「开发项目」中点击打包按钮，选择构建产物目录压成 canbox 标准 zip。',
            ''
        );
    } else {
        lines.push(
            '## 开发',
            '',
            '```bash',
            'npm install',
            '```',
            '',
            '无构建步骤，直接启动：',
            '',
            '```bash',
            'npm run start',
            '```',
            '',
            '也可在 canbox-developer 的「开发项目」中点击运行。',
            ''
        );
    }

    lines.push(
        '## 基础能力',
        '',
        '- 界面缩放：`Ctrl` + 滚轮、`Ctrl` + `=`、`Ctrl` + `-`、`Ctrl` + `0`（比例持久化）',
        '- 窗口大小与位置记忆恢复',
        '- 界面切换状态保持（切换显示而非销毁界面）',
        '- 全局禁止选中与复制（输入控件除外）',
        '- 「设置」界面中的快捷键条目',
        '- 中英双语：设置中切换语言，canbox store 持久化，重启后保持',
        `- 设置打开方式：${SETTINGS_MODE_LABELS[settingsMode]}`,
        '',
        '## 图标',
        '',
        '已预置默认图标；替换根目录的 `logo.png` 与 `icons/` 下的 PNG 即可更换 APP 图标。',
        ''
    );

    return lines.join('\n');
}

/** package.json（按技术栈与设置打开方式产出对应依赖与脚本） */
function buildPackageJson(options) {
    const { name, description, author, template, injectionPath, electronRange, settingsMode } = options;
    const startScript = `electron -r "${injectionPath}" . --app-id=${name} --no-sandbox`;

    const pkg = {
        name,
        version: '0.0.1',
        description: description || '',
        main: 'main.js',
        author: author || '',
        license: 'Apache-2.0',
        logo: 'logo.png'
    };

    if (template === 'vanilla-js') {
        pkg.scripts = { start: startScript };
        pkg.devDependencies = { electron: electronRange };
        return pkg;
    }

    pkg.scripts = {
        dev: 'vite',
        build: 'vite build',
        start: startScript
    };
    pkg.dependencies = {
        vue: VUE_VERSION,
        'vue-i18n': VUE_I18N_VERSION
    };
    if (settingsMode === 'view') {
        pkg.dependencies['vue-router'] = VUE_ROUTER_VERSION;
    }
    pkg.devDependencies = {
        '@vitejs/plugin-vue': PLUGIN_VUE_VERSION,
        electron: electronRange,
        vite: VITE_VERSION
    };
    if (template === 'vue3-ts') {
        pkg.devDependencies.typescript = TS_VERSION;
    }
    return pkg;
}

/** Vue 技术栈（JS / TS）文件集 */
function buildVueFiles(options) {
    const ts = options.template === 'vue3-ts';
    const ext = ts ? 'ts' : 'js';
    const mode = options.settingsMode;
    const files = {
        'package.json': JSON.stringify(buildPackageJson(options), null, 4) + '\n',
        'main.js': mainJsTemplate(mode === 'window'),
        'preload.js': preloadTemplate(mode === 'window'),
        'index.html': vueIndexHtml(ext),
        'vite.config.js': viteConfigTemplate(),
        'README.md': readmeTemplate(options.template, mode),
        ['src/main.' + ext]: vueEntryTemplate(mode),
        ['src/i18n/index.' + ext]: vueI18nTemplate(),
        'src/i18n/locales/zh-CN.json': JSON.stringify(MESSAGES['zh-CN'], null, 4) + '\n',
        'src/i18n/locales/en-US.json': JSON.stringify(MESSAGES['en-US'], null, 4) + '\n',
        ['src/zoom.' + ext]: zoomModuleTemplate(ts),
        'src/App.vue': appVueTemplate(mode, ts),
        'src/views/HomeView.vue': homeViewTemplate(ts),
        'src/views/SettingsView.vue': settingsViewTemplate(mode, ts),
        'src/styles/global.css': globalCssTemplate()
    };
    if (mode === 'view') {
        files['src/router.' + ext] = routerTemplate();
    }
    if (ts) {
        files['tsconfig.json'] = tsConfigTemplate();
        files['src/env.d.ts'] = envDTemplate();
    }
    return files;
}

/** 原生 JavaScript 技术栈（无构建）文件集 */
function buildVanillaFiles(options) {
    const mode = options.settingsMode;
    return {
        'package.json': JSON.stringify(buildPackageJson(options), null, 4) + '\n',
        'main.js': mainJsTemplate(mode === 'window'),
        'preload.js': preloadTemplate(mode === 'window'),
        'index.html': vanillaIndexHtml(),
        'README.md': readmeTemplate(options.template, mode),
        'src/i18n.js': vanillaI18nTemplate(),
        'src/app.js': vanillaAppTemplate(mode),
        'src/styles/global.css': globalCssTemplate()
    };
}

function vanillaIndexHtml() {
    return `<!doctype html>
<html lang="zh-CN">
<head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${TOKEN_NAME}</title>
    <link rel="stylesheet" href="./src/styles/global.css" />
</head>
<body>
    <div id="app"></div>
    <script src="./src/i18n.js"></script>
    <script src="./src/app.js"></script>
</body>
</html>
`;
}

/** 原生 JavaScript 的轻量 i18n（无构建依赖，挂在 window.AppI18n） */
function vanillaI18nTemplate() {
    return `/**
 * ${TOKEN_NAME} — 轻量 i18n（无构建依赖）
 */
(function () {
    const STORAGE_KEY = 'app.locale';
    const SUPPORTED = ['zh-CN', 'en-US'];
    const MESSAGES = ${JSON.stringify(MESSAGES, null, 8)};

    function detectLocale() {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved && SUPPORTED.indexOf(saved) >= 0) return saved;
        } catch (e) {}
        return navigator.language.startsWith('zh') ? 'zh-CN' : 'en-US';
    }

    let locale = detectLocale();

    function lookup(object, path) {
        return path.split('.').reduce(function (value, key) {
            return value !== undefined && value !== null ? value[key] : undefined;
        }, object);
    }

    function t(key, params) {
        let text = lookup(MESSAGES[locale], key);
        if (text === undefined) text = lookup(MESSAGES['en-US'], key);
        if (text === undefined) text = key;
        if (params) {
            Object.keys(params).forEach(function (name) {
                text = text.split('{' + name + '}').join(String(params[name]));
            });
        }
        return text;
    }

    function setLocale(value) {
        if (SUPPORTED.indexOf(value) < 0) return;
        locale = value;
        try {
            localStorage.setItem(STORAGE_KEY, value);
        } catch (e) {}
    }

    function getLocale() {
        return locale;
    }

    function apply(root) {
        const scope = root || document;
        scope.querySelectorAll('[data-i18n]').forEach(function (element) {
            element.textContent = t(element.getAttribute('data-i18n'));
        });
        scope.querySelectorAll('[data-i18n-placeholder]').forEach(function (element) {
            element.setAttribute('placeholder', t(element.getAttribute('data-i18n-placeholder')));
        });
    }

    window.AppI18n = {
        t: t,
        setLocale: setLocale,
        getLocale: getLocale,
        apply: apply
    };
})();
`;
}

/** 原生 JavaScript 的共享逻辑（三种设置打开方式共用） */
function vanillaSharedJs(settingsMode) {
    const notify = settingsMode === 'window'
        ? `\n    canboxApi.app.notifySettingsChanged({ language: value });`
        : '';

    return `const canboxApi = window.api;
const i18n = window.AppI18n;

let progress = 0;
let timer = null;

// 基础能力⑤：快捷键清单需与主进程、渲染层实际实现保持一致
const SHORTCUTS = [
    [['Ctrl', 'WHEEL'], 'shortcut.zoomWheel'],
    [['Ctrl', '='], 'shortcut.zoomIn'],
    [['Ctrl', '-'], 'shortcut.zoomOut'],
    [['Ctrl', '0'], 'shortcut.zoomReset'],
    [['Ctrl', ','], 'shortcut.openSettings'],
    [['Esc'], 'shortcut.closeSettings']
];

function shortcutRowsHtml() {
    return SHORTCUTS.map(function (item) {
        const keys = item[0].map(function (key) {
            return key === 'WHEEL' ? i18n.t('shortcut.wheel') : key;
        });
        const cells = keys.map(function (key) {
            return '<kbd>' + key + '</kbd>';
        }).join(' <span class="plus">+</span> ');
        return '<tr><td>' + cells + '</td><td>' + i18n.t(item[1]) + '</td></tr>';
    }).join('');
}

function renderShortcutRows() {
    const tbody = document.getElementById('shortcut-rows');
    if (tbody) tbody.innerHTML = shortcutRowsHtml();
}

function homeSection(id) {
    const attr = id ? ' id="' + id + '"' : '';
    return '<section class="view"' + attr + '>' +
        '<h2 data-i18n="home.title"></h2>' +
        '<p class="hint" data-i18n="home.hint"></p>' +
        '<label class="field"><span data-i18n="home.note"></span>' +
        '<input id="note" type="text" data-i18n-placeholder="home.notePlaceholder" /></label>' +
        '<div class="field"><span id="progress-text"></span>' +
        '<div class="progress"><div id="progress-bar" class="progress-bar"></div></div></div>' +
        '<div class="actions"><button id="start-task" class="btn primary" data-i18n="home.start"></button>' +
        '<button id="reset-task" class="btn" data-i18n="home.reset"></button></div>' +
        '</section>';
}

function settingsSection(options) {
    const id = options.id ? ' id="' + options.id + '"' : '';
    const hidden = options.hidden ? ' hidden' : '';
    const closeButton = options.close
        ? '<button id="settings-close" class="btn" data-i18n="settings.close"></button>'
        : '';
    return '<section class="view settings-view"' + id + hidden + '>' +
        '<div class="settings-header"><h2 data-i18n="settings.title"></h2>' + closeButton + '</div>' +
        '<p class="hint" data-i18n="settings.hint"></p>' +
        '<div class="settings-row"><span class="settings-label" data-i18n="settings.language"></span>' +
        '<select id="language-select" class="select">' +
        '<option value="zh-CN">简体中文</option>' +
        '<option value="en-US">English</option>' +
        '</select></div>' +
        '<h3 data-i18n="settings.shortcuts"></h3>' +
        '<table class="shortcuts"><thead><tr>' +
        '<th data-i18n="settings.shortcut"></th><th data-i18n="settings.action"></th>' +
        '</tr></thead><tbody id="shortcut-rows"></tbody></table>' +
        '</section>';
}

function renderProgress() {
    const text = document.getElementById('progress-text');
    const bar = document.getElementById('progress-bar');
    if (!text || !bar) return;
    text.textContent = i18n.t('home.progress', { percent: progress });
    bar.style.width = progress + '%';
}

function bindHome() {
    const start = document.getElementById('start-task');
    const reset = document.getElementById('reset-task');
    if (!start || !reset) return;
    start.addEventListener('click', function () {
        if (timer) return;
        timer = setInterval(function () {
            progress = Math.min(100, progress + 5);
            if (progress >= 100) {
                clearInterval(timer);
                timer = null;
            }
            renderProgress();
        }, 300);
    });
    reset.addEventListener('click', function () {
        if (timer) {
            clearInterval(timer);
            timer = null;
        }
        progress = 0;
        renderProgress();
    });
}

function applyLocale(value) {
    i18n.setLocale(value);
    i18n.apply();
    renderShortcutRows();
    renderProgress();
    canboxApi.store.set('settings', 'language', value).catch(function () {});${notify}
}

function bindLanguageSelect() {
    const select = document.getElementById('language-select');
    if (!select) return;
    select.value = i18n.getLocale();
    select.addEventListener('change', function (event) {
        applyLocale(event.target.value);
    });
}

function refreshTexts() {
    i18n.apply();
    renderShortcutRows();
    renderProgress();
    const select = document.getElementById('language-select');
    if (select) select.value = i18n.getLocale();
}

// 语言设置以 canbox store 为准，localStorage 仅作首帧镜像
canboxApi.store.get('settings', 'language').then(function (saved) {
    if (typeof saved !== 'string' || saved === i18n.getLocale()) return;
    i18n.setLocale(saved);
    refreshTexts();
}).catch(function () {});

// ===== 基础能力①：Ctrl + 鼠标滚轮缩放界面 =====
let zoomFactor = 1;

canboxApi.app.zoomGet().then(function (value) {
    if (typeof value === 'number') zoomFactor = value;
});
canboxApi.app.onZoomChanged(function (value) {
    zoomFactor = value;
});

window.addEventListener(
    'wheel',
    function (event) {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const next = zoomFactor + (event.deltaY > 0 ? -0.1 : 0.1);
        canboxApi.app.zoomSet(Math.min(2, Math.max(0.5, Math.round(next * 10) / 10)));
    },
    { passive: false }
);
`;
}

/** 原生 JavaScript 渲染进程入口（按设置打开方式选择不同界面结构） */
function vanillaAppTemplate(settingsMode) {
    const shared = vanillaSharedJs(settingsMode);
    const header = `'<header class="shell-header"><span class="shell-title" data-i18n="app.title"></span>' +
    '<nav class="shell-nav">' +
    '<button id="nav-home" class="nav-btn active" data-i18n="nav.home"></button>' +
    '<button id="nav-settings" class="nav-btn" data-i18n="nav.settings"></button>' +
    '</nav></header>'`;

    let modeBlock;

    if (settingsMode === 'view') {
        modeBlock = `// ===== 基础能力③：界面切换（仅切换显示，不销毁 DOM，状态保留）=====
const root = document.getElementById('app');
root.innerHTML = '<div class="shell">' + ${header} +
    '<main class="shell-body">' + homeSection('view-home') +
    settingsSection({ id: 'view-settings', hidden: true }) + '</main></div>';

function switchView(name) {
    document.getElementById('view-home').hidden = name !== 'home';
    document.getElementById('view-settings').hidden = name !== 'settings';
    document.getElementById('nav-home').classList.toggle('active', name === 'home');
    document.getElementById('nav-settings').classList.toggle('active', name === 'settings');
}

document.getElementById('nav-home').addEventListener('click', function () {
    switchView('home');
});
document.getElementById('nav-settings').addEventListener('click', function () {
    switchView('settings');
});

// 基础能力⑤：Ctrl+, 打开设置；Esc 关闭设置
window.addEventListener('keydown', function (event) {
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        switchView('settings');
        return;
    }
    if (event.key === 'Escape') switchView('home');
});

bindHome();
bindLanguageSelect();
refreshTexts();
`;
    } else if (settingsMode === 'modal') {
        modeBlock = `// ===== 设置弹层：主界面始终挂载，打开设置不丢失状态 =====
const root = document.getElementById('app');
root.innerHTML = '<div class="shell">' + ${header} +
    '<main class="shell-body">' + homeSection() + '</main></div>' +
    '<div id="modal-mask" class="modal-mask" hidden><div class="modal-panel">' +
    settingsSection({ close: true }) + '</div></div>';

function setSettingsOpen(open) {
    document.getElementById('modal-mask').hidden = !open;
    document.getElementById('nav-home').classList.toggle('active', !open);
    document.getElementById('nav-settings').classList.toggle('active', open);
}

document.getElementById('nav-home').addEventListener('click', function () {
    setSettingsOpen(false);
});
document.getElementById('nav-settings').addEventListener('click', function () {
    setSettingsOpen(true);
});
document.getElementById('settings-close').addEventListener('click', function () {
    setSettingsOpen(false);
});
document.getElementById('modal-mask').addEventListener('click', function (event) {
    if (event.target === event.currentTarget) setSettingsOpen(false);
});

// 基础能力⑤：Ctrl+, 打开设置；Esc 关闭设置
window.addEventListener('keydown', function (event) {
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        setSettingsOpen(true);
        return;
    }
    if (event.key === 'Escape') setSettingsOpen(false);
});

bindHome();
bindLanguageSelect();
refreshTexts();
`;
    } else {
        modeBlock = `// ===== 设置新窗口：主窗口与设置窗口共用本脚本 =====
const root = document.getElementById('app');
const isSettingsWindow = new URLSearchParams(location.search).has('settingsWindow');

function openSettingsWindow() {
    canboxApi.app.openSettings();
}

function closeSettingsWindow() {
    canboxApi.app.closeSettings();
}

if (isSettingsWindow) {
    root.innerHTML = '<div class="settings-window">' + settingsSection({ close: true }) + '</div>';
    document.getElementById('settings-close').addEventListener('click', closeSettingsWindow);
    window.addEventListener('keydown', function (event) {
        if (event.key === 'Escape') closeSettingsWindow();
    });
} else {
    root.innerHTML = '<div class="shell">' +
        '<header class="shell-header"><span class="shell-title" data-i18n="app.title"></span>' +
        '<nav class="shell-nav">' +
        '<button class="nav-btn active" data-i18n="nav.home"></button>' +
        '<button id="open-settings" class="nav-btn" data-i18n="nav.settings"></button>' +
        '</nav></header>' +
        '<main class="shell-body">' + homeSection() + '</main></div>';
    document.getElementById('open-settings').addEventListener('click', openSettingsWindow);
    window.addEventListener('keydown', function (event) {
        if (event.ctrlKey && event.code === 'Comma') {
            event.preventDefault();
            openSettingsWindow();
        }
    });

    // 设置窗口修改语言后同步主窗口
    canboxApi.app.onSettingsChanged(function (payload) {
        if (!payload || typeof payload.language !== 'string') return;
        i18n.setLocale(payload.language);
        refreshTexts();
    });
}

bindHome();
bindLanguageSelect();
refreshTexts();
`;
    }

    return `/**
 * ${TOKEN_NAME} — 渲染进程入口（原生 JavaScript，无构建步骤）
 *
 * 设置打开方式：${SETTINGS_MODE_LABELS[settingsMode]}
 */

${shared}
${modeBlock}`;
}

/**
 * 生成骨架文件集
 * @param {object} options - { name, description, author, template, settingsMode, injectionPath, electronRange }
 * @returns {{ files: Object<string, string> }}
 */
function buildScaffold(options) {
    const template = options.template || 'vue3-js';
    const settingsMode = SETTINGS_MODES.indexOf(options.settingsMode) >= 0 ? options.settingsMode : 'view';
    const normalized = { ...options, settingsMode };
    const files = template === 'vanilla-js' ? buildVanillaFiles(normalized) : buildVueFiles(normalized);

    // 占位符替换（用 split/join 避免正则特殊字符问题）
    const replacements = [
        [TOKEN_INJECTION, normalized.injectionPath],
        [TOKEN_ELECTRON, normalized.electronRange],
        [TOKEN_RENDERER, template === 'vanilla-js' ? 'static' : 'vite'],
        [TOKEN_NAME, normalized.name]
    ];
    const out = {};
    Object.keys(files).forEach((relPath) => {
        let content = files[relPath];
        replacements.forEach(([token, value]) => {
            content = content.split(token).join(value);
        });
        out[relPath] = content;
    });

    return { files: out };
}

module.exports = { buildScaffold, isValidAppName, SETTINGS_MODES };
