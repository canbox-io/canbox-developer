# Canbox APP 开发指南

本文档面向使用 Canbox 平台开发 APP 的开发者，描述 APP 的项目结构、package.json 元数据约定、canbox-core API 用法以及调试与打包分发流程。

## 核心前提：APP 是标准 Electron 应用

**Canbox APP 首先是一个标准的 Electron 应用，这是它的本质。** canbox-core 和 canbox-developer 只是平台提供的服务层和工具层，它们为 APP 提供便利的运行时服务和开发体验，但不是 APP 运行的前提。

### 三层关系

| 层                         | 角色                                                                | 是否必需 |
| -------------------------- | ------------------------------------------------------------------- | -------- |
| **APP 自身**         | 标准 Electron 应用（`app.whenReady()` + `new BrowserWindow()`） | 必需     |
| **canbox-core**      | 服务提供层，通过 `-r` 注入，提供 store/db/misc 公共服务（数据隔离与环境信息） | 可选     |
| **canbox-developer** | 开发工具，提供调试启动、打包发布等便利                              | 可选     |

### 不使用 canbox-core / canbox-developer 的影响

- **不使用 canbox-core**：APP 无法调用 `window.api.store`、`window.api.db` 等平台服务，需要自行实现数据持久化（如用 electron-store、lowdb、SQLite 等）。APP 的 Electron 应用本质不受影响。
- **不使用 canbox-developer**：APP 无法通过 GUI 一键调试/打包，但可以用 `electron .` 或任意 Electron 打包工具（如 electron-builder、electron-forge 等）自行启动和打包。canbox-developer 提供的 `NODE_ENV=development` 等环境变量便利也不会自动获得，APP 需自行实现环境判断（见下文「NODE_ENV」一节）。
- **完全不使用两者**：APP 就是一个普通的 Electron 应用，可以独立分发、独立运行。只是无法接入 canbox 平台的管理和分发体系。

### 运行方式

APP 可以通过以下方式运行，代码完全相同，无需条件编译：

- **canbox 模式运行**：`electron -r canbox-core/injection.js {APP}/ --app-id={appId} --no-sandbox`，自动获得 canbox 环境（统一数据目录、store/db 等公共服务）
- **独立运行**：`electron {APP}/`，用自己的 Electron 二进制，不共享 canbox 环境

接入 canbox 平台的 APP 推荐用 canbox 模式运行以获得平台服务；不接入的 APP 也可以独立运行和分发。

## 关键概念：id、name、appId

| 字段      | 来源                                                 | 格式        | 用途                                                             | 示例                               |
| --------- | ---------------------------------------------------- | ----------- | ---------------------------------------------------------------- | ---------------------------------- |
| `id`    | package.json 的 `id` 字段（可选，无则用 `name`） | 反向域名    | APP 全局唯一标识，人类可读，用于 repo 搜索/显示/zip 文件名       | `com.github.rexlevin.cb-jsonbox` |
| `name`  | package.json 的 `name` 字段                        | npm 包名    | npm 标准字段，调试时作 appId                                     | `cb-jsonbox`                     |
| `appId` | canbox 安装时自动生成                                | 随机 8 位串 | canbox 内部标识，文件系统目录名、`--app-id` 参数、数据隔离路由 | `a1b2c3d4`                       |

- **调试时**：developer 用 `name` 作 appId（`--app-id=cb-jsonbox`），因为没有安装过程
- **安装后**：manager 生成随机 appId（`--app-id=a1b2c3d4`），数据路由到 `data/a1b2c3d4/`
- 调试数据和安装数据天然隔离（不同 appId → 不同 data 目录）

## 项目结构

```
my-app/
├── package.json          # 必须，{ "name": "my-app", "main": "main.js" }
├── main.js               # 必须，Electron 主进程入口（自己 new BrowserWindow）
├── preload.js            # 需要 canbox API 时使用（contextBridge 暴露）
├── index.html            # 渲染进程入口
├── logo.png              # 可选，APP 图标
├── .canbox-app           # Canbox 平台配置文件（JSON，声明 electron 版本等）
└── src/                  # 前端源码
    └── ...
```

### main.js 最小示例

