/**
 * canbox-developer — APP 项目骨架模板生成
 *
 * 纯函数模块：根据技术栈选项产出「相对路径 → 文件内容」映射，
 * 由 main.js 的 developer.scaffold.create 落盘。
 *
 * 支持的技术栈：
 *   vue3-js     Vue 3 + Vite + JavaScript（默认，含 vue-router）
 *   vue3-ts     Vue 3 + Vite + TypeScript
 *   vanilla-js  原生 JavaScript，无构建步骤
 *
 * 所有模板内置 canbox APP 五项基础能力：
 *   1. 界面缩放（Ctrl+滚轮 / Ctrl+= / Ctrl+- / Ctrl+0，比例持久化）
 *   2. 窗口大小与位置记忆恢复
 *   3. 界面切换状态保持（keep-alive / DOM 不销毁）
 *   4. 全局禁止选中与复制（输入控件除外）
 *   5. 设置界面中的快捷键条目
 */

'use strict';

const VUE_ROUTER_VERSION = '^4.4.5';
const VUE_VERSION = '^3.4.21';
const VITE_VERSION = '^5.4.6';
const PLUGIN_VUE_VERSION = '^5.1.2';
const TS_VERSION = '^5.6.2';

// 模板文件中的占位符
const TOKEN_NAME = '__NAME__';
const TOKEN_INJECTION = '__INJECTION__';
const TOKEN_ELECTRON = '__ELECTRON__';
const TOKEN_RENDERER = '__RENDERER__';

const SHORTCUT_ROWS = [
    ['<kbd>Ctrl</kbd> + 滚轮', '缩放界面（放大 / 缩小）'],
    ['<kbd>Ctrl</kbd> + <kbd>=</kbd>', '放大界面'],
    ['<kbd>Ctrl</kbd> + <kbd>-</kbd>', '缩小界面'],
    ['<kbd>Ctrl</kbd> + <kbd>0</kbd>', '重置缩放为 100%'],
    ['<kbd>Ctrl</kbd> + <kbd>,</kbd>', '打开设置'],
    ['<kbd>Esc</kbd>', '关闭设置']
];

/**
 * 校验 APP 名称可用作 package.json 的 name 与目录内代码标识
 * @param {string} name
 * @returns {boolean}
 */
function isValidAppName(name) {
    return typeof name === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(name);
}

