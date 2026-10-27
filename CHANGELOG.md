# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

## [0.2.0] - 2026-10-27

### feat | 新功能 / Features

新增 displayName 应用展示名：界面优先展示，未配置时回退 name，骨架生成与开发文档同步支持
新增开发项目元数据监听：package.json、.canbox-app、logo 变更以及工程目录被删除都会实时反映到项目列表
新增工程缺失态展示：区分目录不存在、package.json 缺失、package.json 无法解析，并提供「重新定位」入口
新增手动刷新按钮，并在窗口聚焦/可见时自动刷新，作为文件监听不可用（如网络盘）时的兜底
项目记录改为以工程目录为主键，修复修改 name 后无法移除、同一工程被重复添加的问题

Add a displayName field for app display names: preferred by the UI and falling back to name; scaffold and dev docs updated
Watch dev project metadata so changes to package.json, .canbox-app and logo, plus directory deletion, are reflected in the project list immediately
Show missing states for deleted directories and missing or unparsable package.json, with a "relocate" action
Add a manual refresh button and auto-refresh on window focus/visibility as a fallback when file watching is unavailable (e.g. network drives)
Key project records by source directory, fixing removal failing and duplicate adds after renaming name

### build | 构建 / Build

版本号更新至 0.2.0

Bump version to 0.2.0

## [0.1.9] - 2026-10-25

### feat | 新功能 / Features

启动器显示名改为 DevBox（新增 displayName，包名、id 与安装标识保持不变）
新增骨架默认图标（盒子 + 加号），新建 APP 时自动带入 logo.png 及 48/128/256/512 多尺寸图标
"新建APP"新增「设置界面打开方式」选项：切换界面、弹层、新窗口，三种技术栈模板均支持
骨架内置中英双语，设置中可切换语言并持久化到 canbox store，下次启动保持用户选择
新窗口模式下设置窗口以主窗口为父窗口，随主窗口最小化与关闭

Change the launcher display name to DevBox (adds displayName; package name, id and install identity unchanged)
Add a default scaffold icon (box + plus) shipped into new APPs as logo.png plus 48/128/256/512 icons
Add a "Settings screen opening" option to New App: switch view, modal, or new window, supported by all three templates
Build bilingual (zh-CN / en-US) scaffold templates with a language selector persisted in canbox store and restored on next launch
Make the standalone settings window a child of the main window in new-window mode

### docs | 文档 / Documentation

新增简体中文 README 并同步更新英文 README 内容
首页标题改为 Canbox Developer Box

Add a Simplified Chinese README and sync updates to the English README
Change the home page title to Canbox Developer Box

### build | 构建 / Build

版本号更新至 0.1.9

Bump version to 0.1.9

## [0.1.8] - 2026-10-20

### feat | 新功能 / Features

新增 APP 项目骨架生成功能，支持 Vue 3 + Vite（JavaScript）、Vue 3 + Vite（TypeScript）、原生 JavaScript（无构建）三种技术栈模板，内置界面缩放、窗口状态记忆、界面状态保持、禁止选中复制、快捷键设置等基础能力
新增"新建APP"界面，支持选择工程目录并填写名称/描述/作者/分类/Electron 版本，创建完成后自动退出并加入开发项目列表
新增 Ctrl+, 打开设置界面快捷键，设置中集中展示全部快捷键条目
新增 APP 分类能力，添加已有 APP 时可选择分类并写入 .canbox-app 配置的 category 字段
"开发文档""API 文档"入口由按钮改为文字链接，与操作按钮区分

Add APP project scaffolding with three tech-stack templates: Vue 3 + Vite (JavaScript), Vue 3 + Vite (TypeScript), and vanilla JavaScript (no build), with the five built-in capabilities (zoom, window state memory, view state preservation, selection/copy disabled, shortcut settings)
Add a "New App" page supporting project directory selection plus name/description/author/category/Electron version input; on success it exits the page and adds the project to the dev list
Add a Ctrl+, shortcut to open settings, with all shortcuts listed in the settings view
Add APP category support: choose a category when adding an existing APP and write it into the .canbox-app config
Change the "Dev Docs" / "API Docs" entries from buttons to text links to distinguish them from action buttons

### fix | 问题修复 / Bug Fixes

