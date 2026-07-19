import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router/router';
import i18n from './i18n';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);
app.use(router);
app.use(i18n);

// 应用持久化的 locale
// 以主进程 store 为权威源（localStorage 仅作同步快速缓存，可能与 store 不同步）
// 先用 localStorage 做同步快速应用，再异步从主进程 store 纠正后挂载，避免首帧语言错误
try {
    const cachedLocale = localStorage.getItem('canbox.locale');
    if (cachedLocale === 'zh-CN' || cachedLocale === 'en-US') {
        i18n.global.locale.value = cachedLocale;
    }
} catch (e) {
    console.warn('[i18n] Failed to read cached locale:', e);
}

// 先挂载，避免 IPC 往返阻塞首帧（locale 由 localStorage 同步快速应用，
// 主进程 store 作为权威源在挂载后异步纠正）
app.mount('#app');

// 移除首屏 loading 动画（Vue 挂载后实际内容已渲染）
const _loading = document.getElementById('app-loading');
if (_loading) {
    _loading.classList.add('hide');
    setTimeout(() => _loading.remove(), 200);
}

// 挂载后异步从主进程 store 纠正 locale
window.api.developer.settingsGet('language').then(savedLang => {
    if (savedLang === 'zh-CN' || savedLang === 'en-US') {
        if (savedLang !== i18n.global.locale.value) {
            i18n.global.locale.value = savedLang;
        }
        try { localStorage.setItem('canbox.locale', savedLang); } catch (e) {}
    }
}).catch(e => {
    console.warn('[i18n] Failed to read language from store:', e);
});

// ====== 缩放快捷键（Ctrl+滚轮 / Ctrl++ / Ctrl+- / Ctrl+0） ======
let currentZoom = 1.0;

window.api.developer.zoomGet().then(result => {
    if (result.success) currentZoom = result.factor;
}).catch(() => {});

function adjustZoom(delta) {
    let newZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta));
    newZoom = Math.round(newZoom * 10) / 10;
    if (newZoom !== currentZoom) {
        currentZoom = newZoom;
        window.api.developer.zoomSet(currentZoom);
    }
}

document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        adjustZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        adjustZoom(0.1);
    } else if (e.key === '-' || e.key === '_') {
        e.preventDefault();
        adjustZoom(-0.1);
    } else if (e.key === '0') {
        e.preventDefault();
        currentZoom = 1.0;
        window.api.developer.zoomReset();
    }
});

// 主进程推送的 zoom 变化（如设置页调节后同步）
window.api.developer.onZoomChanged((factor) => {
    currentZoom = factor;
});
