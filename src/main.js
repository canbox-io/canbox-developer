import { createApp } from 'vue';
import { createPinia } from 'pinia';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
import App from './App.vue';
import router from './router/router';

const app = createApp(App);
app.use(createPinia());
app.use(ElementPlus);
app.use(router);
app.mount('#app');

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
