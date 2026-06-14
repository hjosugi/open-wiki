<script setup lang="ts">
import { computed } from 'vue'
import type { PageSummary } from '@/lib/api'

interface TreeNode {
  key: string
  label: string
  path: string
  page?: PageSummary
  children: Map<string, TreeNode>
}

interface TreeRow {
  key: string
  label: string
  path: string
  depth: number
  isPage: boolean
}

const props = defineProps<{
  pages: PageSummary[]
}>()

const rows = computed<TreeRow[]>(() => {
  const root: TreeNode = { key: '', label: '', path: '', children: new Map() }

  for (const page of props.pages) {
    const segments = page.path.split('/').filter(Boolean)
    let current = root
    segments.forEach((segment, index) => {
      const path = segments.slice(0, index + 1).join('/')
      let child = current.children.get(segment)
      if (!child) {
        child = { key: path, label: segment, path, children: new Map() }
        current.children.set(segment, child)
      }
      if (index === segments.length - 1) {
        child.page = page
        child.label = page.title
      }
      current = child
    })
  }

  const out: TreeRow[] = []
  const visit = (node: TreeNode, depth: number): void => {
    const children = [...node.children.values()].sort((a, b) => a.label.localeCompare(b.label))
    for (const child of children) {
      out.push({
        key: child.key,
        label: child.label,
        path: child.path,
        depth,
        isPage: Boolean(child.page),
      })
      visit(child, depth + 1)
    }
  }
  visit(root, 0)
  return out
})
</script>

<template>
  <nav class="flex flex-col gap-0.5">
    <template v-for="row in rows" :key="row.key">
      <RouterLink
        v-if="row.isPage"
        :to="'/' + row.path"
        class="page-tree-row"
        active-class="page-tree-row-active"
        :style="{ paddingLeft: 0.5 + row.depth * 0.75 + 'rem' }"
      >
        {{ row.label }}
      </RouterLink>
      <span
        v-else
        class="page-tree-folder"
        :style="{ paddingLeft: 0.5 + row.depth * 0.75 + 'rem' }"
      >
        {{ row.label }}
      </span>
    </template>
  </nav>
</template>
