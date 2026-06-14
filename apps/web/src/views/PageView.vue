<script setup lang="ts">
import { ref, watch, computed, onUnmounted } from 'vue'
import { useRoute } from 'vue-router'
import { Api, type Page } from '@/lib/api'
import { paramToPath } from '@/router'
import { useAuth } from '@/stores/auth'
import { onWikiEvent } from '@/lib/realtime'
import { usePresence } from '@/composables/usePresence'
import EmptyState from '@/components/EmptyState.vue'
import InteractiveGraph from '@/components/InteractiveGraph.vue'
import PageHeader from '@/components/PageHeader.vue'
import PageToc from '@/components/PageToc.vue'
import type { PageGraph } from '@/lib/api'

const route = useRoute()
const auth = useAuth()

const page = ref<Page | null>(null)
const graph = ref<PageGraph>({ nodes: [], edges: [] })
const error = ref<string | null>(null)
const loading = ref(false)

const path = computed(() => paramToPath(route.params.path) || 'home')
const { viewers } = usePresence(path)
const toc = computed<{ id: string; text: string; level: number }[]>(() => {
  try {
    return JSON.parse(page.value?.toc ?? '[]')
  } catch {
    return []
  }
})

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  page.value = null
  try {
    page.value = await Api.getPage(path.value)
    try {
      graph.value = await Api.graph()
    } catch {
      graph.value = { nodes: [], edges: [] }
    }
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(path, load, { immediate: true })

// Realtime: when THIS page changes elsewhere, refresh it in place (no flash).
async function reloadInPlace(): Promise<void> {
  try {
    page.value = await Api.getPage(path.value)
  } catch {
    page.value = null // deleted or moved away → show the empty state
  }
}
const stopRealtime = onWikiEvent((event) => {
  if (event.path === path.value || event.from === path.value) void reloadInPlace()
})
onUnmounted(stopRealtime)
</script>

<template>
  <div v-if="loading" class="text-gray-400">Loading…</div>

  <div v-else-if="page" class="flex gap-8">
    <article class="flex-1 min-w-0">
      <PageHeader :page="page" :can-edit="auth.canEdit" />
      <div v-if="viewers.length > 1" class="flex items-center gap-2 -mt-2 mb-4">
        <div class="flex -space-x-2">
          <span
            v-for="(v, i) in viewers.slice(0, 5)"
            :key="i"
            :title="v.name"
            class="w-6 h-6 rounded-full bg-violet-500 text-white text-[11px] font-medium flex items-center justify-center ring-2 ring-white dark:ring-gray-950"
          >
            {{ (v.name[0] ?? '?').toUpperCase() }}
          </span>
        </div>
        <span class="text-xs text-gray-400">{{ viewers.length }} viewing now</span>
      </div>
      <div class="prose dark:prose-invert max-w-none" v-html="page.renderedHtml"></div>
    </article>

    <aside class="hidden xl:block w-72 shrink-0 space-y-6">
      <InteractiveGraph :graph="graph" :focus-path="page.path" compact />
      <PageToc v-if="toc.length" :entries="toc" />
    </aside>
  </div>

  <EmptyState
    v-else
    title="This page does not exist yet"
    :message="`/${path}`"
  >
    <template #actions>
      <RouterLink v-if="auth.canEdit" :to="{ name: 'new', query: { path } }" class="btn-primary">
        Create this page
      </RouterLink>
      <RouterLink v-else to="/_login" class="btn-ghost">Sign in to create it</RouterLink>
    </template>
    <p v-if="error" class="text-xs text-gray-400 mt-4">{{ error }}</p>
  </EmptyState>
</template>
