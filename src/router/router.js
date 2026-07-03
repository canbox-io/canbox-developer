import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
    routes: [
        {
            path: '/',
            name: 'projects',
            component: () => import('../views/ProjectsView.vue')
        },
        {
            path: '/scaffold',
            name: 'scaffold',
            component: () => import('../views/ScaffoldView.vue')
        }
    ],
    history: createWebHashHistory()
});

export default router;
