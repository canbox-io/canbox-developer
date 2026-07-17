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
 *   └── logo.png
 *
 * 依赖：adm-zip
 */

const fs = require('fs');
const path = require('path');

/**
 * 按 canbox 标准结构打包 zip
 * @param {string} sourceDir - APP 源码目录（读取 package.json 和 logo）
 * @param {string} resourcesDir - electron-builder 构建产物目录（含 app.asar）
 * @param {string} [outDir] - zip 输出目录，默认源码目录同级
 * @returns {{success: boolean, path?: string, error?: string}}
 */
function packCanboxZip(sourceDir, resourcesDir, outDir) {
    // 检查 app.asar 存在
    const asarPath = path.join(resourcesDir, 'app.asar');
    if (!fs.existsSync(asarPath)) {
        return { success: false, error: '所选目录中未找到 app.asar，请选择包含 app.asar 的目录' };
    }

    // 检查 app.asar.unpacked 是否存在（判断有无原生模块）
    const unpackedPath = path.join(resourcesDir, 'app.asar.unpacked');
    const hasUnpacked = fs.existsSync(unpackedPath);

    // 从源码目录读 package.json
    const pkgPath = path.join(sourceDir, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { success: false, error: '源码目录中未找到 package.json' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const appIdentifier = pkg.id || pkg.name;
    const version = pkg.version || '0.0.0';

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
    const outputDir = outDir || path.dirname(sourceDir);
    const zipPath = path.join(outputDir, zipName);

    // 确保输出目录存在
    if (!fs.existsSync(outputDir)) {
        fs.mkdirSync(outputDir, { recursive: true });
    }

    // 禁用 Electron asar 补丁，否则 adm-zip 的 addLocalFile 会把 app.asar 当目录处理
    // （statSync 返回 isDirectory=true，readFileSync 读不到真实内容），生成的 zip 里
    // app.asar 会变成空目录 entry，APP 内容丢失
    const prevNoAsar = process.noAsar;
    process.noAsar = true;
    try {
        const AdmZip = require('adm-zip');
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

        // 4. logo（从源码目录自动探测，保留相对路径以匹配 package.json 声明）
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

module.exports = { packCanboxZip };
