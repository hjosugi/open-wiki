/**
 * Presence registry — who is currently viewing each page. A pure bookkeeping
 * structure: the WebSocket layer owns the sockets and calls join/leave here on
 * connect/disconnect, then broadcasts `list(path)`.
 */
export interface Viewer {
  readonly id: string // connection id (one per socket/tab)
  readonly userId: string | null
  readonly name: string
}

export interface PresenceRegistry {
  join(path: string, connId: string, who: { userId: string | null; name: string }): void
  /** Remove a connection; returns the path it was on (to re-broadcast), or null. */
  leave(connId: string): string | null
  list(path: string): Viewer[]
}

export const createPresence = (): PresenceRegistry => {
  const byPath = new Map<string, Map<string, Viewer>>()
  const pathOf = new Map<string, string>()

  return {
    join(path, connId, who) {
      pathOf.set(connId, path)
      let viewers = byPath.get(path)
      if (!viewers) {
        viewers = new Map()
        byPath.set(path, viewers)
      }
      viewers.set(connId, { id: connId, userId: who.userId, name: who.name })
    },
    leave(connId) {
      const path = pathOf.get(connId)
      if (path === undefined) return null
      pathOf.delete(connId)
      const viewers = byPath.get(path)
      if (viewers) {
        viewers.delete(connId)
        if (viewers.size === 0) byPath.delete(path)
      }
      return path
    },
    list(path) {
      const viewers = byPath.get(path)
      return viewers ? [...viewers.values()] : []
    },
  }
}

/** Collapse multiple connections of the same user into one display entry. */
export const dedupeViewers = (
  viewers: readonly Viewer[],
): { userId: string | null; name: string }[] => {
  const seen = new Set<string>()
  const out: { userId: string | null; name: string }[] = []
  for (const v of viewers) {
    const key = v.userId ?? `anon:${v.id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ userId: v.userId, name: v.name })
  }
  return out
}
