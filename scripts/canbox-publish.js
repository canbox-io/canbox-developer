#!/usr/bin/env node
/**
 * canbox-publish.js — Canbox APP 标准化打包 CLI
 *
 * 从 electron-builder 构建产物中提取 app.asar，按 canbox 标准结构打包为 zip。
 * 供 CI/CD 环境使用，也供 canbox-developer 的 GUI 发布功能内部调用。
 *
 * 用法（CLI）：
 *   node canbox-publish.js --source <源码目录> --resources <构建产物目录> [--out <输出目录>]
 *
 * 参数：
 *   --source     APP 源码目录（读取 package.json 和 logo），默认当前目录
 *   --resources  electron-builder 构建产物目录（含 app.asar），如 dist/linux-unpacked/resources/
 *   --out        zip 输出目录，默认源码目录同级
 *
 * zip 结构：
 *   {id}-{version}[-{platform}-{arch}].zip
 *   ├── app.asar
 *   ├── app.asar.unpacked/    （如有原生模块）
 *   ├── package.json
 *   ├── .canbox-app           （canbox 平台配置）
 *   └── logo.png
 *
 * 依赖：adm-zip
 */

const fs = require('fs');
const path = require('path');

/**
 * 获取 canbox-core 注入的 logger（log4js），写入 {usersPath}/logs/canbox.log
 * 若 logger 未初始化（如 CLI 直接运行无 Electron 环境），降级为 console
 * 注意：不在模块加载时获取，而是每次使用时动态获取——
 * 因为 injection.js 的 logger.init() 在 app.whenReady() 之后异步执行，
 * 模块加载时 logger 尚未就绪
 */
function _getLogger() {
    try {
        const corePath = global.__CANBOX_CORE_PATH__;
        if (!corePath) return console;
        const loggerModule = require(path.join(corePath, 'lib', 'logger'));
        return loggerModule.get() || console;
    } catch (_) {
        return console;
    }
}
const logger = {
    info: (...args) => _getLogger().info(...args),
    error: (...args) => _getLogger().error(...args)
};

/**
 * 按 canbox 标准结构打包 zip
 * @param {string} sourceDir - APP 源码目录（读取 package.json 和 logo）
 * @param {string} resourcesDir - electron-builder 构建产物目录（含 app.asar）
 * @param {string} [outDir] - zip 输出目录，默认 {sourceDir}/dist/（dist 不存在则 fallback 到源码目录同级）
 * @returns {{success: boolean, path?: string, error?: string}}
 */
function packCanboxZip(sourceDir, resourcesDir, outDir) {
    logger.info('[publish] packCanboxZip: start, sourceDir=%s resourcesDir=%s outDir=%s', sourceDir, resourcesDir, outDir || '(auto)');

    // 检查 app.asar 存在
    const asarPath = path.join(resourcesDir, 'app.asar');
    if (!fs.existsSync(asarPath)) {
        const err = '所选目录中未找到 app.asar，请选择包含 app.asar 的目录';
        logger.error('[publish] packCanboxZip: asar not found at %s', asarPath);
        return { success: false, error: err };
    }

    // 检查 app.asar.unpacked 是否存在（判断有无原生模块）
    const unpackedPath = path.join(resourcesDir, 'app.asar.unpacked');
    const hasUnpacked = fs.existsSync(unpackedPath);
    logger.info('[publish] packCanboxZip: asar=%s unpacked=%s', asarPath, hasUnpacked ? unpackedPath : '(none)');

    // 从源码目录读 package.json
    const pkgPath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        logger.error('[publish] packCanboxZip: package.json not found at %s', pkgPath);
        return { success: false, error: '源码目录中未找到 package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const appIdentifier = pkg.id || pkg.name;
    const version = pkg.version || '0.0.0';
    logger.info('[publish] packCanboxZip: pkg id=%s name=%s version=%s', pkg.id, pkg.name, version);

    // 推断平台（从 resources 父目录名，如 linux-unpacked → linux）
    let platformSuffix = '';
    if (hasUnpacked) {
        const parentName = path.basename(path.dirname(resourcesDir));
        const match = parentName.match(/^(.+)-unpacked$/);
        if (match) {
            platformSuffix = `-${match[1]}`;
        }
    }

    const zipName = `${appIdentifier}-${version}${platformSuffix}.zip`;
    // 输出目录优先级：显式传入 > {sourceDir}/dist/（如存在）> 源码目录同级
    let outputDir = outDir;
    if (!outputDir) {
        const distDir = path.join(sourceDir, 'dist');
        if (fs.existsSync(distDir) && fs.statSync(distDir).isDirectory()) {
            outputDir = distDir;
        } else {
            outputDir = path.dirname(sourceDir);
        }
    }
    const zipPath = path.join(outputDir, zipName);
    logger.info('[publish] packCanboxZip: zipName=%s outputDir=%s zipPath=%s', zipName, outputDir, zipPath);

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 先加载 adm-zip，必须早于 process.noAsar = true：
    // 生产模式下本脚本位于 app.asar 内，若关闭 asar 支持再 require，
    // 将无法解析 asar 内的 node_modules，报 "Cannot find module 'adm-zip'"
    const AdmZip = require('adm-zip');

    // 禁用 Electron asar 补丁，否则 adm-zip 的 addLocalFile 会把 app.asar 当目录处理
    // （statSync 返回 isDirectory=true，readFileSync 读不到真实内容），生成的 zip 里
    // app.asar 会变成空目录 entry，APP 内容丢失
    const prevNoAsar = process.noAsar;
    process.noAsar = true;
    try {
        const zip = new AdmZip();

        // 1. app.asar
        zip.addLocalFile(asarPath, '');

        // 2. app.asar.unpacked/（如有）
        if (hasUnpacked) {
            function addDirToZip(dirPath, zipEntryPath) {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);
                    const entryZipPath = zipEntryPath ? `${zipEntryPath}/${entry.name}` : entry.name;
                    if (entry.isDirectory()) {
                        addDirToZip(fullPath, entryZipPath);
                    } else {
                        zip.addLocalFile(fullPath, zipEntryPath);
                    }
                }
            }
            addDirToZip(unpackedPath, 'app.asar.unpacked');
        }

        // 3. package.json（从源码目录）
        zip.addLocalFile(pkgPath, '');

        // 4. .canbox-app（canbox 平台配置，从源码目录）
        const canboxAppPath = path.join(sourceDir, '.canbox-app');
        if (fs.existsSync(canboxAppPath)) {
            zip.addLocalFile(canboxAppPath, '');
        }

        // 5. logo（从源码目录自动探测，保留相对路径以匹配 package.json 声明）
        const logoCandidates = pkg.logo
            ? [pkg.logo]
            : ['logo.png', 'logo.svg', 'icon.png', 'favicon.png'];
        for (const candidate of logoCandidates) {
            const logoFile = path.join(sourceDir, candidate);
            if (fs.existsSync(logoFile)) {
                // 保留相对目录结构，使 zip 内路径与 pkg.logo 一致
                const zipDir = path.dirname(candidate);
                zip.addLocalFile(logoFile, zipDir);
                break;
            }
        }

        zip.writeZip(zipPath);
        logger.info('[publish] packCanboxZip: writeZip done, path=%s size=%d bytes', zipPath, fs.statSync(zipPath).size);
    } catch (e) {
        logger.error('[publish] packCanboxZip: writeZip failed: %s', e.stack || e.message);
        throw e;
    } finally {
        process.noAsar = prevNoAsar;
    }

    return { success: true, path: zipPath };
}

