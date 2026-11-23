<script setup>
defineProps({
  id: {
    type: [String, Number],
    required: true,
  },
})
// Implementasi penuh pada Fasa 3
</script>

<template>
  <section class="space-y-4">
    <h1 class="text-2xl font-bold text-white">Movie Detail (ID: {{ id }})</h1>
    <p class="text-slate-400 text-sm">Fasa 1: Rangka paparan butiran filem berjaya dimuatkan.</p>
  </section>
</template>