```javascript
const { app, BrowserWindow, Menu } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 800,
        height: 600,
        icon: path.join(__dirname, 'logo.png'),
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // 检查 NODE_ENV 判断运行模式（canbox-developer/manager 会自动设置，也可自行实现判断）
    const isDev = process.env.NODE_ENV === 'development';
    if (isDev) {
        // 开发模式：加载 dev server（端口由 APP 自己决定）
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        // 生产模式：加载构建产物
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
```

## 标准代码片段：恢复上次窗口位置和大小

窗口状态恢复属于 APP 自身的 UI 行为，**不在 canbox-core 中默认实现**（core 是环境层，不干预 APP 的 UI 策略）。APP 可参考以下标准片段，使用 core 的 store 黑盒路由持久化窗口状态（自动隔离到 `data/{appId}/store/winState.json`）。

该实现已覆盖以下工程细节：

- **节流持久化**：resize/move 高频事件 300ms debounce，避免频繁写盘
- **多显示器边界校验**：副屏拔除时窗口可能跑到屏幕外，用 `screen.getDisplayMatching` 校验，不可见则丢弃 x/y 只保留尺寸
- **最大化/全屏状态恢复**：单独存 `isMaximized`/`isFullScreen` 标志，最大化时不存 bounds（否则会把巨大化的尺寸当默认值）
- **崩溃容错**：除了 `close` 事件，resize/move/maximize 等事件也触发保存，APP 被强制 kill 也能恢复上一次状态

```javascript
const { app, BrowserWindow, Menu, screen } = require('electron');
const path = require('path');

let mainWindow = null;

// 获取窗口状态 store（按 appId 物理隔离，黑盒式）
function getWinStateStore() {
    const store = require(path.join(global.__CANBOX_CORE_PATH__, 'lib', 'store'));
    return store.getStore(
        global.__CANBOX_ENV__.appId,
        'winState',
        path.join(global.__CANBOX_ENV__.usersPath, 'data')
    );
}

// 保存窗口状态（含位置、大小、最大化、全屏）
// 节流 300ms，避免 resize/move 高频写盘
let winStateSaveTimer = null;
function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (winStateSaveTimer) clearTimeout(winStateSaveTimer);
    winStateSaveTimer = setTimeout(() => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            const store = getWinStateStore();
            // 最大化或全屏时只存状态，不存 bounds（否则会把巨大化的尺寸当默认值）
            const isMaximized = mainWindow.isMaximized();
            const isFullScreen = mainWindow.isFullScreen();
            const bounds = (isMaximized || isFullScreen) ? null : mainWindow.getBounds();
            store.set('state', { bounds, isMaximized, isFullScreen });
        } catch (e) {
            // 忽略保存失败
        }
    }, 300);
}

// 读取并校验上次窗口状态（多显示器边界校验，窗口在屏幕外则丢弃 x/y）
function loadWindowState() {
    const store = getWinStateStore();
    const state = store.get('state');
    if (!state) return null;

    if (state.isMaximized || state.isFullScreen || !state.bounds) {
        return { isMaximized: !!state.isMaximized, isFullScreen: !!state.isFullScreen };
    }

    // 校验 bounds 是否在某个显示器可视范围内
    const bounds = state.bounds;
    const display = screen.getDisplayMatching(bounds);
    const visibleArea = display.workArea;
    const isVisible =
        bounds.x + bounds.width > visibleArea.x &&
        bounds.x < visibleArea.x + visibleArea.width &&
        bounds.y + bounds.height > visibleArea.y &&
        bounds.y < visibleArea.y + visibleArea.height;

    if (!isVisible) {
        // 窗口在屏幕外（如副屏已拔除），丢弃位置只保留尺寸
        return { width: bounds.width, height: bounds.height };
    }

    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false,
        isFullScreen: false
    };
}

function createWindow() {
    // 恢复上次窗口状态
    const saved = loadWindowState();
    const defaultWidth = 800;
    const defaultHeight = 600;

    mainWindow = new BrowserWindow({
        width: (saved && saved.width) || defaultWidth,
        height: (saved && saved.height) || defaultHeight,
        x: (saved && saved.x !== undefined) ? saved.x : undefined,
        y: (saved && saved.y !== undefined) ? saved.y : undefined,
        minWidth: 400,
        minHeight: 300,
        icon: path.join(__dirname, 'logo.png'),
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

    // 恢复最大化 / 全屏状态（需在窗口 show 之后才生效）
    if (saved && saved.isMaximized) {
        mainWindow.maximize();
    } else if (saved && saved.isFullScreen) {
        mainWindow.setFullScreen(true);
    }

    // 监听窗口状态变化，节流持久化（resize/move/close 都会触发）
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('maximize', saveWindowState);
    mainWindow.on('unmaximize', saveWindowState);
    mainWindow.on('enter-full-screen', saveWindowState);
    mainWindow.on('leave-full-screen', saveWindowState);
    mainWindow.on('close', saveWindowState);
}

app.whenReady().then(() => {
    Menu.setApplicationMenu(null);
    createWindow();
});

app.on('window-all-closed', () => app.quit());
app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
```

