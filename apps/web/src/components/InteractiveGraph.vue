<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import type { PageGraph, PageGraphEdge, PageGraphNode } from '@/lib/api'

interface SimNode extends PageGraphNode {
  x: number
  y: number
  vx: number
  vy: number
  radius: number
  degree: number
}

interface SimEdge extends PageGraphEdge {
  sourceNode: SimNode
  targetNode: SimNode
}

const props = withDefaults(
  defineProps<{
    graph: PageGraph
    focusPath?: string | null
    title?: string
    compact?: boolean
  }>(),
  {
    focusPath: null,
    title: 'Interactive graph',
    compact: false,
  },
)

const router = useRouter()
const selected = ref<string | null>(props.focusPath)
const showMissing = ref(true)
const localOnly = ref(Boolean(props.focusPath))
const localDepth = ref(2)
const linkDistance = ref(112)
const linkStrength = ref(0.045)
const repulsion = ref(2600)
const zoom = ref(1)
const pan = ref({ x: 0, y: 0 })
const nodes = ref<SimNode[]>([])
let raf = 0
let alpha = 0
let dragging: { path: string; pointerId: number } | null = null
let panning: { x: number; y: number; panX: number; panY: number; pointerId: number } | null = null

const width = computed(() => (props.compact ? 320 : 980))
const height = computed(() => (props.compact ? 250 : 620))
const centerX = computed(() => width.value / 2)
const centerY = computed(() => height.value / 2)

const adjacency = computed(() => {
  const map = new Map<string, Set<string>>()
  for (const node of props.graph.nodes) map.set(node.path, new Set())
  for (const edge of props.graph.edges) {
    if (!map.has(edge.source)) map.set(edge.source, new Set())
    if (!map.has(edge.target)) map.set(edge.target, new Set())
    map.get(edge.source)!.add(edge.target)
    map.get(edge.target)!.add(edge.source)
  }
  return map
})

const visiblePaths = computed(() => {
  const all = new Set(props.graph.nodes.map((node) => node.path))
  if (!localOnly.value || !props.focusPath) return all

  const seen = new Set<string>([props.focusPath])
  let frontier = [props.focusPath]
  for (let depth = 0; depth < localDepth.value; depth++) {
    const next: string[] = []
    for (const path of frontier) {
      for (const linked of adjacency.value.get(path) ?? []) {
        if (seen.has(linked)) continue
        seen.add(linked)
        next.push(linked)
      }
    }
    frontier = next
  }
  return seen
})

const visibleGraph = computed(() => {
  const allowed = visiblePaths.value
  const graphNodes = props.graph.nodes.filter((node) => allowed.has(node.path) && (showMissing.value || node.kind !== 'missing'))
  const nodeSet = new Set(graphNodes.map((node) => node.path))
  const graphEdges = props.graph.edges.filter((edge) => nodeSet.has(edge.source) && nodeSet.has(edge.target))
  return { nodes: graphNodes, edges: graphEdges }
})

const nodeByPath = computed(() => new Map(nodes.value.map((node) => [node.path, node])))
const edges = computed<SimEdge[]>(() =>
  visibleGraph.value.edges
    .map((edge) => {
      const sourceNode = nodeByPath.value.get(edge.source)
      const targetNode = nodeByPath.value.get(edge.target)
      return sourceNode && targetNode ? { ...edge, sourceNode, targetNode } : null
    })
    .filter((edge): edge is SimEdge => Boolean(edge)),
)

const selectedNode = computed(() => nodeByPath.value.get(selected.value ?? '') ?? null)
const incoming = computed(() => visibleGraph.value.edges.filter((edge) => edge.target === selected.value))
const outgoing = computed(() => visibleGraph.value.edges.filter((edge) => edge.source === selected.value))
const transform = computed(() => `translate(${pan.value.x} ${pan.value.y}) scale(${zoom.value})`)

const initialise = (): void => {
  cancelAnimationFrame(raf)
  const old = new Map(nodes.value.map((node) => [node.path, node]))
  const degree = new Map<string, number>()
  for (const edge of visibleGraph.value.edges) {
    degree.set(edge.source, (degree.get(edge.source) ?? 0) + 1)
    degree.set(edge.target, (degree.get(edge.target) ?? 0) + 1)
  }

  const count = visibleGraph.value.nodes.length
  nodes.value = visibleGraph.value.nodes.map((node, index) => {
    const previous = old.get(node.path)
    const angle = -Math.PI / 2 + (index / Math.max(1, count)) * Math.PI * 2
    const ring = props.compact ? 72 : 180
    const nodeDegree = degree.get(node.path) ?? 0
    return {
      ...node,
      x: previous?.x ?? centerX.value + Math.cos(angle) * ring,
      y: previous?.y ?? centerY.value + Math.sin(angle) * ring,
      vx: previous?.vx ?? 0,
      vy: previous?.vy ?? 0,
      degree: nodeDegree,
      radius: node.kind === 'missing' ? 4.5 : Math.min(18, 5.5 + Math.sqrt(nodeDegree + 1) * 3.2),
    }
  })

  if (!selected.value || !nodeByPath.value.has(selected.value)) {
    selected.value = props.focusPath && nodeByPath.value.has(props.focusPath) ? props.focusPath : nodes.value[0]?.path ?? null
  }
  alpha = 1
  tick()
}

