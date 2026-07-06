import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
    routes: [
        {
            path: '/',
            name: 'projects',
            component: () => import('../views/ProjectsView.vue')
        },
        {
            path: '/settings',
            name: 'settings',
            component: () => import('../views/SettingsView.vue')
        }
    ],
    history: createWebHashHistory()
});

export default router;
