<script setup>
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import axios from 'axios'

// ============================================================================
// 1. KONFIGURASI API & STORAGE
// ============================================================================
const TMDB_BASE_URL = 'https://api.themoviedb.org/3'
const TMDB_IMAGE_BASE = 'https://image.tmdb.org/t/p'
const FAVORITES_STORAGE_KEY = 'vue_movie_catalog_favorites_v1'
const READ_TOKEN = import.meta.env.VITE_TMDB_READ_TOKEN

const apiClient = axios.create({
  baseURL: TMDB_BASE_URL,
  timeout: 10000,
  headers: {
    accept: 'application/json',
    Authorization: READ_TOKEN ? `Bearer ${READ_TOKEN}` : '',
  },
})

// ============================================================================
// 2. STATE UTAMA APLIKASI (Pengganti Pinia & Router)
// ============================================================================
// Navigasi Halaman: 'home' | 'detail' | 'favorites'
const currentView = ref('home')
const selectedMovieId = ref(null)

// State Senarai Filem & Carian
const popularMovies = ref([])
const searchResults = ref([])
const searchQuery = ref('')
const debouncedQuery = ref('')

// State Butiran Filem
const movieDetail = ref(null)

// State Loading & Error
const isLoading = ref(false)
const isDetailLoading = ref(false)
const errorMessage = ref('')

// State Kegemaran (Favorites)
const favorites = ref([])

// ============================================================================
// 3. FUNGSI PEMBANTU (Formatters, Normalizers & LocalStorage)
// ============================================================================
function getImageUrl(path, size = 'w500') {
  if (!path) return null
  return `${TMDB_IMAGE_BASE}/${size}${path}`
}

function formatYear(dateStr) {
  if (!dateStr) return 'N/A'
  return dateStr.split('-')[0] || 'N/A'
}

function formatRuntime(minutes) {
  if (!minutes || minutes <= 0) return 'N/A'
  const hrs = Math.floor(minutes / 60)
  const mins = minutes % 60
  return hrs > 0 ? `${hrs}j ${mins}m` : `${mins}m`
}

function formatRating(vote) {
  if (typeof vote !== 'number' || vote === 0) return 'NR'
  return vote.toFixed(1)
}

// Menukar data snake_case dari TMDB ke camelCase yang kemas
function normalizeMovie(raw) {
  return {
    id: raw.id,
    title: raw.title || raw.original_title || 'Untitled Movie',
    overview: raw.overview || 'Tiada sinopsis tersedia untuk filem ini.',
    posterPath: raw.poster_path || null,
    backdropPath: raw.backdrop_path || null,
    releaseDate: raw.release_date || '',
    voteAverage: typeof raw.vote_average === 'number' ? raw.vote_average : 0,
    voteCount: raw.vote_count || 0,
  }
}

function normalizeMovieDetail(raw) {
  const base = normalizeMovie(raw)
  const castList = Array.isArray(raw.credits?.cast)
    ? raw.credits.cast.slice(0, 10).map((person) => ({
        id: person.id,
        name: person.name,
        character: person.character || 'Pelakon',
        profilePath: person.profile_path || null,
      }))
    : []

  return {
    ...base,
    tagline: raw.tagline || '',
    runtime: raw.runtime || 0,
    genres: Array.isArray(raw.genres) ? raw.genres.map((g) => g.name) : [],
    status: raw.status || 'Released',
    cast: castList,
  }
}

// Pengurusan LocalStorage dengan try/catch selamat
function loadFavoritesFromStorage() {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (err) {
    console.warn('Gagal membaca localStorage:', err)
    return []
  }
}

function saveFavoritesToStorage(list) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(list))
  } catch (err) {
    console.warn('Gagal menyimpan ke localStorage:', err)
  }
}

// ============================================================================
// 4. LOGIK KEGEMARAN (O(1) Set Lookup)
// ============================================================================
const favoriteIdsSet = computed(() => new Set(favorites.value.map((m) => m.id)))

function isFavorite(movieId) {
  return favoriteIdsSet.value.has(movieId)
}

function toggleFavorite(movie) {
  if (!movie || !movie.id) return

  if (isFavorite(movie.id)) {
    favorites.value = favorites.value.filter((item) => item.id !== movie.id)
  } else {
    // Simpan snapshot ringan sahaja
    const snapshot = {
      id: movie.id,
      title: movie.title,
      posterPath: movie.posterPath,
      releaseDate: movie.releaseDate,
      voteAverage: movie.voteAverage,
    }
    favorites.value = [snapshot, ...favorites.value]
  }
  saveFavoritesToStorage(favorites.value)
}

