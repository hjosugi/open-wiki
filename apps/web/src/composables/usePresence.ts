import { ref, watch, onUnmounted, type Ref } from 'vue'
import { connectPresence, type PresenceViewer } from '@/lib/presence'
import { useAuth } from '@/stores/auth'

/**
 * Reactive list of who is currently viewing `path`. Re-connects when the path
 * changes (navigating between pages) and cleans up on unmount.
 */
export function usePresence(path: Ref<string>) {
  const viewers = ref<PresenceViewer[]>([])
  const auth = useAuth()
  let disconnect: (() => void) | null = null

  function connect(target: string): void {
    disconnect?.()
    viewers.value = []
    disconnect = connectPresence(
      target,
      { name: auth.user?.name ?? 'Anonymous', userId: auth.user?.id ?? null },
      (next) => {
        viewers.value = next
      },
    )
  }

  watch(
    path,
    (target) => {
      if (target) connect(target)
    },
    { immediate: true },
  )

  onUnmounted(() => disconnect?.())

  return { viewers }
}