修复骨架生成的 start 脚本硬编码 canbox-core 注入路径的问题：改为通过 getCoreInjectionPath() 写入真实绝对路径
修复骨架工程构建产物路径未与主进程加载路径对齐的问题：统一 vite 构建输出到 build 目录
修复 el-link 使用布尔型 underline 触发的 Element Plus 弃用告警：改用 underline="never"

Fix the scaffolded project's start script hardcoding the canbox-core injection path: use getCoreInjectionPath() to write the real absolute path
Fix the mismatch between the scaffolded build output path and the main-process load path: unify Vite output to the build directory
Fix the Element Plus deprecation warning caused by the boolean underline prop on el-link: use underline="never" instead

### build | 构建 / Build

更新 .canbox-app 配置文件，新增 category 字段

Update the .canbox-app config file with a new category field

## [0.1.7] - 2026-10-10

### fix | 问题修复 / Bug Fixes

修复生产模式下"打包发布"报 Cannot find module 'adm-zip' 的问题：改为在关闭 asar 支持前先行加载 adm-zip，避免无法解析 app.asar 内的依赖

Fix the "Cannot find module 'adm-zip'" error when publishing in production mode: load adm-zip before disabling asar support so dependencies inside app.asar can still be resolved

## [0.1.6] - 2026-09-29

### fix | 问题修复 / Bug Fixes

修复生产模式下"打包"按钮失效的问题：build.files 遗漏 scripts 目录，导致 canbox-publish.js 未被打进 app.asar
打包失败时返回可见错误提示，避免静默失败

Fix the "Pack" button failing in production builds: the scripts directory was missing from build.files, so canbox-publish.js was not packaged into app.asar
Surface a visible error when packaging fails instead of failing silently

## [0.1.5] - 2026-09-28

### feat | 新功能 / Features

优化打包成功提示为模态对话框，支持一键打开 zip 所在目录，并接入 canbox-core 集中日志输出
关于页新增许可证和作者信息，优化 CI 镜像源选择逻辑

Optimize pack-success prompt to a modal dialog with one-click open-folder support, and integrate centralized logging via canbox-core
Add license and author info to About page, improve CI mirror source selection logic

### fix | 问题修复 / Bug Fixes

锁定 electron 依赖为精确版本 42.5.1，避免 ^ 范围拉取不兼容的 42.7.0

Pin electron dependency to exact 42.5.1 to prevent ^ range from pulling incompatible 42.7.0

### build | 构建 / Build

添加 cross-env 依赖并修复启动脚本的环境变量设置，支持跨平台 npm run

Add cross-env dependency and fix environment variable setup in start scripts for cross-platform npm run

### chore | 维护 / Maintenance

修改 package.json 中的作者信息

Update author info in package.json

## [0.1.4] - 2026-07-19

### feat | 新功能 / Features

脚手架创建新增 Electron 版本下拉选择，版本来自 canbox-core 白名单
添加已有 APP 时检测 .canbox-app，缺失或缺少 electron.range 时提示用户选择版本并自动写入配置
新增 developer.electron.listAllowed 与 developer.apps.writeCanboxMeta IPC
增加首屏加载动画，避免窗口显示到 UI 渲染之间的空白

Scaffold creation adds Electron version dropdown, sourced from canbox-core whitelist
Detect .canbox-app when adding existing APP; prompt user to select version and auto-write config if missing or without electron.range
Add developer.electron.listAllowed and developer.apps.writeCanboxMeta IPCs
Add first-frame loading animation to avoid blank between window show and UI render

### fix | 问题修复 / Bug Fixes

修复点击「添加 APP」按钮时 MouseEvent 被误传为路径参数导致的类型错误
统一错误提示组件为 notification.js，与 manager 风格保持一致
移除窗口 show:false 与冗余 appReady 调用，窗口立即可见

Fix TypeError when clicking "Add APP" button caused by MouseEvent being passed as path parameter
Unify error notification component to notification.js to match manager's style
Remove show:false and redundant appReady call, window now visible immediately

### perf | 性能优化 / Performance

优化启动流程，将 app.mount 提前至 IPC 调用前，避免 settingsGet 往返阻塞首帧
将 appReady 调用从 ProjectsView 的 onMounted 移至 main.js 挂载后立即触发，省去懒加载 chunk 等待

