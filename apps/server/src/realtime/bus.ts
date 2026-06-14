/**
 * In-memory event bus — the transport-agnostic core of realtime.
 *
 * Page mutations emit `WikiEvent`s here; transports just subscribe. Today that's
 * SSE (`GET /api/events`); a WebSocket endpoint can subscribe to the SAME bus
 * later with no other change. To go multi-instance, swap this for a Redis-backed
 * implementation behind the identical `EventBus` interface — nothing else moves.
 */
export interface WikiEvent {
  readonly type: 'page:changed'
  readonly action: 'created' | 'updated' | 'moved' | 'deleted'
  readonly path: string
  /** Previous path, present on moves. */
  readonly from?: string
}

export type Listener = (event: WikiEvent) => void

export interface EventBus {
  emit(event: WikiEvent): void
  /** Subscribe; returns an unsubscribe function. */
  subscribe(listener: Listener): () => void
  /** Current subscriber count (diagnostics/tests). */
  size(): number
}

export const createEventBus = (): EventBus => {
  const listeners = new Set<Listener>()
  return {
    emit(event) {
      for (const listener of listeners) {
        try {
          listener(event)
        } catch {
          /* a broken subscriber must not break the emit loop */
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    size() {
      return listeners.size
    },
  }
}
