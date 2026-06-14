import { describe, test, expect } from 'bun:test'
import { createPresence, dedupeViewers } from './presence.ts'

describe('presence registry', () => {
  test('join, list per path, and leave', () => {
    const p = createPresence()
    p.join('home', 'c1', { userId: 'u1', name: 'Alice' })
    p.join('home', 'c2', { userId: 'u2', name: 'Bob' })
    p.join('docs', 'c3', { userId: 'u3', name: 'Cara' })

    expect(p.list('home').map((v) => v.name).sort()).toEqual(['Alice', 'Bob'])
    expect(p.leave('c1')).toBe('home')
    expect(p.list('home').map((v) => v.name)).toEqual(['Bob'])
    expect(p.list('docs')).toHaveLength(1)
    expect(p.leave('unknown')).toBeNull()
  })

  test('dedupe collapses same user, keeps anonymous distinct', () => {
    const out = dedupeViewers([
      { id: 'c1', userId: 'u1', name: 'Alice' },
      { id: 'c2', userId: 'u1', name: 'Alice' }, // same user, second tab
      { id: 'c3', userId: null, name: 'Anonymous' },
      { id: 'c4', userId: null, name: 'Anonymous' },
    ])
    expect(out.filter((v) => v.userId === 'u1')).toHaveLength(1)
    expect(out.filter((v) => v.userId === null)).toHaveLength(2)
  })
})
