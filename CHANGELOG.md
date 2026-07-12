# Changelog

本文件记录项目的所有版本变更。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/)。

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
