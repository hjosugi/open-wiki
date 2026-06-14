import { describe, test, expect } from 'bun:test'
import { createEventBus, type WikiEvent } from './bus.ts'

describe('event bus', () => {
  test('delivers events, then stops after unsubscribe', () => {
    const bus = createEventBus()
    const seen: WikiEvent[] = []
    const unsubscribe = bus.subscribe((e) => seen.push(e))

    bus.emit({ type: 'page:changed', action: 'created', path: 'a' })
    expect(seen).toHaveLength(1)
    expect(seen[0]?.path).toBe('a')

    unsubscribe()
    expect(bus.size()).toBe(0)
    bus.emit({ type: 'page:changed', action: 'updated', path: 'b' })
    expect(seen).toHaveLength(1)
  })

  test('a throwing subscriber does not break the others', () => {
    const bus = createEventBus()
    let delivered = false
    bus.subscribe(() => {
      throw new Error('boom')
    })
    bus.subscribe(() => {
      delivered = true
    })
    bus.emit({ type: 'page:changed', action: 'deleted', path: 'x' })
    expect(delivered).toBe(true)
  })
})
