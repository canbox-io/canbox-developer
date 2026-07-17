# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
