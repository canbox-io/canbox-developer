# canbox-developer

Canbox 开发者工具 APP — 为 Canbox APP 开发者提供脚手架创建、源码目录调试启动、打包发布能力。

## 功能

### 脚手架创建

从模板创建新 APP 项目骨架，包含 `package.json`、`main.js`、`preload.js`（黑盒式 API）、Vue 前端骨架、`.canbox-app` 标识。

### 源码目录调试启动

加载本地源码目录，直接通过 `electron -r injection.js {sourceDir} --app-id={appId}` 启动调试。开发中的 APP 不安装到 `{Users}/apps/`，直接从源码目录运行。

### 打包发布

将 APP 源码目录打包为 zip（排除 node_modules/.git/build 等），供 canbox-manager 导入或提交到 repo。

## 获取 injection.js 路径

从 `{Users}/canbox.json` 的 `core.injectionPath` 字段读取（canbox-core 启动时自动写入）。

## 启动方式

```bash
npm install
npm run dev      # Vite dev server (port 5102)
npm run start    # electron -r canbox-core/injection.js . --app-id=canbox-developer
npm run build    # Vite 构建
```

## 项目结构

```
canbox-developer/
├── package.json          # name=canbox-developer, main=main.js
├── main.js               # 主进程 + developer 专用 IPC handlers
├── preload.js            # contextBridge（core API 黑盒 + developer API）
├── index.html            # HTML 入口
├── vite.config.mjs       # Vite 构建配置
├── .canbox-app           # Canbox APP 标识
└── src/
    ├── main.js           # Vue 3 入口
    ├── App.vue           # 主布局
    ├── router/router.js  # 路由配置
    └── views/
        ├── ProjectsView.vue   # 项目列表页
        └── ScaffoldView.vue   # 脚手架创建页
```

## 技术栈

Electron / Vue 3 / Pinia / Vue Router / Element Plus / Vite / adm-zip

## 许可证

Apache-2.0