/** 主进程入口模板（各技术栈共用，按 __RENDERER__ 区分渲染层加载方式） */
function mainJsTemplate() {
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

function loadRenderer(win) {
    if (RENDERER === 'static') {
        win.loadFile(STATIC_INDEX);
        return;
    }
    if (fs.existsSync(BUILT_INDEX)) {
        win.loadFile(BUILT_INDEX);
        return;
    }
    if (!app.isPackaged) {
        // 尚未构建（build/index.html 不存在）时连接 Vite 开发服务器，需先执行 npm run dev
        win.loadURL('http://localhost:5173');
        return;
    }
    win.loadFile(BUILT_INDEX);
}

/** 基础能力①：整窗等比缩放，并持久化缩放比例 */
function applyZoom(factor) {
    const next = clampZoom(factor);
    if (mainWindow) {
        mainWindow.webContents.setZoomFactor(next);
        mainWindow.webContents.send('app:zoomChanged', next);
    }
    store.set('zoomFactor', next);
    return next;
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

    // 基础能力①：Ctrl+= 放大 / Ctrl+- 缩小 / Ctrl+0 重置（用物理按键 e.code 判断）
    mainWindow.webContents.on('before-input-event', (event, input) => {
        if (!input.control || input.type !== 'keyDown') return;
        const current = mainWindow.webContents.getZoomFactor();
        let factor = null;
        if (input.code === 'Equal') factor = current + ZOOM_STEP;
        else if (input.code === 'Minus') factor = current - ZOOM_STEP;
        else if (input.code === 'Digit0' || input.code === 'Numpad0') factor = 1;
        if (factor === null) return;
        event.preventDefault();
        applyZoom(factor);
    });

    // 基础能力②：关闭前保存窗口状态
    mainWindow.on('close', () => {
        if (mainWindow && !mainWindow.isMinimized()) {
            store.set('bounds', mainWindow.getBounds());
        }
    });
    mainWindow.on('closed', () => {
        mainWindow = null;
    });

    loadRenderer(mainWindow);
}

// 渲染进程 Ctrl+滚轮（基础能力①）
ipcMain.handle('app.zoom.set', (_e, factor) => applyZoom(Number(factor) || 1));
ipcMain.handle('app.zoom.get', () => (mainWindow ? mainWindow.webContents.getZoomFactor() : 1));

app.whenReady().then(() => {
    createWindow();
    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

app.on('window-all-closed', () => app.quit());
`;
}

/** Preload 模板（各技术栈共用） */
function preloadTemplate() {
    return `/**
 * ${TOKEN_NAME} — Preload 脚本
 *
 * 通过 contextBridge 暴露 canbox-core 公共服务（黑盒式，APP 不传 appId）
 * 以及本 APP 自有能力（缩放）。
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
        zoomSet: (factor) => ipcRenderer.invoke('app.zoom.set', factor),
        zoomGet: () => ipcRenderer.invoke('app.zoom.get'),
        onZoomChanged: (callback) => ipcRenderer.on('app:zoomChanged', (_e, factor) => callback(factor))
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
body {
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

.field input {
    padding: 8px 10px;
    border: 1px solid #dcdfe6;
    border-radius: 6px;
    font-size: 14px;
    outline: none;
}

.field input:focus {
    border-color: #409eff;
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
`;
}

function shortcutsTableRows() {
    return SHORTCUT_ROWS.map(([keys, desc]) => `                    <tr><td>${keys}</td><td>${desc}</td></tr>`).join('\n');
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

function appVueTemplate(ts) {
    return `<script setup${ts ? ' lang="ts"' : ''}>
import { onMounted, onBeforeUnmount } from 'vue';
import { useRoute, useRouter } from 'vue-router';

const route = useRoute();
const router = useRouter();

function onKeydown(event${ts ? ': KeyboardEvent' : ''})${ts ? ': void' : ''} {
    // 基础能力⑤：Ctrl+, 打开设置（用物理按键 e.code 判断，避免修饰键/输入法干扰）
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        router.push('/settings');
        return;
    }
    // Esc 关闭设置
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
            <span class="shell-title">${TOKEN_NAME}</span>
            <nav class="shell-nav">
                <button class="nav-btn" :class="{ active: route.name === 'home' }" @click="router.push('/')">首页</button>
                <button class="nav-btn" :class="{ active: route.name === 'settings' }" @click="router.push('/settings')">设置</button>
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

function homeViewTemplate(ts) {
    return `<script setup${ts ? ' lang="ts"' : ''}>
import { ref } from 'vue';

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
        <h2>首页</h2>
        <p class="hint">切换界面后回到本页，输入内容与任务进度会原样保留。</p>
        <label class="field">
            <span>备忘</span>
            <input v-model="note" placeholder="输入内容，切到「设置」再回来看看" />
        </label>
        <div class="field">
            <span>长任务进度：{{ progress }}%</span>
            <div class="progress">
                <div class="progress-bar" :style="{ width: progress + '%' }"></div>
            </div>
        </div>
        <div class="actions">
            <button class="btn primary" @click="startTask">开始任务</button>
            <button class="btn" @click="resetTask">重置</button>
        </div>
    </section>
</template>
`;
}

function settingsViewTemplate() {
    return `<template>
    <section class="view">
        <h2>设置</h2>
        <p class="hint">窗口大小与位置、缩放比例会被记住，重启后自动恢复。</p>
        <h3>快捷键</h3>
        <table class="shortcuts">
            <thead>
                <tr><th>快捷键</th><th>功能</th></tr>
            </thead>
            <tbody>
${shortcutsTableRows()}
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

function vueEntryTemplate() {
    return `import { createApp } from 'vue';
import App from './App.vue';
import router from './router';
import './styles/global.css';
import { setupZoom } from './zoom';

createApp(App).use(router).mount('#app');
setupZoom();
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

function readmeTemplate(templateId) {
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
            '',
            '## 基础能力',
            '',
            '- 界面缩放：`Ctrl` + 滚轮、`Ctrl` + `=`、`Ctrl` + `-`、`Ctrl` + `0`（比例持久化）',
            '- 窗口大小与位置记忆恢复',
            '- 界面切换状态保持（路由视图 `keep-alive` 缓存）',
            '- 全局禁止选中与复制（输入控件除外）',
            '- 「设置」界面中的快捷键条目',
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
            '',
            '## 基础能力',
            '',
            '- 界面缩放：`Ctrl` + 滚轮、`Ctrl` + `=`、`Ctrl` + `-`、`Ctrl` + `0`（比例持久化）',
            '- 窗口大小与位置记忆恢复',
            '- 界面切换状态保持（切换显示而非销毁 DOM）',
            '- 全局禁止选中与复制（输入控件除外）',
            '- 「设置」界面中的快捷键条目',
            ''
        );
    }
    return lines.join('\n');
}

/** package.json（按技术栈产出对应依赖与脚本） */
function buildPackageJson(options) {
    const { name, description, author, template, injectionPath, electronRange } = options;
    const startScript = `electron -r "${injectionPath}" . --app-id=${name} --no-sandbox`;

    if (template === 'vanilla-js') {
        return {
            name,
            version: '0.0.1',
            description: description || '',
            main: 'main.js',
            author: author || '',
            license: 'Apache-2.0',
            scripts: {
                start: startScript
            },
            devDependencies: {
                electron: electronRange
            }
        };
    }

    const pkg = {
        name,
        version: '0.0.1',
        description: description || '',
        main: 'main.js',
        author: author || '',
        license: 'Apache-2.0',
        scripts: {
            dev: 'vite',
            build: 'vite build',
            start: startScript
        },
        dependencies: {
            vue: VUE_VERSION,
            'vue-router': VUE_ROUTER_VERSION
        },
        devDependencies: {
            '@vitejs/plugin-vue': PLUGIN_VUE_VERSION,
            electron: electronRange,
            vite: VITE_VERSION
        }
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
    const files = {
        'package.json': JSON.stringify(buildPackageJson(options), null, 4) + '\n',
        'main.js': mainJsTemplate(),
        'preload.js': preloadTemplate(),
        'index.html': vueIndexHtml(ext),
        'vite.config.js': viteConfigTemplate(),
        'README.md': readmeTemplate(options.template),
        ['src/main.' + ext]: vueEntryTemplate(),
        ['src/router.' + ext]: routerTemplate(),
        ['src/zoom.' + ext]: zoomModuleTemplate(ts),
        'src/App.vue': appVueTemplate(ts),
        'src/views/HomeView.vue': homeViewTemplate(ts),
        'src/views/SettingsView.vue': settingsViewTemplate(),
        'src/styles/global.css': globalCssTemplate()
    };
    if (ts) {
        files['tsconfig.json'] = tsConfigTemplate();
        files['src/env.d.ts'] = envDTemplate();
    }
    return files;
}

/** 原生 JavaScript 技术栈（无构建）文件集 */
function buildVanillaFiles(options) {
    const files = {
        'package.json': JSON.stringify(buildPackageJson(options), null, 4) + '\n',
        'main.js': mainJsTemplate(),
        'preload.js': preloadTemplate(),
        'index.html': vanillaIndexHtml(),
        'README.md': readmeTemplate(options.template),
        'src/app.js': vanillaAppTemplate(),
        'src/styles/global.css': globalCssTemplate()
    };
    return files;
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
    <div class="shell">
        <header class="shell-header">
            <span class="shell-title">${TOKEN_NAME}</span>
            <nav class="shell-nav">
                <button class="nav-btn active" data-view="home">首页</button>
                <button class="nav-btn" data-view="settings">设置</button>
            </nav>
        </header>
        <main class="shell-body">
            <!-- 基础能力③：切换界面仅改变显示，不销毁 DOM，状态得以保留 -->
            <section id="view-home" class="view">
                <h2>首页</h2>
                <p class="hint">切换界面后回到本页，输入内容与任务进度会原样保留。</p>
                <label class="field">
                    <span>备忘</span>
                    <input id="note" type="text" placeholder="输入内容，切到「设置」再回来看看" />
                </label>
                <div class="field">
                    <span id="progress-text">长任务进度：0%</span>
                    <div class="progress">
                        <div id="progress-bar" class="progress-bar" data-value="0"></div>
                    </div>
                </div>
                <div class="actions">
                    <button id="start-task" class="btn primary">开始任务</button>
                    <button id="reset-task" class="btn">重置</button>
                </div>
            </section>
            <section id="view-settings" class="view" hidden>
                <h2>设置</h2>
                <p class="hint">窗口大小与位置、缩放比例会被记住，重启后自动恢复。</p>
                <h3>快捷键</h3>
                <table class="shortcuts">
                    <thead>
                        <tr><th>快捷键</th><th>功能</th></tr>
                    </thead>
                    <tbody>
${shortcutsTableRows()}
                    </tbody>
                </table>
            </section>
        </main>
    </div>
    <script src="./src/app.js"></script>
</body>
</html>
`;
}

function vanillaAppTemplate() {
    return `/**
 * ${TOKEN_NAME} — 渲染进程入口（原生 JavaScript，无构建步骤）
 */

const api = window.api;

// ===== 基础能力③：界面切换（仅切换显示，不销毁 DOM，状态保留）=====
const views = {
    home: document.getElementById('view-home'),
    settings: document.getElementById('view-settings')
};
const navButtons = Array.from(document.querySelectorAll('[data-view]'));

function switchView(name) {
    Object.keys(views).forEach((key) => {
        views[key].hidden = key !== name;
    });
    navButtons.forEach((button) => {
        button.classList.toggle('active', button.dataset.view === name);
    });
}

navButtons.forEach((button) => {
    button.addEventListener('click', () => switchView(button.dataset.view));
});

// ===== 基础能力①：Ctrl + 鼠标滚轮缩放界面 =====
let zoomFactor = 1;

api.app.zoomGet().then((value) => {
    if (typeof value === 'number') zoomFactor = value;
});
api.app.onZoomChanged((value) => {
    zoomFactor = value;
});

window.addEventListener(
    'wheel',
    (event) => {
        if (!event.ctrlKey) return;
        event.preventDefault();
        const next = zoomFactor + (event.deltaY > 0 ? -0.1 : 0.1);
        api.app.zoomSet(Math.min(2, Math.max(0.5, Math.round(next * 10) / 10)));
    },
    { passive: false }
);

// ===== 基础能力⑤：Ctrl+, 打开设置；Esc 关闭设置 =====
window.addEventListener('keydown', (event) => {
    if (event.ctrlKey && event.code === 'Comma') {
        event.preventDefault();
        switchView('settings');
        return;
    }
    if (event.key === 'Escape') {
        switchView('home');
    }
});

// ===== 演示：长任务进度在切换界面时不中断 =====
const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
let timer = null;

function renderProgress() {
    const value = Number(progressBar.dataset.value) || 0;
    progressBar.style.width = value + '%';
    progressText.textContent = '长任务进度：' + value + '%';
}

document.getElementById('start-task').addEventListener('click', () => {
    if (timer) return;
    timer = setInterval(() => {
        let value = Number(progressBar.dataset.value) + 5;
        if (value >= 100) {
            value = 100;
            clearInterval(timer);
            timer = null;
        }
        progressBar.dataset.value = String(value);
        renderProgress();
    }, 300);
});

document.getElementById('reset-task').addEventListener('click', () => {
    if (timer) {
        clearInterval(timer);
        timer = null;
    }
    progressBar.dataset.value = '0';
    renderProgress();
});

renderProgress();
`;
}

/**
 * 生成骨架文件集
 * @param {object} options - { name, description, author, template, injectionPath, electronRange }
 * @returns {{ files: Object<string, string> }}
 */
function buildScaffold(options) {
    const template = options.template || 'vue3-js';
    const files = template === 'vanilla-js' ? buildVanillaFiles(options) : buildVueFiles(options);

    // 占位符替换（用 split/join 避免正则特殊字符问题）
    const replacements = [
        [TOKEN_INJECTION, options.injectionPath],
        [TOKEN_ELECTRON, options.electronRange],
        [TOKEN_RENDERER, template === 'vanilla-js' ? 'static' : 'vite'],
        [TOKEN_NAME, options.name]
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

module.exports = { buildScaffold, isValidAppName };