/**
 * 解析命令行参数
 * @returns {{source?: string, resources?: string, out?: string}}
 */
function parseArgs() {
    const args = process.argv.slice(2);
    const result = {};
    for (let i = 0; i < args.length; i++) {
        if (args[i] === '--source' && i + 1 < args.length) {
            result.source = args[++i];
        } else if (args[i] === '--resources' && i + 1 < args.length) {
            result.resources = args[++i];
        } else if (args[i] === '--out' && i + 1 < args.length) {
            result.out = args[++i];
        } else if (args[i] === '--help' || args[i] === '-h') {
            result.help = true;
        }
    }
    return result;
}

function printHelp() {
    console.log(`
canbox-publish — Canbox APP 标准化打包 CLI

用法：
  node canbox-publish.js --source <源码目录> --resources <构建产物目录> [--out <输出目录>]

参数：
  --source     APP 源码目录（读取 package.json 和 logo），默认当前目录
  --resources  electron-builder 构建产物目录（含 app.asar）
  --out        zip 输出目录，默认源码目录同级

示例：
  node canbox-publish.js --source . --resources dist/linux-unpacked/resources/ --out release/
`);
}

// CLI 入口
if (require.main === module) {
    const args = parseArgs();
    if (args.help) {
        printHelp();
        process.exit(0);
    }

    const sourceDir = path.resolve(args.source || '.');
    const resourcesDir = args.resources ? path.resolve(args.resources) : null;
    const outDir = args.out ? path.resolve(args.out) : null;

    if (!resourcesDir) {
        console.error('错误：缺少 --resources 参数');
        printHelp();
        process.exit(1);
    }

    const result = packCanboxZip(sourceDir, resourcesDir, outDir);
    if (result.success) {
        console.log(`打包成功：${result.path}`);
    } else {
        console.error(`打包失败：${result.error}`);
        process.exit(1);
    }
}

// ============================================================
// 完整构建流水线：探测包管理器、探测 scripts、spawn 命令、
// 自动定位产物目录，最后调用 packCanboxZip 打 zip。
// 支持外部 stop（杀子进程）、支持进度回调（步骤变更 + 逐行日志）。
// ============================================================

const { spawn } = require('child_process');
const os = require('os');

/**
 * 探测包管理器（按 lock 文件优先级）
 * @param {string} sourceDir - APP 源码目录
 * @returns {'pnpm' | 'yarn' | 'npm'}
 */