const tick = (): void => {
  const items = nodes.value
  if (items.length === 0) return

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const a = items[i]!
      const b = items[j]!
      const dx = b.x - a.x || 0.01
      const dy = b.y - a.y || 0.01
      const distanceSq = Math.max(64, dx * dx + dy * dy)
      const force = (repulsion.value * alpha) / distanceSq
      const fx = dx * force
      const fy = dy * force
      a.vx -= fx
      a.vy -= fy
      b.vx += fx
      b.vy += fy
    }
  }

  for (const edge of edges.value) {
    const dx = edge.targetNode.x - edge.sourceNode.x
    const dy = edge.targetNode.y - edge.sourceNode.y
    const distance = Math.max(1, Math.hypot(dx, dy))
    const force = (distance - linkDistance.value) * linkStrength.value * alpha
    const fx = (dx / distance) * force
    const fy = (dy / distance) * force
    edge.sourceNode.vx += fx
    edge.sourceNode.vy += fy
    edge.targetNode.vx -= fx
    edge.targetNode.vy -= fy
  }

  for (const node of items) {
    node.vx += (centerX.value - node.x) * 0.006 * alpha
    node.vy += (centerY.value - node.y) * 0.006 * alpha
    if (node.path === props.focusPath) {
      node.vx += (centerX.value - node.x) * 0.018 * alpha
      node.vy += (centerY.value - node.y) * 0.018 * alpha
    }
    if (!dragging || dragging.path !== node.path) {
      node.x += node.vx
      node.y += node.vy
    }
    node.vx *= 0.82
    node.vy *= 0.82
  }

  alpha *= 0.965
  if (alpha > 0.018) raf = requestAnimationFrame(tick)
}

const restart = (): void => {
  alpha = Math.max(alpha, 0.7)
  cancelAnimationFrame(raf)
  tick()
}

const screenToGraph = (event: PointerEvent, svg: SVGSVGElement): { x: number; y: number } => {
  const rect = svg.getBoundingClientRect()
  const x = ((event.clientX - rect.left) / rect.width) * width.value
  const y = ((event.clientY - rect.top) / rect.height) * height.value
  return {
    x: (x - pan.value.x) / zoom.value,
    y: (y - pan.value.y) / zoom.value,
  }
}

const openNode = (node: PageGraphNode): void => {
  if (node.kind === 'missing') router.push({ name: 'new', query: { path: node.path } })
  else router.push('/' + node.path)
}

const selectNode = (path: string): void => {
  selected.value = path
  restart()
}

const startNodeDrag = (event: PointerEvent, node: SimNode): void => {
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (!svg) return
  event.stopPropagation()
  ;(event.currentTarget as SVGGElement).setPointerCapture(event.pointerId)
  selected.value = node.path
  dragging = { path: node.path, pointerId: event.pointerId }
  const point = screenToGraph(event, svg)
  node.x = point.x
  node.y = point.y
  node.vx = 0
  node.vy = 0
  restart()
}

const moveNodeDrag = (event: PointerEvent, node: SimNode): void => {
  if (!dragging || dragging.pointerId !== event.pointerId || dragging.path !== node.path) return
  const svg = (event.currentTarget as SVGGElement).ownerSVGElement
  if (!svg) return
  const point = screenToGraph(event, svg)
  node.x = point.x
  node.y = point.y
  node.vx = 0
  node.vy = 0
  restart()
}

const endNodeDrag = (event: PointerEvent): void => {
  if (dragging?.pointerId === event.pointerId) dragging = null
}

const startPan = (event: PointerEvent): void => {
  ;(event.currentTarget as SVGSVGElement).setPointerCapture(event.pointerId)
  panning = { x: event.clientX, y: event.clientY, panX: pan.value.x, panY: pan.value.y, pointerId: event.pointerId }
}

const movePan = (event: PointerEvent): void => {
  if (!panning || panning.pointerId !== event.pointerId) return
  pan.value = {
    x: panning.panX + (event.clientX - panning.x),
    y: panning.panY + (event.clientY - panning.y),
  }
}

const endPan = (event: PointerEvent): void => {
  if (panning?.pointerId === event.pointerId) panning = null
}

const onWheel = (event: WheelEvent): void => {
  event.preventDefault()
  const next = Math.min(2.8, Math.max(0.45, zoom.value * (event.deltaY > 0 ? 0.9 : 1.1)))
  zoom.value = Number(next.toFixed(3))
}

