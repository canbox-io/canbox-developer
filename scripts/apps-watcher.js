/**
 * scripts/apps-watcher.js — 开发项目元数据监听
 *
 * 只监听元数据，不递归监听整个工程目录（避免 npm install / 构建产物造成刷新风暴）：
 *   - 工程目录内：package.json、.canbox-app、根级 logo 候选文件
 *   - 工程目录自身：整目录被删除 / 重建
 *   - 工程目录的父目录：整目录被删除 / 改名（部分平台下自身目录的通知不可靠）
 *
 * 事件到达后先比对 stat 指纹，真正变化才回调；回调做全局去抖合并。
 * 自身写入（如 writeCanboxMeta）也会触发刷新，但刷新是幂等只读操作，无需区分来源。
 */
const fs = require('fs');
const path = require('path');

// 工程根目录下会被卡片展示的元数据文件
const META_FILES = ['package.json', '.canbox-app', 'logo.png', 'logo.svg', 'logo.jpg', 'icon.png', 'favicon.png'];
// 变化合并窗口：短时间内的多次事件只触发一次刷新
const DEBOUNCE_MS = 300;

// watchPath -> { watcher, targets:Set<sourceDir> }
const _watchers = new Map();
// sourceDir -> { fingerprint }
const _entries = new Map();

let _onChange = null;
let _timer = null;

/**
 * 计算工程目录的元数据指纹：文件 mtime/size 与目录是否存在
 * @param {string} sourceDir - 工程目录
 * @returns {string} 指纹字符串
 */
function fingerprint(sourceDir) {
    const parts = [fs.existsSync(sourceDir) ? 'dir:1' : 'dir:0'];
    for (const name of META_FILES) {
        try {
            const stat = fs.statSync(path.join(sourceDir, name));
            parts.push(`${name}:${stat.mtimeMs}:${stat.size}`);
        } catch (e) {
            parts.push(`${name}:-`);
        }
    }
    return parts.join('|');
}

/**
 * 登记 watchPath 监听（目录不存在时保留登记，后续事件/刷新时重试建立）
 * @param {string} watchPath - 被监听的目录
 * @param {string} sourceDir - 该监听服务的工程目录
 */
function ensureWatcher(watchPath, sourceDir) {
    let record = _watchers.get(watchPath);
    if (!record) {
        record = { watcher: null, targets: new Set() };
        _watchers.set(watchPath, record);
    }
    if (!record.watcher) {
        try {
            const watcher = fs.watch(watchPath, { persistent: false }, () => handleEvent(watchPath));
            watcher.on('error', () => {
                try { watcher.close(); } catch (e) { /* 已关闭则忽略 */ }
                const current = _watchers.get(watchPath);
                if (current && current.watcher === watcher) current.watcher = null;
            });
            record.watcher = watcher;
        } catch (e) {
            // 目录不存在或无权访问：降级为兜底刷新（窗口聚焦 / 手动刷新）
            record.watcher = null;
        }
    }
    record.targets.add(sourceDir);
}

/**
 * 解除某个工程目录对 watchPath 的引用，无人引用时关闭监听
 * @param {string} watchPath - 被监听的目录
 * @param {string} sourceDir - 工程目录
 */
function releaseWatcher(watchPath, sourceDir) {
    const record = _watchers.get(watchPath);
    if (!record) return;
    record.targets.delete(sourceDir);
    if (record.targets.size > 0) return;
    if (record.watcher) {
        try { record.watcher.close(); } catch (e) { /* 忽略 */ }
    }
    _watchers.delete(watchPath);
}

/**
 * 去抖后通知外部刷新一次
 */
function scheduleNotify() {
    if (_timer) clearTimeout(_timer);
    _timer = setTimeout(() => {
        _timer = null;
        if (!_onChange) return;
        try {
            _onChange();
        } catch (e) {
            // 回调异常不影响监听
        }
    }, DEBOUNCE_MS);
}

/**
 * 目录事件处理：只关心受影响的工程目录，stat 比对后才通知
 * @param {string} watchPath - 触发事件的被监听目录
 */
function handleEvent(watchPath) {
    const record = _watchers.get(watchPath);
    if (!record) return;

    for (const sourceDir of Array.from(record.targets)) {
        const entry = _entries.get(sourceDir);
        if (!entry) continue;

        const exists = fs.existsSync(sourceDir);
        if (!exists) {
            // 工程目录被删除：自身监听已失效，关闭以便目录重建后重新建立
            if (watchPath === sourceDir) {
                const selfRecord = _watchers.get(sourceDir);
                if (selfRecord && selfRecord.watcher) {
                    try { selfRecord.watcher.close(); } catch (e) { /* 忽略 */ }
                    selfRecord.watcher = null;
                }
            }
        } else {
            // 目录（重新）出现时补齐自身监听
            ensureWatcher(sourceDir, sourceDir);
        }

        const next = fingerprint(sourceDir);
        if (next === entry.fingerprint) continue;
        entry.fingerprint = next;
        scheduleNotify();
    }
}

/**
 * 用最新项目列表重建监听集合
 * 每次刷新都会对齐指纹基线，保证基线永远等于界面当前展示的数据
 * @param {Array<{sourceDir:string}>} projects - 开发项目记录
 * @param {() => void} onChange - 元数据变化回调（已去抖）
 * @returns {number} 当前监听的工程数量
 */
function sync(projects, onChange) {
    if (typeof onChange === 'function') _onChange = onChange;

    const desired = new Set();
    for (const project of projects || []) {
        const sourceDir = project && project.sourceDir;
        if (!sourceDir) continue;
        desired.add(sourceDir);

        const entry = _entries.get(sourceDir);
        if (entry) {
            entry.fingerprint = fingerprint(sourceDir);
        } else {
            _entries.set(sourceDir, { fingerprint: fingerprint(sourceDir) });
        }

        ensureWatcher(sourceDir, sourceDir);
        ensureWatcher(path.dirname(sourceDir), sourceDir);
    }

    // 移除已不在列表中的工程
    for (const sourceDir of Array.from(_entries.keys())) {
        if (desired.has(sourceDir)) continue;
        releaseWatcher(sourceDir, sourceDir);
        releaseWatcher(path.dirname(sourceDir), sourceDir);
        _entries.delete(sourceDir);
    }

    return _entries.size;
}

module.exports = { sync };