function detectPackageManager(sourceDir) {
    if (fs.existsSync(path.join(sourceDir, 'pnpm-lock.yaml'))) return 'pnpm';
    if (fs.existsSync(path.join(sourceDir, 'yarn.lock'))) return 'yarn';
    if (fs.existsSync(path.join(sourceDir, 'package-lock.json'))) return 'npm';
    // 无 lock 文件：按命令可用性推断
    const whichPnpm = syncWhich('pnpm');
    if (whichPnpm) return 'pnpm';
    return 'npm';
}

/**
 * 同步探测命令是否存在（which/where）
 * @param {string} cmd - 命令名
 * @returns {string|null} 可执行路径或 null
 */
function syncWhich(cmd) {
    try {
        const result = require('child_process').execSync(
            process.platform === 'win32' ? `where ${cmd}` : `which ${cmd}`,
            { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
        );
        const firstLine = result.split('\n')[0].trim();
        return firstLine || null;
    } catch (_) {
        return null;
    }
}

/**
 * 探测渲染层构建脚本（可选阶段）
 * @param {object} scripts - package.json.scripts 对象
 * @returns {string|null} 脚本名，未找到返回 null
 */
function detectBuildScript(scripts) {
    const candidates = ['build', 'vite:build', 'web-build', 'compile'];
    for (const name of candidates) {
        if (typeof scripts[name] === 'string') return name;
    }
    return null;
}

/**
 * 探测 Electron 打包脚本（必须阶段）
 * @param {object} scripts - package.json.scripts 对象
 * @returns {string|null} 脚本名，未找到返回 null
 */
function detectDistScript(scripts) {
    // 通用脚本优先：electron-builder 的 --dir 默认为当前平台，
    // 绝大多数 APP 只需一个 dist，不应按平台拆分脚本。
    // 平台专用脚本仅作兜底，供确实依赖平台相关包的项目使用。
    const generic = ['dist', 'package', 'make', 'builder', 'electron-builder', 'asar', 'pack'];
    const platformSpecific = process.platform === 'win32'
        ? ['dist:win', 'win']
        : ['dist:linux', 'linux'];
    for (const name of [...generic, ...platformSpecific]) {
        if (typeof scripts[name] === 'string') return name;
    }
    return null;
}

/**
 * 组合探测：返回完整的流水线配置
 * @param {string} sourceDir - APP 源码目录
 * @returns {{
 *   success: boolean,
 *   packageManager?: 'pnpm'|'yarn'|'npm',
 *   buildScript?: string|null,
 *   distScript?: string|null,
 *   needInstall: boolean,
 *   error?: string,
 *   reason?: string
 * }}
 */
function detectPipelineConfig(sourceDir) {
    const pkgPath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { success: false, error: 'package.json 不存在', reason: 'no-package-json' };
    }

    let pkg;
    try {
        pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    } catch (e) {
        return { success: false, error: 'package.json 解析失败', reason: 'bad-package-json' };
    }

    const scripts = pkg.scripts || {};
    const pm = detectPackageManager(sourceDir);
    const buildScript = detectBuildScript(scripts);
    const distScript = detectDistScript(scripts);
    const nodeModulesExists = fs.existsSync(path.join(sourceDir, 'node_modules'));

    return {
        success: true,
        packageManager: pm,
        buildScript,
        distScript,
        needInstall: !nodeModulesExists,
        pkg
    };
}

/**
 * 从 unpacked 目录名推断平台（win-unpacked / linux-unpacked / mac-arm64 ...）
 * @param {string} dirName
 * @returns {'win32'|'darwin'|'linux'|''}
 */
function unpackedPlatform(dirName) {
    const name = dirName.toLowerCase();
    if (name.includes('win')) return 'win32';
    if (name.includes('mac') || name.includes('darwin')) return 'darwin';
    if (name.includes('linux')) return 'linux';
    return '';
}

/**
 * glob 同步找 app.asar（支持 electron-builder 和 electron-forge 多种产物布局）
 *
 * 同一模式可能命中多个目录（如同时存在 win-unpacked 与 linux-unpacked），
 * 这里优先选当前平台、其次选最新构建的那个——否则会静默打包成旧产物/其它平台的包。
 * @param {string} sourceDir - APP 源码目录
 * @returns {{ resourcesDir: string, hasUnpacked: boolean, platformMismatch: boolean }|null}
 */
function findResourcesDir(sourceDir) {
    const patterns = [
        // electron-builder dir target（最常见）
        'dist/*-unpacked/resources/app.asar',
        'dist/*-unpacked/resources/app',
        // electron-builder 其他 target
        'dist/**/resources/app.asar',
        'dist/**/resources/app',
        // electron-forge
        'out/**/resources/app.asar',
        'out/**/resources/app',
        // 兜底
        'build/**/app.asar',
    ];

    for (const pattern of patterns) {
        const matches = [];
        for (const found of globAll(sourceDir, pattern)) {
            const resourcesDir = path.dirname(found);
            // resources 的父目录才是 win-unpacked / linux-unpacked
            const platform = unpackedPlatform(path.basename(path.dirname(resourcesDir)));
            let mtime = 0;
            try { mtime = fs.statSync(found).mtimeMs; } catch (_) { /* 忽略 */ }
            matches.push({ resourcesDir, found, platform, mtime });
        }
        if (!matches.length) continue;

        const samePlatform = matches.filter((item) => !item.platform || item.platform === process.platform);
        const pool = (samePlatform.length ? samePlatform : matches).slice().sort((a, b) => b.mtime - a.mtime);
        const best = pool[0];
        const hasUnpacked = fs.existsSync(path.join(best.resourcesDir, 'app.asar.unpacked'))
            || fs.statSync(best.found).isDirectory();
        return {
            resourcesDir: best.resourcesDir,
            hasUnpacked: hasUnpacked,
            platformMismatch: samePlatform.length === 0 && !!best.platform
        };
    }
    return null;
}

