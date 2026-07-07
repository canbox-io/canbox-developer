# canbox-developer

Canbox 开发者工具 APP — 为 Canbox APP 开发者提供源码目录调试启动、发布等开发工作流能力。

## 功能

### 源码目录调试启动

加载本地源码目录（选择 package.json），直接通过 `electron -r injection.js {sourceDir} --app-id={name} --no-sandbox` 启动调试。开发中的 APP 不安装到 `{Users}/apps/`，直接从源码目录运行。

启动时自动设置 `NODE_ENV=development`，APP 的 main.js 据此决定 loadURL（dev server）还是 loadFile（构建产物）。

### 发布

将 electron-builder 构建产物按 canbox 标准结构压成 zip：

1. 开发者在终端跑 electron-builder 打包 → 得到 `resources/` 目录（`app.asar` + 可能的 `app.asar.unpacked/`）
2. 在 developer 点"发布" → 选择 `resources/` 目录
3. developer 自动从源码目录提取 `package.json` 和 `logo.png`
4. 按标准结构压 zip，输出 `{id}-{version}[-{platform}-{arch}].zip`

**zip 标准结构：**
```
{id}-{version}[-{platform}-{arch}].zip
├── app.asar                  # APP 代码 + JS 依赖
├── app.asar.unpacked/        # 原生模块（可选）
├── package.json              # APP 元数据
└── logo.png                  # APP 图标
```

该 zip 可上传到 repo，或通过 canbox-manager 导入。

**注意**：developer 只负责标准化压缩，不替 APP 打 asar。打 asar 是 APP 开发者用 electron-builder 自己完成的事。

## 启动方式

```bash
npm install
npm run dev      # Vite dev server (port 5102)
npm run start    # electron -r canbox-core/injection.js . --app-id=canbox-developer --no-sandbox
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
├── docs/APP_DEV.md       # APP 开发指南
└── src/
    ├── main.js           # Vue 3 入口
    ├── App.vue           # 主布局
    ├── router/router.js  # 路由配置
    └── views/
        ├── ProjectsView.vue   # 项目列表页
        └── SettingsView.vue   # 设置页
```

## 技术栈

Electron / Vue 3 / Pinia / Vue Router / Element Plus / Vite / adm-zip

## 许可证

Apache-2.0
