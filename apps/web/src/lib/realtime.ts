/**
 * Realtime client — subscribes to the server's SSE stream (`/api/events`) and
 * fans `page:changed` events out to in-app listeners. EventSource reconnects
 * automatically, so this is fire-and-forget. (Transport is intentionally hidden
 * behind `onWikiEvent`, so we can swap SSE → WebSocket without touching callers.)
 */
const BASE_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:4000'

export interface WikiEvent {
  type: 'page:changed'
  action: 'created' | 'updated' | 'moved' | 'deleted'
  path: string
  from?: string
}

type Listener = (event: WikiEvent) => void

const listeners = new Set<Listener>()
let source: EventSource | null = null

export function connectRealtime(): void {
  if (source) return
  source = new EventSource(`${BASE_URL}/api/events`)
  source.onmessage = (msg) => {
    try {
      const event = JSON.parse(msg.data) as WikiEvent
      if (event?.type === 'page:changed') {
        for (const listener of listeners) listener(event)
      }
    } catch {
      /* ignore malformed frames */
    }
  }
  // On error EventSource retries on its own; nothing to do here.
}

export function onWikiEvent(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
