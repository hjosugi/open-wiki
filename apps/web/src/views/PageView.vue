<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Api, type Page } from '@/lib/api'
import { paramToPath } from '@/router'
import { useAuth } from '@/stores/auth'
import EmptyState from '@/components/EmptyState.vue'
import PageHeader from '@/components/PageHeader.vue'
import PageToc from '@/components/PageToc.vue'

const route = useRoute()
const auth = useAuth()

const page = ref<Page | null>(null)
const error = ref<string | null>(null)
const loading = ref(false)

const path = computed(() => paramToPath(route.params.path) || 'home')
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
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

watch(path, load, { immediate: true })
</script>

<template>
  <div v-if="loading" class="text-gray-400">Loading…</div>

  <div v-else-if="page" class="flex gap-8">
    <article class="flex-1 min-w-0">
      <PageHeader :page="page" :can-edit="auth.canEdit" />
      <div class="prose dark:prose-invert max-w-none" v-html="page.renderedHtml"></div>
    </article>

    <PageToc v-if="toc.length" :entries="toc" class="hidden lg:block w-56 shrink-0" />
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