const resetView = (): void => {
  zoom.value = 1
  pan.value = { x: 0, y: 0 }
  initialise()
}

watch(
  () => [props.graph, props.focusPath, showMissing.value, localOnly.value, localDepth.value],
  initialise,
  { deep: true, immediate: true },
)

watch([linkDistance, linkStrength, repulsion], restart)

onBeforeUnmount(() => cancelAnimationFrame(raf))
</script>

<template>
  <section class="interactive-graph" :class="{ 'interactive-graph-compact': compact }">
    <div class="interactive-graph-head">
      <div>
        <h2>{{ title }}</h2>
        <p v-if="!compact">{{ visibleGraph.nodes.length }} nodes / {{ visibleGraph.edges.length }} links</p>
      </div>
      <div class="interactive-graph-actions">
        <button class="btn-ghost" type="button" title="Reset view" @click="resetView">Reset</button>
        <RouterLink v-if="compact" to="/_graph" class="btn-ghost" title="Open graph">Open</RouterLink>
      </div>
    </div>

    <div v-if="!compact" class="interactive-graph-controls">
      <label>
        <input v-model="localOnly" type="checkbox" :disabled="!focusPath" />
        Local
      </label>
      <label>
        <input v-model="showMissing" type="checkbox" />
        Missing
      </label>
      <label>
        Depth
        <input v-model.number="localDepth" class="graph-range" type="range" min="1" max="4" />
      </label>
      <label>
        Link distance
        <input v-model.number="linkDistance" class="graph-range" type="range" min="60" max="220" />
      </label>
      <label>
        Force
        <input v-model.number="repulsion" class="graph-range" type="range" min="800" max="6200" />
      </label>
    </div>

    <svg
      class="interactive-graph-canvas"
      :viewBox="`0 0 ${width} ${height}`"
      role="img"
      aria-label="Interactive wiki graph"
      @pointerdown="startPan"
      @pointermove="movePan"
      @pointerup="endPan"
      @pointercancel="endPan"
      @wheel="onWheel"
    >
      <rect class="interactive-graph-bg" :width="width" :height="height" />
      <g :transform="transform">
        <line
          v-for="edge in edges"
          :key="`${edge.source}-${edge.target}-${edge.kind}`"
          :x1="edge.sourceNode.x"
          :y1="edge.sourceNode.y"
          :x2="edge.targetNode.x"
          :y2="edge.targetNode.y"
          :class="[
            'interactive-graph-edge',
            edge.kind === 'markdown' ? 'interactive-graph-edge-markdown' : '',
            selected && (edge.source === selected || edge.target === selected) ? 'interactive-graph-edge-active' : ''
          ]"
        />

        <g
          v-for="node in nodes"
          :key="node.path"
          class="interactive-graph-node"
          :class="{
            'interactive-graph-node-active': node.path === selected,
            'interactive-graph-node-focus': node.path === focusPath,
            'interactive-graph-node-missing': node.kind === 'missing'
          }"
          :transform="`translate(${node.x}, ${node.y})`"
          tabindex="0"
          role="button"
          @click="selectNode(node.path)"
          @dblclick="openNode(node)"
          @keydown.enter.prevent="openNode(node)"
          @pointerdown="startNodeDrag($event, node)"
          @pointermove="moveNodeDrag($event, node)"
          @pointerup="endNodeDrag"
          @pointercancel="endNodeDrag"
        >
          <circle :r="node.radius" />
          <text v-if="!compact || node.path === selected || node.path === focusPath" :y="node.radius + 14" text-anchor="middle">
            {{ node.title }}
          </text>
        </g>
      </g>
    </svg>

    <div v-if="selectedNode && !compact" class="interactive-graph-detail">
      <div>
        <p class="interactive-graph-kicker">{{ selectedNode.kind === 'missing' ? 'Missing page' : 'Page' }}</p>
        <h3>{{ selectedNode.title }}</h3>
        <p class="font-mono">/{{ selectedNode.path }}</p>
      </div>
      <button class="btn-primary" type="button" @click="openNode(selectedNode)">
        {{ selectedNode.kind === 'missing' ? 'Create page' : 'Open page' }}
      </button>
      <div>
        <h4>Links to</h4>
        <button v-for="edge in outgoing" :key="`${edge.source}-${edge.target}-${edge.kind}`" class="link-quiet" type="button" @click="selectNode(edge.target)">
          /{{ edge.target }}
        </button>
        <p v-if="!outgoing.length">No outgoing links.</p>
      </div>
      <div>
        <h4>Linked from</h4>
        <button v-for="edge in incoming" :key="`${edge.source}-${edge.target}-${edge.kind}`" class="link-quiet" type="button" @click="selectNode(edge.source)">
          /{{ edge.source }}
        </button>
        <p v-if="!incoming.length">No backlinks.</p>
      </div>
    </div>
  </section>
</template>
