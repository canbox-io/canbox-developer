import { createRouter, createWebHashHistory } from 'vue-router';

const router = createRouter({
    routes: [
        {
            path: '/',
            name: 'projects',
            component: () => import('../views/ProjectsView.vue')
        }
    ],
    history: createWebHashHistory()
});

export default router;
