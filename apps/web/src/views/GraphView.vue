<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { Api, type PageGraph, type PageGraphNode } from '@/lib/api'
import EmptyState from '@/components/EmptyState.vue'

interface GraphPoint extends PageGraphNode {
  x: number
  y: number
}

const router = useRouter()
const graph = ref<PageGraph>({ nodes: [], edges: [] })
const loading = ref(false)
const error = ref<string | null>(null)
const selected = ref<string | null>(null)

const WIDTH = 900
const HEIGHT = 620
const CENTER_X = WIDTH / 2
const CENTER_Y = HEIGHT / 2

const points = computed<GraphPoint[]>(() => {
  const nodes = [...graph.value.nodes].sort((a, b) => {
    if (a.kind !== b.kind) return a.kind === 'page' ? -1 : 1
    return a.path.localeCompare(b.path)
  })
  const count = nodes.length
  if (count === 0) return []
  if (count === 1) return [{ ...nodes[0]!, x: CENTER_X, y: CENTER_Y }]

  const radius = Math.min(240, Math.max(120, 42 * count))
  return nodes.map((node, index) => {
    const angle = -Math.PI / 2 + (index / count) * Math.PI * 2
    return {
      ...node,
      x: CENTER_X + Math.cos(angle) * radius,
      y: CENTER_Y + Math.sin(angle) * radius,
    }
  })
})

const pointByPath = computed(() => new Map(points.value.map((point) => [point.path, point])))
const visibleEdges = computed(() =>
  graph.value.edges
    .map((edge) => ({
      ...edge,
      sourcePoint: pointByPath.value.get(edge.source),
      targetPoint: pointByPath.value.get(edge.target),
    }))
    .filter((edge) => edge.sourcePoint && edge.targetPoint),
)

const selectedNode = computed(() => points.value.find((point) => point.path === selected.value) ?? null)
const outgoing = computed(() => graph.value.edges.filter((edge) => edge.source === selected.value))
const incoming = computed(() => graph.value.edges.filter((edge) => edge.target === selected.value))

async function load(): Promise<void> {
  loading.value = true
  error.value = null
  try {
    graph.value = await Api.graph()
    selected.value = graph.value.nodes[0]?.path ?? null
  } catch (e) {
    error.value = (e as Error).message
  } finally {
    loading.value = false
  }
}

function openNode(node: PageGraphNode): void {
  if (node.kind === 'missing') {
    router.push({ name: 'new', query: { path: node.path } })
    return
  }
  router.push('/' + node.path)
}

onMounted(load)
</script>

<template>
  <div class="space-y-5">
    <header class="flex flex-wrap items-start justify-between gap-3 border-b border-gray-200 dark:border-gray-800 pb-4">
      <div>
        <h1 class="text-2xl font-bold tracking-tight">Graph</h1>
        <p class="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Internal links, missing pages, and how the wiki hangs together.
        </p>
      </div>
      <button class="btn-ghost" type="button" :disabled="loading" @click="load">
        Refresh
      </button>
    </header>

    <p v-if="loading" class="text-gray-400">Loading graph...</p>
    <p v-else-if="error" class="text-sm text-red-600">{{ error }}</p>

    <EmptyState
      v-else-if="!graph.nodes.length"
      title="No graph yet"
      message="Create pages and link them with [[Wiki Links]] or normal Markdown links."
    >
      <template #actions>
        <RouterLink to="/_new" class="btn-primary">New page</RouterLink>
      </template>
    </EmptyState>

    <div v-else class="grid lg:grid-cols-[minmax(0,1fr)_18rem] gap-5">
      <section class="border border-gray-200 dark:border-gray-800 rounded-lg bg-white dark:bg-gray-950 overflow-hidden">
        <svg
          class="w-full graph-canvas"
          :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
          role="img"
          aria-label="Wiki page graph"
        >
          <line
            v-for="edge in visibleEdges"
            :key="`${edge.source}-${edge.target}-${edge.kind}`"
            :x1="edge.sourcePoint!.x"
            :y1="edge.sourcePoint!.y"
            :x2="edge.targetPoint!.x"
            :y2="edge.targetPoint!.y"
            :class="[
              'graph-edge',
              edge.kind === 'wikilink' ? 'graph-edge-wiki' : 'graph-edge-markdown',
              selected && (edge.source === selected || edge.target === selected) ? 'graph-edge-active' : ''
            ]"
          />

          <g
            v-for="point in points"
            :key="point.path"
            class="graph-node"
            :class="{ 'graph-node-active': point.path === selected, 'graph-node-missing': point.kind === 'missing' }"
            :transform="`translate(${point.x}, ${point.y})`"
            tabindex="0"
            role="button"
            @click="selected = point.path"
            @dblclick="openNode(point)"
            @keydown.enter.prevent="openNode(point)"
          >
            <circle r="18" />
            <text y="34" text-anchor="middle">{{ point.title }}</text>
          </g>
        </svg>
      </section>

      <aside class="border border-gray-200 dark:border-gray-800 rounded-lg p-4 bg-white dark:bg-gray-950">
        <template v-if="selectedNode">
          <div class="text-xs uppercase tracking-wide text-gray-400 font-semibold mb-1">
            {{ selectedNode.kind === 'missing' ? 'Missing page' : 'Page' }}
          </div>
          <h2 class="font-semibold truncate">{{ selectedNode.title }}</h2>
          <p class="text-xs text-gray-500 dark:text-gray-400 font-mono mt-1 break-all">/{{ selectedNode.path }}</p>

          <button class="btn-primary w-full justify-center mt-4" type="button" @click="openNode(selectedNode)">
            {{ selectedNode.kind === 'missing' ? 'Create page' : 'Open page' }}
          </button>

          <div class="mt-5 space-y-4 text-sm">
            <section>
              <h3 class="font-semibold mb-2">Links to</h3>
              <ul v-if="outgoing.length" class="space-y-1">
                <li v-for="edge in outgoing" :key="`${edge.source}-${edge.target}-${edge.kind}`">
                  <button class="link-quiet text-left" type="button" @click="selected = edge.target">
                    /{{ edge.target }}
                  </button>
                </li>
              </ul>
              <p v-else class="text-gray-400">No outgoing links.</p>
            </section>

            <section>
              <h3 class="font-semibold mb-2">Linked from</h3>
              <ul v-if="incoming.length" class="space-y-1">
                <li v-for="edge in incoming" :key="`${edge.source}-${edge.target}-${edge.kind}`">
                  <button class="link-quiet text-left" type="button" @click="selected = edge.source">
                    /{{ edge.source }}
                  </button>
                </li>
              </ul>
              <p v-else class="text-gray-400">No backlinks.</p>
            </section>
          </div>
        </template>
      </aside>
    </div>
  </div>
</template>