// ============================================================================
// 5. PANGGILAN API TMDB
// ============================================================================
function extractApiError(err) {
  if (!READ_TOKEN) {
    return 'Token API TMDB (VITE_TMDB_READ_TOKEN) tidak ditemui dalam fail .env anda.'
  }
  if (err.response) {
    if (err.response.status === 401) {
      return 'Pengesahan gagal (401): Sila semak semula VITE_TMDB_READ_TOKEN anda.'
    }
    if (err.response.status === 404) {
      return 'Data filem tidak dijumpai (404).'
    }
    return `Ralat pelayan TMDB (${err.response.status}). Sila cuba sebentar lagi.`
  }
  if (err.request) {
    return 'Tiada sambungan internet atau pelayan TMDB tidak membalas.'
  }
  return 'Berlaku ralat yang tidak dijangka.'
}

async function fetchPopularMovies() {
  if (popularMovies.value.length > 0) return // Guna cache jika sudah ada
  isLoading.value = true
  errorMessage.value = ''

  try {
    const { data } = await apiClient.get('/movie/popular', {
      params: { language: 'en-US', page: 1 },
    })
    popularMovies.value = (data.results || []).map(normalizeMovie)
  } catch (err) {
    errorMessage.value = extractApiError(err)
  } finally {
    isLoading.value = false
  }
}

async function searchMovies(query) {
  const trimmed = query.trim()
  if (!trimmed) {
    searchResults.value = []
    errorMessage.value = ''
    return
  }

  isLoading.value = true
  errorMessage.value = ''

  try {
    const { data } = await apiClient.get('/search/movie', {
      params: {
        query: trimmed,
        include_adult: false,
        language: 'en-US',
        page: 1,
      },
    })
    searchResults.value = (data.results || []).map(normalizeMovie)
  } catch (err) {
    errorMessage.value = extractApiError(err)
  } finally {
    isLoading.value = false
  }
}

async function fetchMovieDetail(id) {
  isDetailLoading.value = true
  errorMessage.value = ''
  movieDetail.value = null

  try {
    const { data } = await apiClient.get(`/movie/${id}`, {
      params: {
        append_to_response: 'credits',
        language: 'en-US',
      },
    })
    movieDetail.value = normalizeMovieDetail(data)
  } catch (err) {
    errorMessage.value = extractApiError(err)
  } finally {
    isDetailLoading.value = false
  }
}

// ============================================================================
// 6. DEBOUNCE CARIAN (400ms) & COMPUTED LIST
// ============================================================================
let debounceTimer = null

watch(searchQuery, (newVal) => {
  clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debouncedQuery.value = newVal
    searchMovies(newVal)
  }, 400)
})

const isSearching = computed(() => debouncedQuery.value.trim().length > 0)

const displayedMovies = computed(() => {
  return isSearching.value ? searchResults.value : popularMovies.value
})

function clearSearch() {
  searchQuery.value = ''
  debouncedQuery.value = ''
  searchResults.value = []
  errorMessage.value = ''
}

