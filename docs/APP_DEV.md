# Canbox APP 开发指南

本文档面向使用 Canbox 平台开发 APP 的开发者，描述 APP 的项目结构、package.json 元数据约定、canbox-core API 用法以及调试与发布流程。

## APP 是标准 Electron 应用

Canbox APP 是一个标准的 Electron 应用，无任何强制性框架约束。它可以：

- **canbox 模式运行**：`electron -r canbox-core/injection.js {APP}/ --app-id={appId}`，自动获得 canbox 环境（统一数据目录、store/db 等公共服务）
- **独立运行**：`electron {APP}/`，用自己的 Electron 二进制，不共享 canbox 环境

两种方式下 APP 代码完全相同，无需条件编译。

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
```

## package.json 元数据约定

package.json 是标准 npm 包描述文件。除了 `name`、`main`、`version` 等标准字段外，Canbox 约定以下可选字段用于 APP 元数据：

```json
{
    "name": "cb-jsonbox",
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

| 字段            | 必需 | 类型     | 说明                                                                 |
| --------------- | ---- | -------- | -------------------------------------------------------------------- |
| `name`        | 是   | string   | APP 唯一标识，用作 appId 和数据隔离目录名                            |
| `main`        | 是   | string   | 主进程入口 JS 文件                                                   |
| `version`     | 是   | string   | 版本号                                                               |
| `description` | 否   | string   | APP 描述，显示在卡片和列表中                                         |
| `author`      | 否   | string   | 作者                                                                 |
| `logo`        | 否   | string   | 图标文件路径（相对 APP 根目录）。不配时自动探测                      |
| `keywords`    | 否   | string[] | 标准 npm 字段，兼做分类标签和搜索关键词                              |
| `platforms`   | 否   | string[] | 支持的平台，可选值`windows`/`darwin`/`linux`。不配则默认全平台 |

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

### platforms 用途

`platforms` 声明 APP 支持的操作系统。canbox-developer 和 canbox-manager 在卡片上显示对应平台图标：

- `windows` → 🪟
- `darwin` → 🍎
- `linux` → 🐧

不配置 `platforms` 则默认全平台支持，显示通用图标。

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
        getPlatformInfo: () => ipcRenderer.invoke('canbox.misc.getPlatformInfo'),
        showItemInFolder: (filePath) => ipcRenderer.invoke('canbox.misc.showItemInFolder', filePath),
        openPath: (filePath) => ipcRenderer.invoke('canbox.misc.openPath', filePath)
    }
});
```

### store — 键值存储

存储到 `{Users}/data/{appId}/store/{name}.json`，按 appId 物理隔离。

```javascript
// 存
await window.api.store.set('settings', 'theme', 'dark');
// 取
const theme = await window.api.store.get('settings', 'theme');
// 删
await window.api.store.delete('settings', 'theme');
// 清空指定 store
await window.api.store.clear('settings');
```

- `name`：存储名称（文件名），同一 APP 可有多份 store
- `key`：存储的键
- appId 由 core 自动注入，APP 不传

### db — 文档数据库

存储到 `{Users}/data/{appId}/db/`，按 appId 物理隔离。

```javascript
// 插入/更新
await window.api.db.put({ _id: 'doc1', name: 'test' });
// 获取
const doc = await window.api.db.get('doc1');
// 查询
const result = await window.api.db.find({ selector: { type: 'item' } });
// 获取全部
const all = await window.api.db.allDocs({ include_docs: true });
// 批量写入
await window.api.db.bulkDocs([{ _id: 'a' }, { _id: 'b' }]);
// 删除
await window.api.db.remove(doc);
// 创建索引
await window.api.db.createIndex({ index: { fields: ['type'] } });
```

### dialog — 原生对话框

```javascript
const result = await window.api.dialog.showOpenDialog({
    properties: ['openFile'],
    filters: [{ name: 'Images', extensions: ['png', 'jpg'] }]
});
```

### window — 窗口管理

```javascript
// 系统通知
await window.api.window.notification({ title: '完成', body: '操作成功' });
// 创建新窗口
await window.api.window.createWindow({ width: 400, height: 300 });
```

### misc — 杂项

```javascript
await window.api.misc.openUrl('https://example.com');
const userDataPath = await window.api.misc.getUserData();
const version = await window.api.misc.getCoreVersion();
```

## 数据目录结构

所有通过 canbox-core 启动的 APP 共享同一数据目录：

```
{Users}/
├── apps/{appId}/                  # 已安装 APP
├── data/{appId}/
│   ├── store/{name}.json         # 当前 APP 的键值存储（物理隔离）
│   └── db/                       # 当前 APP 的文档数据库（物理隔离）
├── db/{history,fileTask}/         # 平台级数据库
├── repos/                         # 仓库
└── logs/canbox.log                # 统一日志
```

**数据隔离**：每个 APP 的数据存到 `data/{appId}/`，互不干扰。删除 APP 清数据即删除 `data/{appId}/` 目录。

**黑盒模型**：APP 调用 store/db 时不传 appId，core 通过 `--app-id` 参数自动路由。

## 调试与发布

### 调试启动

通过 canbox-developer 添加 APP（选择 package.json），然后点击运行按钮。canbox-developer 会执行：

```bash
electron -r {canbox-core}/injection.js {sourceDir}/ --app-id={appId}
```

开发中的 APP 不安装到 `{Users}/apps/`，直接从源码目录启动。

### 打包发布

点击打包按钮，canbox-developer 将 APP 源码目录打包为 zip（排除 `node_modules`、`.git`、`build` 等开发目录），输出 `{name}-{version}.zip`。

该 zip 可：

- 通过 canbox-manager 的「导入 APP」安装
- 提交到仓库供用户下载

### 启动命令

```bash
# 开发模式（需同时跑 vite dev server）
npm run dev      # Vite dev server
npm run start    # electron -r canbox-core/injection.js . --app-id={appId}

# 生产模式
npm run build    # Vite 构建
electron -r canbox-core/injection.js {APP}/ --app-id={appId}
```