/**
 * 简易 glob 实现（仅支持 * 和 ** 通配符，同步，返回全部匹配）
 * @param {string} root - 搜索根目录
 * @param {string} pattern - 相对路径模式
 * @returns {string[]} 全部匹配的绝对路径
 */
function globAll(root, pattern) {
    const parts = pattern.split('/');
    const results = [];
    function walk(dir, idx) {
        if (idx >= parts.length) {
            if (fs.existsSync(dir)) results.push(dir);
            return;
        }
        const part = parts[idx];
        if (part === '**') {
            walk(dir, idx + 1);
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return; }
            for (const entry of entries) {
                if (entry.isDirectory()) walk(path.join(dir, entry.name), idx);
            }
            return;
        }
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return;
        let entries;
        try { entries = fs.readdirSync(dir); } catch (_) { return; }
        const regex = globPartToRegex(part);
        for (const name of entries) {
            if (!regex.test(name)) continue;
            walk(path.join(dir, name), idx + 1);
        }
    }
    walk(root, 0);
    return results;
}

/**
 * 简易 glob 实现（仅支持 * 和 ** 通配符，同步，返回第一个匹配）
 * 为什么不依赖 fast-glob？保持 canbox-publish.js 零依赖（现有只依赖 adm-zip 用于 zip 打包）
 * @param {string} root - 搜索根目录
 * @param {string} pattern - 相对路径模式
 * @returns {string|null} 第一个匹配的绝对路径
 */
function globFirst(root, pattern) {
    const parts = pattern.split('/');
    function walk(dir, idx) {
        if (idx >= parts.length) {
            return fs.existsSync(dir) ? dir : null;
        }
        const part = parts[idx];
        if (part === '**') {
            // 递归：尝试当前目录所有子目录的所有层级
            const result = walk(dir, idx + 1);
            if (result) return result;
            if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
            let entries;
            try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch (_) { return null; }
            for (const entry of entries) {
                if (entry.isDirectory()) {
                    const found = walk(path.join(dir, entry.name), idx);
                    if (found) return found;
                }
            }
            return null;
        }
        if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return null;
        let entries;
        try { entries = fs.readdirSync(dir); } catch (_) { return null; }
        const regex = globPartToRegex(part);
        for (const name of entries) {
            if (!regex.test(name)) continue;
            const found = walk(path.join(dir, name), idx + 1);
            if (found) return found;
        }
        return null;
    }
    return walk(root, 0);
}

/**
 * glob 片段 → 正则（* 匹配除 / 外任意字符，** 已在上层处理）
 */
function globPartToRegex(part) {
    let regex = '^';
    for (const ch of part) {
        if (ch === '*') regex += '[^/]*';
        else if ('.+^${}()|[]\\'.includes(ch)) regex += '\\' + ch;
        else regex += ch;
    }
    regex += '$';
    return new RegExp(regex);
}

/**
 * 构建 shell 命令：pnpm run xxx / yarn xxx / npm run xxx
 * @param {'pnpm'|'yarn'|'npm'} pm
 * @param {string} script - script 名
 * @param {boolean} isInstall - 是否是 install（install 不需要 run 子命令）
 * @returns {string}
 */
function buildCommand(pm, script, isInstall) {
    if (isInstall) {
        // pnpm 用 install 或 i；yarn 用 install；npm 用 ci（有 lock）或 install
        if (pm === 'pnpm') return 'pnpm install --frozen-lockfile';
        if (pm === 'yarn') return 'yarn install --frozen-lockfile';
        return 'npm ci';
    }
    if (pm === 'pnpm') return `pnpm run ${script}`;
    if (pm === 'yarn') return `yarn ${script}`;
    return `npm run ${script}`;
}

/**
 * 从用户 shell 读取真实 PATH 与 VOLTA_HOME。
 *
 * Electron APP 从桌面/管理器启动时 PATH 常被裁剪，shell 里 export 的变量也不会带进来。
 * 这里用交互式 shell 重新 source 用户 profile 来还原：
 * Ubuntu 的 ~/.bashrc 在非交互模式下会提前 return，所以必须带 -i 才读得到用户 PATH。
 *
 * @returns {{path: string[], voltaHome: string}}
 */