**关键点说明：**

1. **`global.__CANBOX_CORE_PATH__` 和 `global.__CANBOX_ENV__`** 由 canbox-core 的 injection.js 预加载时挂载，APP 直接读取即可（不需要 `npm install canbox-core`）
2. **`store.getStore(appId, 'winState', dataPath)`** 是 core store 模块的直接引用，按 appId 物理隔离到 `data/{appId}/store/winState.json`，与 IPC 黑盒路由一致
3. **不新增 IPC 通道**：窗口状态在主进程直接读写，渲染进程无需参与
4. **APP 可按需裁剪**：固定尺寸的对话框式工具 APP 可以只保留位置恢复，去掉大小/最大化/全屏逻辑

## package.json 元数据约定

package.json 是标准 npm 包描述文件。除了 `name`、`main`、`version` 等标准字段外，Canbox 约定以下可选字段用于 APP 元数据：

```json
{
    "name": "cb-jsonbox",
    "id": "com.gitee.lizl6.cb-jsonbox",
    "version": "0.0.3",
    "main": "main.js",
    "description": "JsonBox - 跨平台的 JSON 格式化工具",
    "author": "lizl6",
    "license": "Apache-2.0",
    "logo": "logo.png",
    "keywords": ["json", "formatter", "development", "utility"],
    "platforms": ["windows", "darwin", "linux"]
}
```

### 字段说明

| 字段            | 必需 | 类型     | 说明                                                                                        |
| --------------- | ---- | -------- | ------------------------------------------------------------------------------------------- |
| `name`        | 是   | string   | npm 标准字段，包名。调试时作 appId                                                          |
| `id`          | 否   | string   | Canbox 约定，APP 全局唯一标识（反向域名格式）。无则用 `name`。用于 zip 文件名和 repo 搜索 |
| `main`        | 是   | string   | 主进程入口 JS 文件                                                                          |
| `version`     | 是   | string   | 版本号                                                                                      |
| `description` | 否   | string   | APP 描述                                                                                    |
| `author`      | 否   | string   | 作者                                                                                        |
| `logo`        | 否   | string   | 图标文件路径（相对 APP 根目录）。不配时自动探测                                             |
| `keywords`    | 否   | string[] | 标准 npm 字段，兼做分类标签和搜索关键词                                                     |
| `platforms`   | 否   | string[] | 支持的平台，可选值 `windows`/`darwin`/`linux`。不配则默认全平台                       |

### logo 自动探测

如果 `logo` 字段未配置，canbox-developer 按以下优先级自动探测 APP 根目录下的图标文件：

1. `logo.png`
2. `logo.svg`
3. `icon.png`
4. `favicon.png`
5. `logo.jpg`

找到即使用，都找不到显示占位图标。

### keywords 用途

`keywords` 是 npm 标准字段，在 Canbox 中兼做两个用途：

- **分类**：如 `development`、`utility`、`graphics` 等，用于仓库分类筛选
- **标签/搜索**：如 `json`、`formatter`，用于仓库搜索

无需单独的 `categories` 或 `tags` 字段，统一用 `keywords`。

### platforms 用途

`platforms` 声明 APP 支持的操作系统。不配置则默认全平台支持。

## .canbox-app 平台配置

`.canbox-app` 是 APP 接入 canbox 平台的配置文件（JSON 格式），与 package.json 分离：

- **package.json**：APP 作为独立 Electron 应用的标准元数据（npm 生态，`name`/`version`/`main` 等）
- **.canbox-app**：canbox 平台配置（electron 版本声明、APP 类型等）

删除 `.canbox-app`，APP 即回归纯 Electron 应用，不影响其独立性。