// ============================================================================
// 7. NAVIGASI ANTARA PAPARAN (Views)
// ============================================================================
function goHome() {
  currentView.value = 'home'
  selectedMovieId.value = null
  errorMessage.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function goFavorites() {
  currentView.value = 'favorites'
  selectedMovieId.value = null
  errorMessage.value = ''
  window.scrollTo({ top: 0, behavior: 'smooth' })
}

function openMovieDetail(movieId) {
  const numericId = Number(movieId)
  if (!Number.isInteger(numericId) || numericId <= 0) return

  selectedMovieId.value = numericId
  currentView.value = 'detail'
  window.scrollTo({ top: 0, behavior: 'smooth' })
  fetchMovieDetail(numericId)
}

function retryCurrentAction() {
  if (currentView.value === 'detail' && selectedMovieId.value) {
    fetchMovieDetail(selectedMovieId.value)
  } else if (isSearching.value) {
    searchMovies(debouncedQuery.value)
  } else {
    popularMovies.value = []
    fetchPopularMovies()
  }
}

// ============================================================================
// 8. LIFECYCLE HOOKS
// ============================================================================
onMounted(() => {
  favorites.value = loadFavoritesFromStorage()
  fetchPopularMovies()
})

onUnmounted(() => {
  clearTimeout(debounceTimer)
})
</script>

<template>
  <div class="min-h-screen flex flex-col bg-slate-950 text-slate-100">
    <!-- ==================== NAVBAR ==================== -->
    <header class="sticky top-0 z-40 border-b border-slate-800/80 bg-slate-950/90 backdrop-blur-md">
      <div class="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
        <!-- Logo -->
        <button
          type="button"
          @click="goHome"
          class="flex items-center gap-2.5 text-left group focus:outline-none"
        >
          <span
            class="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-500 text-slate-950 font-black text-lg shadow-md shadow-amber-500/20 group-hover:bg-amber-400 transition"
          >
            C
          </span>
          <span class="text-xl font-bold tracking-tight text-white">
            Cine<span class="text-amber-500">Vault</span>
          </span>
        </button>

        <!-- Pautan Navigasi -->
        <nav class="flex items-center gap-2 sm:gap-4">
          <button
            type="button"
            @click="goHome"
            :class="[
              'px-3.5 py-2 rounded-lg text-sm font-medium transition',
              currentView === 'home'
                ? 'bg-slate-800 text-amber-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-900',
            ]"
          >
            Terokai
          </button>

          <button
            type="button"
            @click="goFavorites"
            :class="[
              'inline-flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition',
              currentView === 'favorites'
                ? 'bg-slate-800 text-amber-400'
                : 'text-slate-300 hover:text-white hover:bg-slate-900',
            ]"
          >
            <span>Kegemaran</span>
            <span
              class="inline-flex items-center justify-center min-w-[1.35rem] h-5 px-1.5 text-xs font-bold rounded-full bg-amber-500 text-slate-950"
            >
              {{ favorites.length }}
            </span>
          </button>
        </nav>
      </div>
    </header>

    <!-- ==================== KANDUNGAN UTAMA ==================== -->
    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <!-- BANNER RALAT (Jika ada) -->
      <div
        v-if="errorMessage"
        class="mb-6 rounded-xl border border-rose-500/30 bg-rose-950/40 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
      >
        <div class="flex items-start gap-3">
          <span class="text-rose-400 text-lg font-bold">!</span>
          <p class="text-sm text-rose-200">{{ errorMessage }}</p>
        </div>
        <button
          type="button"
          @click="retryCurrentAction"
          class="self-start sm:self-auto shrink-0 rounded-lg bg-rose-500/20 border border-rose-500/40 px-3.5 py-1.5 text-xs font-semibold text-rose-200 hover:bg-rose-500/30 transition"
        >
          Cuba Lagi
        </button>
      </div>

      <!-- ======================================================== -->
      <!-- PAPARAN 1: LAMAN UTAMA (POPULAR & CARIAN)                -->
      <!-- ======================================================== -->
      <section v-if="currentView === 'home'" class="space-y-8">
        <!-- Bar Carian & Tajuk -->
        <div class="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold text-white tracking-tight">
              {{ isSearching ? `Hasil Carian: "${debouncedQuery}"` : 'Filem Popular Minggu Ini' }}
            </h1>
            <p class="mt-1 text-sm text-slate-400">
              {{
                isSearching
                  ? `Menjumpai ${displayedMovies.length} filem berkaitan`
                  : 'Senarai filem paling trending daripada pangkalan data TMDB'
              }}
            </p>
          </div>

          <!-- Input Carian -->
          <div class="relative w-full md:w-96">
            <input
              v-model="searchQuery"
              type="text"
              placeholder="Cari tajuk filem (cth: Interstellar, Dune)..."
              class="w-full rounded-xl border border-slate-800 bg-slate-900/90 pl-4 pr-10 py-2.5 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none focus:ring-2 focus:ring-amber-500/20 transition"
            />
            <button
              v-if="searchQuery"
              type="button"
              @click="clearSearch"
              aria-label="Padam carian"
              class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white text-sm font-bold"
            >
              ✕
            </button>
          </div>
        </div>

        <!-- Keadaan Loading -->
        <div v-if="isLoading" class="flex flex-col items-center justify-center py-24">
          <div
            class="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-amber-500"
          ></div>
          <p class="mt-4 text-sm text-slate-400">Memuatkan katalog filem...</p>
        </div>

        <!-- Keadaan Kosong (Tiada Hasil) -->
        <div
          v-else-if="!errorMessage && displayedMovies.length === 0"
          class="rounded-2xl border border-slate-800/80 bg-slate-900/40 py-16 px-4 text-center"
        >
          <p class="text-lg font-semibold text-slate-200">Tiada filem ditemui</p>
          <p class="mt-1 text-sm text-slate-400">
            Cuba kata kunci carian yang lain atau kembali ke senarai filem popular.
          </p>
          <button
            v-if="isSearching"
            type="button"
            @click="clearSearch"
            class="mt-5 rounded-lg bg-amber-500 px-4 py-2 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition"
          >
            Reset Carian
          </button>
        </div>

        <!-- Grid Kad Filem -->
        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6"
        >
          <article
            v-for="movie in displayedMovies"
            :key="movie.id"
            class="group relative flex flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 transition duration-300 hover:-translate-y-1 hover:border-slate-700 hover:shadow-xl hover:shadow-black/50"
          >
            <!-- Poster -->
            <div
              @click="openMovieDetail(movie.id)"
              class="relative aspect-[2/3] w-full cursor-pointer overflow-hidden bg-slate-800"
            >
              <img
                v-if="movie.posterPath"
                :src="getImageUrl(movie.posterPath, 'w500')"
                :alt="movie.title"
                loading="lazy"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <!-- Fallback Jika Tiada Poster -->
              <div
                v-else
                class="flex h-full w-full flex-col items-center justify-center p-4 text-center text-slate-500"
              >
                <span class="text-3xl mb-2">🎬</span>
                <span class="text-xs font-medium">Tiada Poster</span>
              </div>

              <!-- Lencana Rating -->
              <div
                class="absolute top-2.5 left-2.5 rounded-md bg-slate-950/85 px-2 py-1 text-xs font-bold text-amber-400 backdrop-blur-sm border border-slate-800"
              >
                ★ {{ formatRating(movie.voteAverage) }}
              </div>
            </div>

            <!-- Butang Kegemaran (Atas Kanan) -->
            <button
              type="button"
              @click.stop="toggleFavorite(movie)"
              :title="isFavorite(movie.id) ? 'Buang dari Kegemaran' : 'Tambah ke Kegemaran'"
              :class="[
                'absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full backdrop-blur-md transition border',
                isFavorite(movie.id)
                  ? 'bg-rose-500 border-rose-400 text-white shadow-md'
                  : 'bg-slate-950/75 border-slate-700 text-slate-300 hover:text-rose-400 hover:border-rose-400/50',
              ]"
            >
              <span class="text-sm leading-none">{{ isFavorite(movie.id) ? '♥' : '♡' }}</span>
            </button>

            <!-- Info Bawah Kad -->
            <div class="flex flex-1 flex-col justify-between p-3.5">
              <h2
                @click="openMovieDetail(movie.id)"
                class="cursor-pointer text-sm font-semibold text-slate-100 line-clamp-2 group-hover:text-amber-400 transition"
              >
                {{ movie.title }}
              </h2>
              <p class="mt-2 text-xs text-slate-400">
                {{ formatYear(movie.releaseDate) }}
              </p>
            </div>
          </article>
        </div>
      </section>

      <!-- ======================================================== -->
      <!-- PAPARAN 2: BUTIRAN FILEM & 10 PELAKON UTAMA              -->
      <!-- ======================================================== -->
      <section v-else-if="currentView === 'detail'" class="space-y-8">
        <button
          type="button"
          @click="goHome"
          class="inline-flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900 px-3.5 py-2 text-sm font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition"
        >
          ← Kembali ke Senarai
        </button>

        <!-- Loading Butiran -->
        <div v-if="isDetailLoading" class="flex flex-col items-center justify-center py-24">
          <div
            class="h-10 w-10 animate-spin rounded-full border-4 border-slate-800 border-t-amber-500"
          ></div>
          <p class="mt-4 text-sm text-slate-400">Memuatkan maklumat terperinci filem...</p>
        </div>

        <!-- Kandungan Butiran Filem -->
        <div v-else-if="movieDetail" class="space-y-10">
          <!-- Kad Hero Butiran -->
          <div class="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/70">
            <!-- Latar Belakang Kabur (Backdrop) -->
            <div
              v-if="movieDetail.backdropPath"
              class="absolute inset-0 opacity-20 pointer-events-none"
            >
              <img
                :src="getImageUrl(movieDetail.backdropPath, 'w1280')"
                alt=""
                class="h-full w-full object-cover"
              />
              <div
                class="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-transparent"
              ></div>
            </div>

            <div class="relative z-10 flex flex-col md:flex-row gap-6 sm:gap-8 p-6 sm:p-8">
              <!-- Poster Besar -->
              <div
                class="w-48 sm:w-60 shrink-0 mx-auto md:mx-0 overflow-hidden rounded-xl border border-slate-700/80 bg-slate-800 shadow-2xl"
              >
                <img
                  v-if="movieDetail.posterPath"
                  :src="getImageUrl(movieDetail.posterPath, 'w500')"
                  :alt="movieDetail.title"
                  class="w-full h-auto object-cover"
                />
                <div
                  v-else
                  class="aspect-[2/3] flex flex-col items-center justify-center p-4 text-center text-slate-500"
                >
                  <span class="text-4xl mb-2">🎬</span>
                  <span class="text-xs">Tiada Poster</span>
                </div>
              </div>

              <!-- Maklumat Teks -->
              <div class="flex-1 space-y-4">
                <div>
                  <div
                    class="flex flex-wrap items-center gap-2 text-xs font-medium text-amber-400 mb-2"
                  >
                    <span class="rounded bg-amber-500/10 border border-amber-500/30 px-2.5 py-0.5">
                      ★ {{ formatRating(movieDetail.voteAverage) }} ({{ movieDetail.voteCount }}
                      undian)
                    </span>
                    <span class="text-slate-400">&bull;</span>
                    <span class="text-slate-300">{{ formatYear(movieDetail.releaseDate) }}</span>
                    <span class="text-slate-400">&bull;</span>
                    <span class="text-slate-300">{{ formatRuntime(movieDetail.runtime) }}</span>
                  </div>

                  <h1 class="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
                    {{ movieDetail.title }}
                  </h1>

                  <p v-if="movieDetail.tagline" class="mt-1 text-sm italic text-slate-400">
                    "{{ movieDetail.tagline }}"
                  </p>
                </div>

                <!-- Genre -->
                <div v-if="movieDetail.genres.length" class="flex flex-wrap gap-2">
                  <span
                    v-for="genre in movieDetail.genres"
                    :key="genre"
                    class="rounded-full border border-slate-700 bg-slate-800/80 px-3 py-1 text-xs font-medium text-slate-200"
                  >
                    {{ genre }}
                  </span>
                </div>

                <!-- Sinopsis -->
                <div class="pt-2">
                  <h2 class="text-sm font-semibold uppercase tracking-wider text-slate-400">
                    Sinopsis
                  </h2>
                  <p class="mt-1.5 text-sm sm:text-base leading-relaxed text-slate-200">
                    {{ movieDetail.overview }}
                  </p>
                </div>

                <!-- Butang Tindakan Kegemaran -->
                <div class="pt-3">
                  <button
                    type="button"
                    @click="toggleFavorite(movieDetail)"
                    :class="[
                      'inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition',
                      isFavorite(movieDetail.id)
                        ? 'bg-rose-600 text-white hover:bg-rose-500'
                        : 'bg-amber-500 text-slate-950 hover:bg-amber-400',
                    ]"
                  >
                    <span>{{
                      isFavorite(movieDetail.id)
                        ? '♥ Disimpan dalam Kegemaran'
                        : '♡ Tambah ke Kegemaran'
                    }}</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Senarai 10 Pelakon Utama (Top 10 Cast) -->
          <div class="space-y-4">
            <h2 class="text-xl font-bold text-white">Pelakon Utama (Top 10)</h2>

            <div
              v-if="movieDetail.cast.length === 0"
              class="rounded-xl border border-slate-800 bg-slate-900/40 p-6 text-sm text-slate-400"
            >
              Maklumat barisan pelakon tidak tersedia untuk filem ini.
            </div>

            <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-4">
              <div
                v-for="actor in movieDetail.cast"
                :key="actor.id"
                class="overflow-hidden rounded-xl border border-slate-800 bg-slate-900/60"
              >
                <div class="aspect-[2/3] w-full bg-slate-800">
                  <img
                    v-if="actor.profilePath"
                    :src="getImageUrl(actor.profilePath, 'w300')"
                    :alt="actor.name"
                    loading="lazy"
                    class="h-full w-full object-cover"
                  />
                  <div
                    v-else
                    class="flex h-full w-full flex-col items-center justify-center text-slate-500"
                  >
                    <span class="text-2xl">👤</span>
                    <span class="mt-1 text-[11px]">Tiada Foto</span>
                  </div>
                </div>
                <div class="p-3">
                  <p class="text-sm font-semibold text-slate-100 truncate">{{ actor.name }}</p>
                  <p class="text-xs text-slate-400 truncate mt-0.5">{{ actor.character }}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <!-- ======================================================== -->
      <!-- PAPARAN 3: SENARAI KEGEMARAN (FAVORITES)                 -->
      <!-- ======================================================== -->
      <section v-else-if="currentView === 'favorites'" class="space-y-6">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h1 class="text-2xl sm:text-3xl font-bold text-white">Filem Kegemaran Saya</h1>
            <p class="mt-1 text-sm text-slate-400">
              Disimpan secara automatik dalam pelayar anda ({{ favorites.length }} filem)
            </p>
          </div>
        </div>

        <!-- Keadaan Kosong Kegemaran -->
        <div
          v-if="favorites.length === 0"
          class="rounded-2xl border border-slate-800 bg-slate-900/40 py-20 px-4 text-center"
        >
          <p class="text-4xl mb-3">🍿</p>
          <h2 class="text-lg font-semibold text-white">Senarai kegemaran anda masih kosong</h2>
          <p class="mt-1 max-w-md mx-auto text-sm text-slate-400">
            Klik ikon hati (♡) pada mana-mana kad filem untuk menyimpannya di sini supaya mudah
            dirujuk kemudian.
          </p>
          <button
            type="button"
            @click="goHome"
            class="mt-6 rounded-xl bg-amber-500 px-5 py-2.5 text-sm font-semibold text-slate-950 hover:bg-amber-400 transition"
          >
            Terokai Filem Sekarang
          </button>
        </div>

        <!-- Grid Filem Kegemaran -->
        <div
          v-else
          class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4 sm:gap-6"
        >
          <article
            v-for="movie in favorites"
            :key="movie.id"
            class="group relative flex flex-col overflow-hidden rounded-xl border border-slate-800/80 bg-slate-900/60 transition duration-300 hover:-translate-y-1 hover:border-slate-700"
          >
            <div
              @click="openMovieDetail(movie.id)"
              class="relative aspect-[2/3] w-full cursor-pointer overflow-hidden bg-slate-800"
            >
              <img
                v-if="movie.posterPath"
                :src="getImageUrl(movie.posterPath, 'w500')"
                :alt="movie.title"
                loading="lazy"
                class="h-full w-full object-cover transition duration-300 group-hover:scale-105"
              />
              <div
                v-else
                class="flex h-full w-full flex-col items-center justify-center p-4 text-center text-slate-500"
              >
                <span class="text-3xl mb-2">🎬</span>
                <span class="text-xs font-medium">Tiada Poster</span>
              </div>

              <div
                class="absolute top-2.5 left-2.5 rounded-md bg-slate-950/85 px-2 py-1 text-xs font-bold text-amber-400 backdrop-blur-sm border border-slate-800"
              >
                ★ {{ formatRating(movie.voteAverage) }}
              </div>
            </div>

            <button
              type="button"
              @click.stop="toggleFavorite(movie)"
              title="Buang dari Kegemaran"
              class="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-rose-500 border border-rose-400 text-white shadow-md hover:bg-rose-600 transition"
            >
              <span class="text-sm leading-none">♥</span>
            </button>

            <div class="flex flex-1 flex-col justify-between p-3.5">
              <h2
                @click="openMovieDetail(movie.id)"
                class="cursor-pointer text-sm font-semibold text-slate-100 line-clamp-2 group-hover:text-amber-400 transition"
              >
                {{ movie.title }}
              </h2>
              <p class="mt-2 text-xs text-slate-400">
                {{ formatYear(movie.releaseDate) }}
              </p>
            </div>
          </article>
        </div>
      </section>
    </main>

    <!-- ==================== FOOTER ==================== -->
    <footer class="border-t border-slate-800/80 py-6 text-center text-xs text-slate-500">
      <p>CineVault Movie Catalog &bull; Dibina dengan Vue 3 &amp; TMDB API</p>
    </footer>
  </div>
</template>