function readUserShellEnv() {
    const result = { path: [], voltaHome: '' };
    // Windows 没有 POSIX shell profile，PATH 由系统提供，无需（也无法）从 profile 读取
    if (process.platform === 'win32') return result;
    const profiles = [
        path.join(os.homedir(), '.zshrc'),
        path.join(os.homedir(), '.zprofile'),
        path.join(os.homedir(), '.bashrc'),
        path.join(os.homedir(), '.bash_profile'),
        path.join(os.homedir(), '.profile'),
    ];
    const shell = process.platform === 'darwin' ? '/bin/zsh' : '/bin/bash';
    for (const profile of profiles) {
        if (!fs.existsSync(profile)) continue;
        try {
            const { execSync } = require('child_process');
            // 末尾两行固定是 PATH 与 VOLTA_HOME，前面的内容忽略（rc 文件可能有其他输出）
            const out = execSync(
                `${shell} -ic 'source "${profile}" >/dev/null 2>&1; printf "%s\\n%s" "$PATH" "$VOLTA_HOME"'`,
                { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'] }
            ).trim();
            const lines = out.split('\n');
            const userPath = (lines[lines.length - 2] || '').split(':').filter(Boolean);
            if (userPath.length <= 2) continue;
            result.path = userPath;
            result.voltaHome = (lines[lines.length - 1] || '').trim();
            break;
        } catch (_) {}
    }
    return result;
}

/**
 * 找到真正可用的 Volta 安装根目录。
 *
 * Volta 的 node/npm shim 只认 VOLTA_HOME：变量缺失时会退回 ~/.volta，
 * 若那里没装 node 就会报 "Node is not available" 并以 126 退出。
 * 这里从 PATH 中的 volta shim 目录反推安装根目录，挑第一个真的装了 node 的。
 *
 * @param {object} env - 已带 VOLTA_HOME 的环境变量
 * @param {string[]} pathDirs - 候选 PATH 目录
 * @returns {string|null}
 */
function resolveVoltaHome(env, pathDirs) {
    const candidates = [];
    if (env.VOLTA_HOME) candidates.push(env.VOLTA_HOME);
    for (const dir of pathDirs) {
        if (path.basename(dir).toLowerCase() !== 'bin') continue;
        if (fs.existsSync(path.join(path.dirname(dir), 'tools'))) candidates.push(path.dirname(dir));
    }
    candidates.push(path.join(os.homedir(), '.volta'));
    // Windows 上 Volta 默认装在 %LOCALAPPDATA%\Volta
    if (process.platform === 'win32' && process.env.LOCALAPPDATA) {
        candidates.push(path.join(process.env.LOCALAPPDATA, 'Volta'));
    }

    for (const home of candidates) {
        try {
            const versions = fs.readdirSync(path.join(home, 'tools', 'image', 'node'));
            if (versions.length > 0) return home;
        } catch (_) {}
    }
    return null;
}

/**
 * 读取 env 中的 PATH。
 * Windows 上环境变量键名大小写不固定（通常是 Path），不能直接用 env.PATH 读——
 * 展开 process.env 得到的是 Path，env.PATH 会是 undefined，导致原有 PATH 整段丢失。
 * @param {object} env
 * @returns {string}
 */
function getEnvPath(env) {
    if (process.platform !== 'win32') return env.PATH || '';
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path');
    return (key && env[key]) || '';
}

/**
 * 写入 env 的 PATH。
 * Windows 上必须复用已有的键名（Path），否则 env 里会同时存在 Path 和 PATH 两个键，
 * 系统取到哪个不确定——实测会取到新写的残缺 PATH，结果连 npm/where 都找不到。
 * @param {object} env
 * @param {string} value
 */
function setEnvPath(env, value) {
    if (process.platform !== 'win32') {
        env.PATH = value;
        return;
    }
    const key = Object.keys(env).find((k) => k.toLowerCase() === 'path') || 'Path';
    env[key] = value;
}

/**
 * 构建 spawn 环境：补 shell PATH + HOME + VOLTA_HOME
 * @returns {object}
 */
function buildShellEnv() {
    const env = { ...process.env };
    const userShell = readUserShellEnv();
    const existing = getEnvPath(env).split(path.delimiter).filter(Boolean);

    // 候选 PATH：用户 shell 的真实 PATH 优先，其次是当前进程 PATH 与常见安装位置
    const pathCandidates = [...userShell.path, ...existing];

    if (process.platform === 'win32') {
        // Windows 没有 POSIX 目录，补系统目录与常见 Node 安装位置
        // （why：从桌面/管理器启动 Electron 时 PATH 常缺 System32，连 where 都跑不起来）
        const sysRoot = env.SystemRoot || env.SYSTEMROOT || 'C:\\Windows';
        pathCandidates.push(
            path.join(sysRoot, 'System32'),
            sysRoot,
            path.join(sysRoot, 'System32', 'Wbem'),
            env.ProgramFiles ? path.join(env.ProgramFiles, 'nodejs') : 'C:\\Program Files\\nodejs',
            env.APPDATA ? path.join(env.APPDATA, 'npm') : '',
            env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'nodejs') : ''
        );
    } else {
        pathCandidates.push(
            // Homebrew
            '/usr/local/bin',
            '/opt/homebrew/bin',
            // nvm（多个 node 版本）
            path.join(os.homedir(), '.nvm', 'versions', 'node'),
            // fnm
            path.join(os.homedir(), '.fnm', 'node-versions'),
            // asdf
            path.join(os.homedir(), '.asdf', 'shims'),
            // snap
            '/snap/bin',
            // 用户 bin
            path.join(os.homedir(), '.local', 'bin'),
            // Ubuntu/Debian
            '/usr/bin',
            '/bin',
            '/usr/sbin',
            '/sbin'
        );
    }

    // Volta：PATH 里只要出现 shim，就必须保证 VOLTA_HOME 指向真正装了 node 的安装目录
    if (userShell.voltaHome) env.VOLTA_HOME = userShell.voltaHome;
    const voltaHome = resolveVoltaHome(env, pathCandidates);
    if (voltaHome) {
        env.VOLTA_HOME = voltaHome;
        pathCandidates.push(path.join(voltaHome, 'bin'));
    }
    // 探测不到时保留原有 VOLTA_HOME，不做删除，避免影响其他平台的正常配置

    setEnvPath(env, [...new Set(pathCandidates.filter(Boolean))].join(path.delimiter));
    env.HOME = env.HOME || os.homedir();
    env.LANG = env.LANG || 'en_US.UTF-8';
    return env;
}