### 文件格式

```json
{
    "version": 1,
    "electron": {
        "range": "^42.5.1"
    },
    "type": "native",
    "webApp": null
}
```

### 字段说明

| 字段                | 必需 | 类型   | 说明                                                                 |
| ------------------- | ---- | ------ | -------------------------------------------------------------------- |
| `version`         | 是   | number | 配置格式版本，当前为 `1`                                           |
| `electron.range`  | 是   | string | Electron 版本范围（semver），必须命中 canbox 官方白名单              |
| `type`            | 是   | string | APP 类型：`native`（普通 APP）或 `web`（网页应用）                 |
| `webApp`          | 否   | object | `type=web` 时的网页应用配置（url、isPwa、menuBar 等），native 为 null |

### electron 版本选择

canbox 官方维护一份 Electron 版本白名单（`ALLOWED_ELECTRON`），APP 声明的 `electron.range` 必须命中白名单中的版本。

**版本来源：**

- **builtin**：安装包自带的版本（程序目录 `electron-{ver}/`），唯一
- **downloaded**：用户在线下载的版本（用户数据目录 `runtime/electron-{ver}/`），多个

**选择算法：**

1. 读取 APP 的 `.canbox-app` 中的 `electron.range`
2. 校验 range 命中白名单
3. 从 builtin + downloaded 中选择满足 range 的最高版本
4. 若无已安装版本满足，提示用户下载对应版本

**示例：**

```json
// 推荐写法：精确指定版本（锁死，避免 ^ 范围漂移导致命不中白名单）
"electron": { "range": "42.5.1" }

// 也支持 semver range（不推荐，可能因白名单未同步新版而启动失败）
"electron": { "range": "^42.5.1" }
```

### .canbox-app 的产生方式

APP 的 `.canbox-app` 通过以下两种方式产生：

1. **canbox-developer 脚手架创建**：使用「新建项目」功能时，开发者从下拉框选择 Electron 版本（选项来自 canbox 白名单），developer 自动写入 `.canbox-app`
2. **添加已有 APP 时补写**：若被添加的 APP 缺失 `.canbox-app` 或 `electron.range` 无效，developer 会弹窗让开发者选择版本，确认后自动写入

> **推荐**：APP 源码目录里直接维护好 `.canbox-app`，避免每次添加都要补写。`canbox-publish` 打包时会从源码目录读取 `.canbox-app` 并打入 zip。

### native APP 与 web APP

- **native APP**（`type: "native"`）：标准 Electron 应用，通过 canbox-core 注入启动，可使用 store/db 等平台服务
- **web APP**（`type: "web"`）：网址封装为 Electron 网页壳，不注入 canbox-core，使用独立 userData。由 canbox-manager 的「创建网页应用」功能自动生成，`webApp` 字段包含 url、isPwa、menuBar 等配置

## canbox-core API

APP 通过 preload.js 的 contextBridge 暴露 canbox-core API。**API 为黑盒式——APP 不传 appId，由 core 自动路由到 `data/{appId}/` 目录。**

canbox-core 是"可选服务提供层"，只提供体现平台价值的能力（数据隔离、环境信息）。窗口/对话框/快捷键/通知/shell 等 APP 一行 Electron 代码即可完成的能力不再由 core 提供——APP 如需这些能力，在自身 main.js 注册 IPC（通道名用 APP 自己的前缀，如 `myapp.dialog.*`），preload 里桥接即可。

### preload.js 模板

```javascript
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
    // === canbox-core 公共服务（黑盒式，按 appId 自动隔离）===
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
    }

    // === APP 自有 IPC（非 canbox-core 提供，按需添加）===
    // 如需对话框/通知/打开 URL 等，在 APP main.js 注册自己的 IPC 通道：
    //   ipcMain.handle('myapp.dialog.showOpenDialog', async (_e, options) => {
    //       return dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), options);
    //   });
    // preload 桥接：
    //   myapp: {
    //       showOpenDialog: (options) => ipcRenderer.invoke('myapp.dialog.showOpenDialog', options)
    //   }
});
```

### store — 键值存储

存储到 `{Users}/data/{appId}/store/{name}.json`，按 appId 物理隔离。