Optimize startup flow by moving app.mount before IPC calls to avoid settingsGet round-trip blocking first frame
Move appReady call from ProjectsView's onMounted to main.js after mount to skip lazy-loaded chunk wait

## [0.1.3] - 2026-07-17

### feat | 新功能 / Features

支持 .canbox-app 平台配置文件，Electron 升级至 42.5.1

Support .canbox-app platform config file, upgrade Electron to 42.5.1

### fix | 问题修复 / Bug Fixes

打包时保留 logo 相对路径，与 package.json 声明一致

Preserve logo relative path in zip to match package.json declaration

## [0.1.2] - 2026-07-16

### docs | 文档 / Documentation

将「发布」功能重命名为「打包分发」，补充分发渠道说明与隐私安全场景
说明打包分发的本质：不构建、不产生 asar，仅做标准化压缩

Rename "Publish" to "Pack for Distribution", add distribution channels and privacy/security scenarios
Clarify the essence of pack-for-distribution: no build, no asar generation, only standardized compression

### refactor | 重构 / Refactoring

将 GUI、i18n、对话框标题中的「发布」文案统一修改为「打包分发」
解除对 electron-builder 的工具绑定，改为通用表述

Unify "Publish" wording to "Pack for Distribution" across GUI, i18n, and dialog titles
Decouple from electron-builder binding, use generic wording

## [0.1.1] - 2026-07-15

### feat | 新功能 / Features

添加多语言支持（vue-i18n），设置页可切换中英文界面
实现语言偏好持久化，重启后自动恢复上次选择的语言

Add i18n support (vue-i18n), switch Chinese/English in settings page
Persist language preference, restore last selected language on restart

### fix | 问题修复 / Bug Fixes

修复 GitHub Release 页面不显示 CHANGELOG 内容的问题

Fix GitHub Release page not showing CHANGELOG content

### refactor | 重构 / Refactoring

将对话框和 URL 打开能力从 canbox-core 迁移至 developer 自身 IPC

Move dialog and URL opening capabilities from canbox-core to developer IPC

## [0.1.0] - 2026-07-12

### feat | 新功能 / Features

开发项目管理：支持添加、移除开发中的 APP 项目
基于 canbox-core 注入机制运行，提供核心环境能力
脚手架创建：快速生成符合 canbox 规范的 APP 项目结构
源码目录调试启动：直接从源码启动 APP 进行调试
打包发布：基于 asar 的标准 zip 发布流程，支持 GUI 与 CLI 两种方式
APP 元数据读取：自动识别 package.json 中的 id、logo、平台、关键词等字段
窗口状态持久化与恢复
缩放调节与设置页面
设置 NODE_ENV 并转发子进程日志
检测应用启动后立即退出并添加沙箱参数
preload.js 中新增 misc API

Development project management: add and remove APP projects under development
Run on canbox-core injection mechanism, providing core environment capabilities
Scaffold creation: quickly generate canbox-compliant APP project structure
Debug launch from source directory: start APP directly from source for debugging
Packaging and release: asar-based standard zip release flow, supporting both GUI and CLI
APP metadata reading: auto-detect id, logo, platform, keywords from package.json
Window state persistence and restoration
Zoom control and settings page
Set NODE_ENV and forward child process logs
Detect app startup immediate exit and add sandbox args
Add misc API in preload.js

### fix | 问题修复 / Bug Fixes

禁用 Electron asar patch，防止 zip 中 app.asar 变空

Disable Electron asar patch to prevent empty app.asar in zip

### refactor | 重构 / Refactoring

提取 canbox 打包逻辑到共享模块 canbox-publish.js，GUI 与 CLI 共用同一逻辑

Extract canbox packaging logic to shared module canbox-publish.js, GUI and CLI share same logic

### docs | 文档 / Documentation

编写 APP 开发文档（APP_DEV.md），明确 canbox-core 和 canbox-developer 的可选性

Write APP development docs (APP_DEV.md), clarify optionality of canbox-core and canbox-developer

### build | 构建 / Build

添加 electron-builder 配置和 GitHub Release 工作流，支持 CI/CD 自动发布

Add electron-builder config and GitHub Release workflow, supporting CI/CD auto-release