/**
 * 预检查命令是否可执行（用 buildShellEnv 补全 PATH 后 which）
 * @param {string} command - 命令名（如 "pnpm", "npm", "node"）
 * @returns {string|null} 可执行路径或 null
 */
function preflightCheck(command) {
    try {
        const { execSync } = require('child_process');
        const env = buildShellEnv();
        const whichCmd = process.platform === 'win32' ? `where ${command}` : `which ${command}`;
        const result = execSync(whichCmd, { encoding: 'utf-8', timeout: 5000, stdio: ['ignore', 'pipe', 'ignore'], env });
        return result.split('\n')[0].trim() || null;
    } catch (_) {
        return null;
    }
}

/**
 * 逐行缓冲器：子进程 stdout/stderr 的 data 事件可能返回半行或多行，
 * 需要一个 buffer 把它们攒起来再按行切分
 */
class LineBuffer {
    constructor(onLine) {
        this.onLine = onLine;
        this.buffer = '';
    }
    push(data) {
        this.buffer += data;
        let idx;
        while ((idx = this.buffer.indexOf('\n')) !== -1) {
            const line = this.buffer.slice(0, idx);
            this.buffer = this.buffer.slice(idx + 1);
            this.onLine(line);
        }
    }
    flush() {
        if (this.buffer.length > 0) {
            this.onLine(this.buffer);
            this.buffer = '';
        }
    }
}

/**
 * 流水线步骤定义
 */
const STEP_INSTALL = 1;
const STEP_BUILD = 2;
const STEP_DIST = 3;
const STEP_ZIP = 4;

/**
 * 执行完整构建流水线
 * @param {string} sourceDir - APP 源码目录
 * @param {object} [options]
 * @param {boolean} [options.skipInstall] - 跳过 install（已有 node_modules）
 * @param {object} [options.callbacks]
 * @param {(payload: {step: number, name: string}) => void} [options.callbacks.onStepStart] - 步骤开始
 * @param {(payload: {step: number, name: string, duration: number}) => void} [options.callbacks.onStepEnd] - 步骤结束
 * @param {(payload: {text: string, stream: 'stdout'|'stderr'}) => void} [options.callbacks.onLog] - 单行日志
 * @param {(payload: {success: boolean, zipPath?: string, resourcesDir?: string, error?: string, step?: number, logs: string[], duration: number}) => void} [options.callbacks.onDone] - 流水线结束
 * @returns {{ stop: () => void, taskId: string }} stop 函数（杀子进程）和任务 ID
 */
