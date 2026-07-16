# canbox-developer

Canbox 开发者工具 APP — 为 Canbox APP 开发者提供源码目录调试启动、打包分发等开发工作流能力。

## 功能

### 源码目录调试启动

加载本地源码目录（选择 package.json），直接通过 `electron -r injection.js {sourceDir} --app-id={name} --no-sandbox` 启动调试。开发中的 APP 不安装到 `{Users}/apps/`，直接从源码目录运行。

启动时自动设置 `NODE_ENV=development`，APP 的 main.js 据此决定 loadURL（dev server）还是 loadFile（构建产物）。

### 打包分发

#### 作用与定位

打包分发的本质是**把 APP 构建过程已产出的 `app.asar` 按照平台标准结构归档为 zip**，便于在平台内统一流转与安装。它只做标准化压缩，不执行构建、不产生 asar，也不上传到任何远程服务。

打包产出的 zip 是 canbox 平台 APP 安装的**唯一标准输入**：无论通过哪种渠道到达用户，最终都由 canbox-manager 的导入逻辑解压安装。打包分发的价值在于把"构建产物"转化为"平台可识别的标准制品"，并提供两种互不依赖的分发渠道。

#### 两种分发渠道

| 维度 | repo 分发 | 打包分发（本地导入） |
|------|-----------|----------------------|
| **制品来源** | 远程仓库的 GitHub/Gitee Release 资产 | 本地或 CI 产出的 zip 文件 |
| **仓库要求** | 必须公开可访问（manager 通过 HTTP raw 探测元数据，并从 Release 下载 zip） | 不需要仓库，zip 直接交付 |
| **用户操作** | canbox-manager 添加仓库 URL → 点"安装"，manager 自动下载 Release zip 并导入 | canbox-manager 点"导入 APP" → 选择本地 zip |
| **版本更新** | manager 探测 Release 新版本，提示更新，一键拉取 | 用户需重新获取新 zip 再次导入 |
| **可见性** | 仓库元数据（package.json、README、logo）公开可读 | 仅交付 zip，源码仓库可私有 |
| **适用场景** | 开源/公开 APP，希望被平台用户自由发现和安装 | 内部工具、私有 APP、定向分发 |

**关键区分**：repo 分发的"安装"动作本质上也是下载一个标准 zip 再走导入流程，两种渠道的最终安装路径完全一致（都解压到 `apps/{appId}/`）。区别只在于 **zip 如何到达用户**——一是从公开仓库的 Release 拉取，一是本地文件导入。因此 repo 分发场景下，开发者同样需要先用打包分发产出 zip，再上传到仓库的 Release。

#### 打包分发的特殊作用：隐私安全场景

对于有隐私安全要求、不希望公开源码仓库的 APP，打包分发是唯一合适的渠道：

- **仓库可保持私有**：不需要把代码推到公开 repo，也不需要公开 Release 资产
- **仅交付归档制品**：用户收到的是 `app.asar`（Electron asar 归档），不直接暴露源码文件结构与原始 JS
- **定向分发**：zip 可通过任意私有渠道（内部网络、邮件、网盘）交付给指定用户，不经公开仓库中转

> 注意：asar 是归档格式而非加密，对有更强安全要求的场景仍需结合代码混淆、原生编译等 APP 自身的保护措施。打包分发解决的是"不公开仓库"的隐私分发问题，不替代 APP 层面的代码保护。

#### 操作流程

1. 开发者在终端用任意 Electron 打包工具（如 electron-builder、electron-forge 等）打包 → 得到 `resources/` 目录（`app.asar` + 可能的 `app.asar.unpacked/`）
2. 在 developer 点"打包分发" → 选择 `resources/` 目录
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

**注意**：developer 只负责标准化压缩，不替 APP 打 asar。打 asar 是 APP 开发者用任意 Electron 打包工具（如 electron-builder、electron-forge 等）自己完成的事。

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