```javascript
await window.api.store.set('settings', 'theme', 'dark');
const theme = await window.api.store.get('settings', 'theme');
await window.api.store.delete('settings', 'theme');
await window.api.store.clear('settings');
```

### db — 文档数据库

存储到 `{Users}/data/{appId}/db/`，按 appId 物理隔离。

```javascript
await window.api.db.put({ _id: 'doc1', name: 'test' });
const doc = await window.api.db.get('doc1');
const result = await window.api.db.find({ selector: { type: 'item' } });
```

## 数据目录结构

```
{Users}/
├── apps/{appId}/                  # 已安装 APP（内含 app.asar + package.json + logo）
├── data/{appId}/
│   ├── store/{name}.json         # APP 键值存储（物理隔离）
│   └── db/                       # APP 文档数据库（物理隔离）
├── db/{history,fileTask}/         # 平台级数据库
├── repos/                         # 仓库
└── logs/canbox.log                # 统一日志
```

## 调试与发布

### 调试启动流程

canbox-developer 启动 APP 时会设置 `NODE_ENV=development` 环境变量，APP 可选择检查此变量来决定加载方式（也可完全自行实现环境判断，见下文）。

1. 开发者先在 APP 项目目录跑 dev server（如 `npm run dev`）
2. 在 canbox-developer 中添加 APP（选择 package.json）
3. 点击「运行」按钮，canbox-developer 执行：
   ```bash
   electron -r {canbox-core}/injection.js {sourceDir}/ --app-id={name} --no-sandbox
   # 环境变量：NODE_ENV=development
   ```
4. APP 的 main.js 检测到 `NODE_ENV=development`（如果 APP 采用此约定），loadURL 到 dev server

**关键说明：**

- dev server 端口由 APP 自己管理（Vite 默认 5173、webpack 默认 8080）
- 开发者必须先跑 dev server，再从 developer 点运行
- canbox-developer 不假设开发框架
- `NODE_ENV=development` 是 developer 提供的便利，不是强制约定——APP 可以不用它（见下文）

### NODE_ENV 环境变量（可选便利）

`NODE_ENV` 是 canbox-developer / canbox-manager 为 APP 提供的一种环境判断便利：启动子进程时显式设置该变量，APP 据此区分开发/生产模式。

**这是可选的便利机制，不是强制约定。** APP 可以选择使用它，也可以完全自行实现环境判断逻辑（例如检查 `app.isPackaged()`、检查 `process.env` 自定义变量、检查某个文件是否存在等）。

#### 各场景下的值

| 启动方式                       | NODE_ENV        | 设置者                                | 用途                                   |
| ------------------------------ | --------------- | ------------------------------------- | -------------------------------------- |
| canbox-developer 点「运行」    | `development` | canbox-developer 启动子进程时显式设置 | 加载 dev server，开启热更新和 devTools |
| canbox-manager 点「启动」      | `production`  | canbox-manager 启动子进程时显式设置   | 加载 asar 内的构建产物，不开 devTools  |
| APP 独立运行（`electron .`） | 继承当前 shell  | 取决于运行环境                        | 无 canbox 环境时的兜底                 |

**关键：canbox-manager 启动 APP 时会显式设置 `NODE_ENV=production`，不会继承 manager 自身的环境变量。** 即使 manager 在开发模式下运行（`NODE_ENV=development`），被启动的 APP 也会收到 `production`。

#### 方式一：采用 NODE_ENV 约定（推荐接入 canbox 平台的 APP 使用）

APP 的 main.js 检查 `process.env.NODE_ENV`，配合 developer/manager 的自动设置：

```javascript
const isDev = process.env.NODE_ENV === 'development';

if (isDev) {
    // 开发模式：加载 dev server + 开 devTools
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
} else {
    // 生产模式：加载构建产物，不开 devTools
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
}
```

优点：与 developer/manager 的启动参数天然配合，无需额外配置。

#### 方式二：自行实现环境判断（不依赖 NODE_ENV）

APP 完全可以不检查 `NODE_ENV`，用自己的方式判断开发/生产模式。常见做法：

```javascript
// 示例：用 Electron 内置的 isPackaged 判断
const isDev = !app.isPackaged();

if (isDev) {
    mainWindow.loadURL('http://localhost:5173');
    mainWindow.webContents.openDevTools({ mode: 'detach' });
} else {
    mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
}
```

