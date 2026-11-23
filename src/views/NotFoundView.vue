<script setup>
import { RouterLink } from 'vue-router'
</script>

<template>
  <section class="flex flex-col items-center justify-center py-20 text-center">
    <span class="text-6xl font-extrabold text-amber-500">404</span>
    <h1 class="mt-4 text-2xl font-bold text-white">Page Not Found</h1>
    <p class="mt-2 max-w-md text-sm text-slate-400">
      Halaman atau ID filem yang anda cari tidak wujud atau tidak sah.
    </p>
    <RouterLink
      to="/"
      class="mt-6 inline-flex items-center rounded-lg bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 transition hover:bg-amber-400"
    >
      Kembali ke Laman Utama
    </RouterLink>
  </section>
</template>