function runPipeline(sourceDir, options = {}) {
    const { callbacks = {}, skipInstall = false, taskId: externalTaskId } = options;
    const allLogs = [];
    let stopped = false;
    let child = null;
    let currentStep = 0;
    const taskId = externalTaskId || `pipeline-${path.basename(sourceDir)}-${Date.now()}`;
    const pipelineStart = Date.now();

    // 逐行日志缓冲器，统一走 onLog 回调
    const lineBuffer = new LineBuffer((text) => {
        const entry = { text, stream: bufferStream };
        allLogs.push(entry);
        if (typeof callbacks.onLog === 'function') callbacks.onLog(entry);
    });
    let bufferStream = 'stdout';

    function emitLog(text, stream) {
        const entry = { text, stream: stream || 'stdout' };
        allLogs.push(entry);
        if (typeof callbacks.onLog === 'function') callbacks.onLog(entry);
    }

    function emitStepStart(step, name) {
        currentStep = step;
        emitLog(`[pipeline] ▶ 步骤 ${step}: ${name}`, 'stdout');
        if (typeof callbacks.onStepStart === 'function') callbacks.onStepStart({ step, name });
    }

    function emitStepEnd(step, name, duration) {
        emitLog(`[pipeline] ✓ 步骤 ${step}: ${name} 完成 (${(duration / 1000).toFixed(1)}s)`, 'stdout');
        if (typeof callbacks.onStepEnd === 'function') callbacks.onStepEnd({ step, name, duration });
    }

    function emitError(text) {
        emitLog(`[pipeline] ✗ ${text}`, 'stderr');
    }

    function stop() {
        stopped = true;
        if (child && !child.killed) {
            try { child.kill('SIGTERM'); } catch (_) {}
            // 3 秒后强制 kill
            setTimeout(() => {
                if (child && !child.killed) {
                    try { child.kill('SIGKILL'); } catch (_) {}
                    // Windows: taskkill /F /T
                    if (process.platform === 'win32') {
                        try {
                            const { execSync } = require('child_process');
                            execSync(`taskkill /F /T /PID ${child.pid}`, { stdio: 'ignore' });
                        } catch (_) {}
                    }
                }
            }, 3000);
        }
        const totalDuration = Date.now() - pipelineStart;
        emitLog(`[pipeline] ⏹ 用户停止流水线 (总耗时 ${(totalDuration / 1000).toFixed(1)}s)`, 'stderr');
        if (typeof callbacks.onDone === 'function') {
            callbacks.onDone({ success: false, stopped: true, logs: allLogs, duration: totalDuration });
        }
    }

    /**
     * 执行单个 shell 命令，返回 Promise<exitCode>
     */
    function runCommand(cmd, stepName) {
        return new Promise((resolve, reject) => {
            // 命令预检查：从 cmd 里提取主命令名（第一个空格前的部分）
            const mainCmd = cmd.split(/\s+/)[0];
            const whichResult = preflightCheck(mainCmd);
            if (!whichResult) {
                reject(new Error(`命令不可用: ${mainCmd}（PATH 中找不到该可执行文件）。完整 PATH=${buildShellEnv().PATH}`));
                return;
            }
            emitLog(`[pipeline] $ ${cmd}`, 'stdout');
            emitLog(`[pipeline] 命令路径: ${whichResult}`, 'stdout');
            emitLog(`[pipeline] cwd: ${sourceDir}`, 'stdout');

            child = spawn(cmd, [], {
                cwd: sourceDir,
                env: buildShellEnv(),
                shell: true,
                stdio: ['ignore', 'pipe', 'pipe'],
            });

            child.stdout.on('data', (data) => {
                bufferStream = 'stdout';
                lineBuffer.push(data.toString());
            });
            child.stderr.on('data', (data) => {
                bufferStream = 'stderr';
                lineBuffer.push(data.toString());
            });
            child.on('error', (err) => {
                lineBuffer.flush();
                reject(new Error(`spawn 失败: ${err.message}`));
            });
            child.on('exit', (code, signal) => {
                lineBuffer.flush();
                const reason = signal ? `signal=${signal}` : `code=${code}`;
                emitLog(`[pipeline] 命令退出 (${reason})`, 'stdout');
                if (signal === 'SIGTERM' || signal === 'SIGKILL') {
                    // 被 stop() 杀掉
                    reject(new Error('STOPPED'));
                } else if (code !== 0) {
                    if (code === 126) {
                        // 典型场景：命令存在但无法执行——Volta shim 找不到 node 时会以 126 退出
                        emitLog(
                            '[pipeline] 提示：命令存在但无法执行。若使用 Volta，请确认 VOLTA_HOME 指向已安装 node 的 Volta 目录'
                            + `（当前 VOLTA_HOME=${buildShellEnv().VOLTA_HOME || '(未设置)'}），或先执行 volta install node。`,
                            'stderr'
                        );
                    }
                    reject(new Error(`退出码 ${code}`));
                } else {
                    resolve();
                }
            });
        });
    }

    /**
     * 主流水线：async 串行执行各步骤
     */
    (async () => {
        try {
            // ===== Step 0: 探测配置 =====
            emitLog('[pipeline] 开始探测项目配置...', 'stdout');
            const config = detectPipelineConfig(sourceDir);
            if (!config.success) {
                emitError(`配置探测失败: ${config.error}`);
                finish(false, null, config.error, currentStep);
                return;
            }
            emitLog(`[pipeline] 包管理器: ${config.packageManager}`, 'stdout');
            emitLog(`[pipeline] 前端构建脚本: ${config.buildScript || '(无，跳过)'}`, 'stdout');
            emitLog(`[pipeline] Electron 打包脚本: ${config.distScript || '(未找到)'}`);

            if (!config.distScript) {
                emitError('未找到 Electron 打包脚本（dist / package / make 等），无法自动构建');
                emitError('建议：手动执行 npm run dist，然后使用「仅打包」模式');
                finish(false, null, '未找到 Electron 打包脚本', currentStep);
                return;
            }

            // ===== Step 1: install =====
            const needInstall = !skipInstall && config.needInstall;
            if (needInstall) {
                emitStepStart(STEP_INSTALL, '安装依赖');
                const cmd = buildCommand(config.packageManager, null, true);
                const stepStart = Date.now();
                await runCommand(cmd, 'install');
                emitStepEnd(STEP_INSTALL, '安装依赖', Date.now() - stepStart);
            } else if (!skipInstall && config.packageManager === 'pnpm' && !fs.existsSync(path.join(sourceDir, 'node_modules'))) {
                // pnpm 需要显式 install，即使有 node_modules 也要确认
                emitStepStart(STEP_INSTALL, '安装依赖');
                const cmd = buildCommand(config.packageManager, null, true);
                const stepStart = Date.now();
                await runCommand(cmd, 'install');
                emitStepEnd(STEP_INSTALL, '安装依赖', Date.now() - stepStart);
            } else {
                emitLog('[pipeline] 已有 node_modules，跳过 install', 'stdout');
            }

            // ===== Step 2: build（可选）=====
            if (config.buildScript) {
                emitStepStart(STEP_BUILD, '前端构建');
                const cmd = buildCommand(config.packageManager, config.buildScript, false);
                const stepStart = Date.now();
                await runCommand(cmd, 'build');
                emitStepEnd(STEP_BUILD, '前端构建', Date.now() - stepStart);
            } else {
                emitLog('[pipeline] 无前端构建脚本，跳过', 'stdout');
            }

            // ===== Step 3: dist =====
            emitStepStart(STEP_DIST, 'Electron 打包');
            const cmd = buildCommand(config.packageManager, config.distScript, false);
            const stepStart = Date.now();
            await runCommand(cmd, 'dist');
            emitStepEnd(STEP_DIST, 'Electron 打包', Date.now() - stepStart);

            // ===== Step 4: 自动探测产物目录 =====
            emitLog('[pipeline] 探测 app.asar 位置...', 'stdout');
            const found = findResourcesDir(sourceDir);
            if (!found) {
                emitError('未在常见路径下找到 app.asar');
                emitError('可能的产物路径：dist/、out/、build/');
                finish(false, null, '未找到 app.asar', STEP_DIST);
                return;
            }
            emitLog(`[pipeline] 找到产物目录: ${found.resourcesDir}`, 'stdout');

            if (found.platformMismatch) {
                emitLog(
                    `[pipeline] ⚠ 未找到当前平台（${process.platform}）的构建产物，退而使用其它平台产物：${found.resourcesDir}`,
                    'stderr'
                );
            }

            // 新鲜度校验：产物必须是本次 dist 步骤产出的，
            // 否则说明打包脚本把产物写到了别处，或实际执行了其它平台的打包命令
            const builtAsarPath = path.join(found.resourcesDir, 'app.asar');
            if (fs.existsSync(builtAsarPath)) {
                const asarMtime = fs.statSync(builtAsarPath).mtimeMs;
                emitLog(`[pipeline] app.asar 时间: ${new Date(asarMtime).toLocaleString()}`, 'stdout');
                if (asarMtime < stepStart) {
                    emitError('找到的 app.asar 早于本次构建开始时间，不是本次构建的产物');
                    emitError(`产物路径：${builtAsarPath}`);
                    emitError('常见原因：dist 脚本产出到其它目录；或实际执行的是其它平台的打包命令（如 --linux dir）。');
                    emitError('请检查 package.json 的 dist 脚本，Windows 下应使用 electron-builder --win dir。');
                    finish(false, null, '构建产物不是本次构建生成（app.asar 时间戳过旧）', STEP_DIST);
                    return;
                }
            }

            // ===== Step 5: packCanboxZip =====
            emitStepStart(STEP_ZIP, '打包 zip');
            const zipStart = Date.now();
            const zipResult = packCanboxZip(sourceDir, found.resourcesDir);
            emitStepEnd(STEP_ZIP, '打包 zip', Date.now() - zipStart);

            if (!zipResult.success) {
                finish(false, null, zipResult.error || 'zip 打包失败', STEP_ZIP);
                return;
            }

            const totalDuration = Date.now() - pipelineStart;
            emitLog(`[pipeline] ✓✓ 全部完成！zip: ${zipResult.path}`, 'stdout');
            emitLog(`[pipeline] 总耗时: ${(totalDuration / 1000).toFixed(1)}s`, 'stdout');
            finish(true, zipResult.path, null, null);

        } catch (err) {
            if (stopped || (err && err.message === 'STOPPED')) {
                // 已在 stop() 里处理
                return;
            }
            const msg = err && err.stack ? err.stack : String(err);
            emitError(`步骤 ${currentStep} 失败: ${msg}`);
            finish(false, null, err.message || String(err), currentStep);
        }
    })();

    function finish(success, zipPath, error, step) {
        const duration = Date.now() - pipelineStart;
        if (typeof callbacks.onDone === 'function') {
            callbacks.onDone({ success, zipPath, error, step, logs: allLogs, duration });
        }
    }

    return { stop, taskId };
}

module.exports = { packCanboxZip, detectPipelineConfig, findResourcesDir, runPipeline };