或检查自定义环境变量、配置文件等。这种方式的 APP 即使不通过 canbox-developer 启动（如直接 `electron .` 或用其他工具链），也能正确判断运行模式。

> 注意：采用方式二的 APP 在 canbox-developer 中点「运行」时仍然会收到 `NODE_ENV=development`，但 APP 不读它，所以不影响行为。同样，canbox-manager 启动时收到的 `NODE_ENV=production` 也不会被读取——APP 靠自己的逻辑判断。两种方式互不冲突。

#### 不做任何环境判断的影响

如果 APP 既不检查 `NODE_ENV`，也不自行判断环境，把加载方式写死，可能出现以下问题：

1. **始终加载 dev server URL**：

   - 在 canbox-manager 中启动时白屏（没有 dev server 在运行，`loadURL` 连接失败）
   - 即使碰巧有 dev server 在跑，加载的也是源码而非打包产物，行为不一致
2. **始终加载构建产物**：

   - 在 canbox-developer 中调试时无法热更新，每次改动都要重新 build
   - 失去 devTools 调试能力
3. **始终开 devTools**：

   - 在 canbox-manager 中启动时弹出 devTools 窗口，影响用户体验
   - 这正是之前 cb-jsonbox 出现的问题：manager 在开发模式运行时 `NODE_ENV=development` 被子进程继承，APP 无条件 `openDevTools()` 导致 devTools 被打开
4. **前端框架行为异常**：

   - Vue/React 等框架内部会检查 `NODE_ENV` 决定是否启用开发警告、性能追踪等
   - 生产环境若收到 `development`，会输出大量开发警告并影响性能
   - 这一点与 APP 自身逻辑无关，是框架行为，即使 APP 用方式二自行判断也要注意

#### 建议

1. **接入 canbox 平台的 APP**：推荐用方式一（检查 `NODE_ENV`），与 developer/manager 天然配合
2. **希望独立可运行的 APP**：用方式二（如 `!app.isPackaged()`），不依赖 canbox 提供的环境变量
3. **devTools 只在开发模式打开**，不要无条件调用 `openDevTools()`
4. **dev server 端口由 APP 自己决定**，在 `package.json` 的 `scripts.dev` 中配置（如 `vite --port 5173`）
5. **没有前端构建步骤的 APP**（纯静态 HTML）：可以始终用 `loadFile`，无需区分环境

### 打包分发流程

1. 开发者在终端用任意 Electron 打包工具（如 electron-builder、electron-forge 等）打包 → 得到 `resources/` 目录（`app.asar` + 可能的 `app.asar.unpacked/`）
2. 在 canbox-developer 点「打包分发」 → 选择 `resources/` 目录
3. developer 自动从源码目录提取 `package.json` 和 `logo.png`
4. 按 canbox 标准结构压 zip：
   ```
   {id}-{version}[-{platform}-{arch}].zip
   ├── app.asar                  ← 从 resources/ 目录
   ├── app.asar.unpacked/        ← 从 resources/ 目录（如有）
   ├── package.json              ← 从源码目录
   └── logo.png                  ← 从源码目录（自动探测）
   ```
5. 输出 zip 到源码目录同级
6. 开发者把 zip 上传到 repo，或通过 canbox-manager 导入

**注意：**

- `id` 取自 package.json 的 `id` 字段，无则用 `name`
- 有 `app.asar.unpacked/`（原生模块）时，zip 文件名带平台标识（从 resources/ 父目录名推断）
- 无 `app.asar.unpacked/` 时，zip 全平台通用，文件名不带平台
- developer 只负责标准化压缩，不替 APP 打 asar

### 安装与运行

canbox-manager 导入 zip 时：

1. 解压到 `apps/{appId}/`（appId 是随机生成的 8 位串）
2. 记录 `id → appId` 映射
3. 启动：`electron -r injection.js apps/{appId}/app.asar --app-id={appId} --no-sandbox`

### 自动发布（CI/CD）

手动打包流程适合偶尔操作，频繁发版建议用 CI/CD 自动化。Canbox 提供了 `canbox-publish.js` CLI 工具，可在 CI 环境中完成标准化 zip 打包。

#### canbox-publish.js CLI

