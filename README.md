# canbox-developer

Canbox 开发者工具 APP — 为 Canbox APP 开发者提供脚手架创建、源码目录调试启动、打包发布等开发工作流能力。

## 项目定位

canbox-developer 是一个**独立的 Canbox APP**，不预装在产品包中，由开发者按需从 repo 下载安装。

**与 canbox-manager 的职责区分：**

| | canbox-manager | canbox-developer |
|---|---|---|
| 操作对象 | `{Users}/apps/` 里的**已安装 APP** | 任意**源码目录**（开发中的项目） |
| 典型动作 | 从 repo 下载、导入 zip、启动、卸载、清数据 | 脚手架创建、加载源码目录调试、热重载、打包成 zip |
| 面向 | 所有用户 | 开发者 |

canbox-manager 专注"分发 → 安装 → 运行"，canbox-developer 专注"开发 → 调试 → 打包"，两者边界干净。

## 核心功能

### 1. 脚手架创建

从模板创建新 APP 项目骨架，包含：
- `package.json`（name、main、description 等基础字段）
- `main.js`（标准 Electron 主进程入口）
- `preload.js`（canbox-core API 暴露模板）
- `index.html` + Vue 前端骨架
- `.canbox-app` 标识文件

### 2. 源码目录调试启动

加载本地源码目录，直接通过 `electron -r injection.js {sourceDir} --app-id={appId}` 启动调试：

```bash
electron -r {canbox-core}/injection.js /path/to/dev-app/ --app-id={pkg.name}
```

**关键约束：**
- 开发中的 APP **不安装**到 `{Users}/apps/`，直接从源码目录启动
- 开发中的 APP **不写** `{Users}/apps/`，数据仍走 `{Users}/data/{appId}/`（core 共享 userData 机制）
- 如需数据隔离，启动时设 `CANBOX_USER_DATA=/tmp/canbox-dev` 环境变量覆盖

### 3. 打包发布

将开发中的 APP 打包为 zip，供 canbox-manager 导入或提交到 repo：
- 读取 `package.json` 确定 APP 元数据
- 排除 `node_modules/`、`.git/`、`build/` 等开发目录
- 输出 `{name}-{version}.zip`

## 获取 injection.js 路径

canbox-developer 装在 `{Users}/apps/developer/`，不在产品包的平级目录结构中，无法用相对路径推算 canbox-core 位置。

**解决方案（方式 B）：** canbox-core 的 `injection.js` 在启动时将自己的根目录路径写入 `{Users}/canbox.json`：

```json
{
    "core.injectionPath": "/path/to/canbox-core",
    "core.version": "0.1.0"
}
```

canbox-developer 启动其他 APP 时：

```javascript
const Store = require('electron-store');
const coreStore = new Store({ cwd: usersPath, name: 'canbox' });
const corePath = coreStore.get('core.injectionPath');
const injectionJs = path.join(corePath, 'injection.js');

spawn(process.execPath, ['-r', injectionJs, sourceDir, `--app-id=${appId}`], {
    detached: true,
    stdio: 'ignore'
});
```

## 技术栈

| 类别 | 技术 | 版本 |
|------|------|------|
| 桌面框架 | Electron | ^41.2.1 |
| 前端框架 | Vue | ^3.4.21 |
| 状态管理 | Pinia | ^3.0.3 |
| 路由 | Vue Router | ^4.4.5 |
| UI 组件 | Element Plus | ^2.8.3 |
| 构建工具 | Vite | ^5.4.6 |
| 压缩 | adm-zip | ^0.5.16 |

## 项目结构

```
canbox-developer/
├── package.json          # { "name": "canbox-developer", "main": "main.js" }
├── main.js               # Electron 主进程 + developer 专用 IPC handlers
├── preload.js            # contextBridge（canbox-core API + developer API）
├── index.html            # HTML 入口
├── vite.config.mjs       # Vite 构建配置
├── .canbox-app           # Canbox APP 标识文件
├── README.md
└── src/
    ├── main.js           # Vue 3 入口
    ├── App.vue           # 主布局
    ├── router/index.js   # 路由配置
    ├── stores/           # Pinia stores
    ├── views/            # 页面组件
    │   ├── ProjectsView.vue   # 项目列表
    │   ├── ScaffoldView.vue   # 脚手架创建
    │   └── SettingsView.vue   # 设置
    ├── utils/            # 工具函数
    └── assets/           # 静态资源
```

## 启动方式

```bash
# 开发模式
npm run dev    # Vite dev server (port 5102)
npm run start  # electron -r canbox-core/injection.js . --app-id=canbox-developer

# 生产模式
npm run build  # Vite 构建
electron -r canbox-core/injection.js canbox-developer/ --app-id=canbox-developer
```

## 设计决策

### 为什么独立成 APP，不集成在 canbox-manager 里？

1. **操作对象不同**：manager 管已装 APP（`{Users}/apps/`），developer 管源码目录（任意路径），IPC 语义不同
2. **面向用户不同**：manager 面向所有用户，developer 面向开发者，独立可按需下载
3. **隔离迭代风险**：打包/脚手架/调试器迭代频繁，独立 APP 出 bug 不影响普通用户
4. **符合新架构哲学**：新架构刻意把 manager 降级为普通 APP，开发工具链更应独立

### 为什么不进发行包？

canbox-developer 是"少数人需要"的能力，作为独立 APP 通过 repo 按需下载，和 imagebox、launcher 没区别。产品包仅含 `electron + canbox-core + canbox-manager`。

### 开发中的 APP 数据如何隔离？

开发中的 APP 直接从源码目录启动，但 store/db 数据仍写到共享的 `{Users}/data/{appId}/`（core 的 `setPath` 对所有进程生效）。如需隔离，启动时设 `CANBOX_USER_DATA` 环境变量。

## 许可证

Apache-2.0
