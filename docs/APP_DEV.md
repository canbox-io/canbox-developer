# Canbox APP 开发指南

本文档面向使用 Canbox 平台开发 APP 的开发者，描述 APP 的项目结构、package.json 元数据约定、canbox-core API 用法以及调试与发布流程。

## APP 是标准 Electron 应用

Canbox APP 是一个标准的 Electron 应用，无任何强制性框架约束。它可以：

- **canbox 模式运行**：`electron -r canbox-core/injection.js {APP}/ --app-id={appId} --no-sandbox`，自动获得 canbox 环境（统一数据目录、store/db 等公共服务）
- **独立运行**：`electron {APP}/`，用自己的 Electron 二进制，不共享 canbox 环境

两种方式下 APP 代码完全相同，无需条件编译。

## 关键概念：id、name、appId

| 字段 | 来源 | 格式 | 用途 | 示例 |
|------|------|------|------|------|
| `id` | package.json 的 `id` 字段（可选，无则用 `name`） | 反向域名 | APP 全局唯一标识，人类可读，用于 repo 搜索/显示/zip 文件名 | `com.gitee.lizl6.cb-jsonbox` |
| `name` | package.json 的 `name` 字段 | npm 包名 | npm 标准字段，调试时作 appId | `cb-jsonbox` |
| `appId` | canbox 安装时自动生成 | 随机 8 位串 | canbox 内部标识，文件系统目录名、`--app-id` 参数、数据隔离路由 | `a1b2c3d4` |

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
├── .canbox-app           # 可选，Canbox APP 标识文件（空文件）
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

    // canbox-developer 启动时自动设 NODE_ENV=development
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

| 字段 | 必需 | 类型 | 说明 |
|------|------|------|------|
| `name` | 是 | string | npm 标准字段，包名。调试时作 appId |
| `id` | 否 | string | Canbox 约定，APP 全局唯一标识（反向域名格式）。无则用 `name`。用于 zip 文件名和 repo 搜索 |
| `main` | 是 | string | 主进程入口 JS 文件 |
| `version` | 是 | string | 版本号 |
| `description` | 否 | string | APP 描述 |
| `author` | 否 | string | 作者 |
| `logo` | 否 | string | 图标文件路径（相对 APP 根目录）。不配时自动探测 |
| `keywords` | 否 | string[] | 标准 npm 字段，兼做分类标签和搜索关键词 |
| `platforms` | 否 | string[] | 支持的平台，可选值 `windows`/`darwin`/`linux`。不配则默认全平台 |

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

## canbox-core API

APP 通过 preload.js 的 contextBridge 暴露 canbox-core API。**API 为黑盒式——APP 不传 appId，由 core 自动路由到 `data/{appId}/` 目录。**

### preload.js 模板

```javascript
const { contextBridge, ipcRenderer } = require('electron');

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
    dialog: {
        showMessageBox: (options) => ipcRenderer.invoke('canbox.dialog.showMessageBox', options),
        showOpenDialog: (options) => ipcRenderer.invoke('canbox.dialog.showOpenDialog', options),
        showSaveDialog: (options) => ipcRenderer.invoke('canbox.dialog.showSaveDialog', options)
    },
    window: {
        createWindow: (options) => ipcRenderer.invoke('canbox.window.createWindow', options),
        notification: (options) => ipcRenderer.invoke('canbox.window.notification', options)
    },
    misc: {
        hello: () => ipcRenderer.invoke('canbox.misc.hello'),
        openUrl: (url) => ipcRenderer.invoke('canbox.misc.openUrl', url),
        getUserData: () => ipcRenderer.invoke('canbox.misc.getUserData'),
        getCoreVersion: () => ipcRenderer.invoke('canbox.misc.getCoreVersion'),
        getCorePath: () => ipcRenderer.invoke('canbox.misc.getCorePath'),
        getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo'),
        showItemInFolder: (filePath) => ipcRenderer.invoke('canbox.misc.showItemInFolder', filePath),
        openPath: (filePath) => ipcRenderer.invoke('canbox.misc.openPath', filePath)
    }
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

**重要：canbox-developer 启动 APP 时会设置 `NODE_ENV=development` 环境变量，APP 的 main.js 必须检查此变量来决定加载方式。**

1. 开发者先在 APP 项目目录跑 dev server（如 `npm run dev`）
2. 在 canbox-developer 中添加 APP（选择 package.json）
3. 点击「运行」按钮，canbox-developer 执行：
   ```bash
   electron -r {canbox-core}/injection.js {sourceDir}/ --app-id={name} --no-sandbox
   # 环境变量：NODE_ENV=development
   ```
4. APP 的 main.js 检测到 `NODE_ENV=development`，loadURL 到 dev server

**关键说明：**
- dev server 端口由 APP 自己管理（Vite 默认 5173、webpack 默认 8080）
- 开发者必须先跑 dev server，再从 developer 点运行
- canbox-developer 不假设开发框架

### 发布流程

1. 开发者在终端跑 electron-builder 打包 → 得到 `resources/` 目录（`app.asar` + 可能的 `app.asar.unpacked/`）
2. 在 canbox-developer 点「发布」 → 选择 `resources/` 目录
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