位于 `canbox-developer/scripts/canbox-publish.js`，从 APP 构建产物中提取 app.asar，按 canbox 标准结构打包为 zip。与 canbox-developer GUI 的「打包分发」按钮共用同一份打包逻辑，确保产物一致。

```bash
# 用法
node canbox-publish.js --source <源码目录> --resources <构建产物目录> [--out <输出目录>]

# 示例
node canbox-publish.js --source . --resources dist/linux-unpacked/resources/ --out release/
```

**前置条件**：APP 需在 `package.json` 中配置所用打包工具的构建字段（如 electron-builder 的 `build` 字段），至少包含 `dir` target 以产出 `app.asar`。

#### 场景一：Canbox APP（仅 zip）

使用 canbox API 的 APP 无法独立运行，只需打包 canbox zip。由于不涉及原生模块时 zip 全平台通用，构建只需在一个平台（Linux CI 成本最低）进行。

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  release:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout APP
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: https://registry.npmmirror.com/

      - name: Set Electron mirror
        run: echo "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/" >> $GITHUB_ENV

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Build app.asar
        run: npm run dist

      - name: Checkout canbox-developer
        uses: actions/checkout@v4
        with:
          repository: canbox-io/canbox-developer
          path: canbox-developer

      - name: Install adm-zip for publish script
        run: npm install --no-save adm-zip

      - name: Pack canbox zip
        run: node canbox-developer/scripts/canbox-publish.js --source . --resources dist/linux-unpacked/resources/ --out release/

      - name: Upload to GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: release/*.zip
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

**package.json 需添加的配置**：

```json
{
    "scripts": {
        "build": "vite build",
        "dist": "electron-builder --linux dir"
    },
    "devDependencies": {
        "electron-builder": "^26.0.12"
    },
    "build": {
        "appId": "com.example.my-app",
        "directories": { "output": "dist" },
        "files": [
            "main.js",
            "preload.js",
            "build/**/*",
            "package.json",
            "logo.png"
        ],
        "linux": { "target": ["dir"] }
    }
}
```

#### 场景二：独立 APP（原生安装包 + canbox zip）

不使用 canbox API 的 APP 可独立分发，需要同时产出原生安装包（AppImage/deb/msi/exe）和 canbox zip。使用矩阵构建覆盖全平台。

```yaml
# .github/workflows/release.yml
name: Release
on:
  push:
    tags: ['v*']

permissions:
  contents: write

jobs:
  build:
    strategy:
      matrix:
        include:
          - os: ubuntu-latest
            target: AppImage
          - os: windows-latest
            target: nsis
    runs-on: ${{ matrix.os }}
    steps:
      - name: Checkout APP
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '24'
          registry-url: https://registry.npmmirror.com/

      - name: Set Electron mirror (Linux)
        if: runner.os == 'Linux'
        run: echo "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/" >> $GITHUB_ENV

      - name: Set Electron mirror (Windows)
        if: runner.os == 'Windows'
        run: echo "ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/" >> $env:GITHUB_ENV

      - name: Install dependencies
        run: npm ci

      - name: Build frontend
        run: npm run build

      - name: Build native installer
        run: npx electron-builder --${{ matrix.target }}
        env:
          GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}

      - name: Pack canbox zip (Linux only)
        if: runner.os == 'Linux'
        run: |
          git clone https://github.com/canbox-io/canbox-developer.git /tmp/canbox-developer
          npm install --no-save adm-zip
          node /tmp/canbox-developer/scripts/canbox-publish.js --source . --resources dist/linux-unpacked/resources/ --out release/

      - uses: actions/upload-artifact@v4
        with:
          name: artifacts-${{ matrix.os }}
          path: |
            dist/*.AppImage
            dist/*.deb
            dist/*.msi
            dist/*.exe
            release/*.zip

  release:
    needs: build
    runs-on: ubuntu-latest
    if: always()
    permissions:
      contents: write
    steps:
      - uses: actions/download-artifact@v4
        with:
          path: artifacts
          merge-multiple: true

      - uses: softprops/action-gh-release@v2
        with:
          files: artifacts/**/*
          generate_release_notes: true
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
```

#### 本地快速发布

除 CI/CD 自动发布外，也可在本地用 `github-auto-release` 技能快速完成「生成 changelog → 打 tag → 推送到 GitHub」的收尾流程，适合紧急补丁场景。注意此方式不包含跨平台构建，需提前在本地打好包。
