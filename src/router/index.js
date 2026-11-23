import { createRouter, createWebHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'
import MovieDetailView from '@/views/MovieDetailView.vue'
import FavoritesView from '@/views/FavoritesView.vue'
import NotFoundView from '@/views/NotFoundView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView,
    meta: { title: 'Discover Movies — CineVault' },
  },
  {
    path: '/movie/:id',
    name: 'movie-detail',
    component: MovieDetailView,
    props: true,
    meta: { title: 'Movie Details — CineVault' },
    beforeEnter: (to) => {
      const idParam = String(to.params.id || '')
      const isPositiveInteger = /^[1-9]\d*$/.test(idParam)

      if (!isPositiveInteger) {
        return {
          name: 'not-found',
          params: { pathMatch: to.path.substring(1).split('/') },
          query: to.query,
          hash: to.hash,
        }
      }
      return true
    },
  },
  {
    path: '/favorites',
    name: 'favorites',
    component: FavoritesView,
    meta: { title: 'My Favorites — CineVault' },
  },
  {
    path: '/:pathMatch(.*)*',
    name: 'not-found',
    component: NotFoundView,
    meta: { title: '404 Not Found — CineVault' },
  },
]

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior(to, from, savedPosition) {
    if (savedPosition) {
      return savedPosition
    }
    return { top: 0 }
  },
})

router.afterEach((to) => {
  document.title = to.meta?.title || 'CineVault — Movie Catalog'
})

export default router
