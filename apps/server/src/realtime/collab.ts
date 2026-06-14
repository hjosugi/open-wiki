/**
 * Collaborative editing relay — implements the y-websocket wire protocol
 * (Yjs sync + awareness) over our own WebSocket endpoint, so the standard
 * `WebsocketProvider` client + `y-codemirror.next` work unchanged.
 *
 * One `Y.Doc` per page ("room"), seeded from the DB on first join. The doc is
 * the live shared buffer; persistence still happens through the normal Save
 * (pages.update). When the last client leaves, the room is discarded.
 *
 * Ported in spirit from y-websocket's `setupWSConnection`, adapted to a small
 * transport-agnostic hub we can unit-/headless-test.
 */
import * as Y from 'yjs'
import * as syncProtocol from 'y-protocols/sync'
import * as awarenessProtocol from 'y-protocols/awareness'
import * as encoding from 'lib0/encoding'
import * as decoding from 'lib0/decoding'

const MESSAGE_SYNC = 0
const MESSAGE_AWARENESS = 1

export interface CollabConn {
  send(data: Uint8Array): void
}

interface Room {
  readonly name: string
  readonly doc: Y.Doc
  readonly awareness: awarenessProtocol.Awareness
  readonly conns: Map<CollabConn, Set<number>> // conn → awareness clientIDs it controls
}

export interface CollabHub {
  open(roomName: string, conn: CollabConn, seed: () => string): void
  message(roomName: string, conn: CollabConn, data: Uint8Array): void
  close(roomName: string, conn: CollabConn): void
  /** Current text of a room (for tests/diagnostics), or null if no such room. */
  text(roomName: string): string | null
  roomCount(): number
}

export const createCollabHub = (): CollabHub => {
  const rooms = new Map<string, Room>()

  const reply = (conn: CollabConn, encoder: encoding.Encoder): void => {
    conn.send(encoding.toUint8Array(encoder))
  }
  const broadcast = (room: Room, data: Uint8Array, except?: CollabConn): void => {
    for (const conn of room.conns.keys()) if (conn !== except) conn.send(data)
  }

  const getRoom = (name: string, seed: () => string): Room => {
    const existing = rooms.get(name)
    if (existing) return existing

    const doc = new Y.Doc()
    const initial = seed()
    if (initial) doc.getText('content').insert(0, initial)
    const awareness = new awarenessProtocol.Awareness(doc)
    awareness.setLocalState(null) // the server is not itself a participant

    const room: Room = { name, doc, awareness, conns: new Map() }

    // Relay document updates to every other connection.
    doc.on('update', (update: Uint8Array, origin: unknown) => {
      const encoder = encoding.createEncoder()
      encoding.writeVarUint(encoder, MESSAGE_SYNC)
      syncProtocol.writeUpdate(encoder, update)
      broadcast(room, encoding.toUint8Array(encoder), origin as CollabConn)
    })

    // Relay awareness changes; track which clientIDs each connection owns.
    awareness.on(
      'update',
      (changes: { added: number[]; updated: number[]; removed: number[] }, origin: unknown) => {
        const owned = room.conns.get(origin as CollabConn)
        if (owned) {
          for (const id of changes.added) owned.add(id)
          for (const id of changes.removed) owned.delete(id)
        }
        const changed = changes.added.concat(changes.updated, changes.removed)
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(encoder, awarenessProtocol.encodeAwarenessUpdate(awareness, changed))
        broadcast(room, encoding.toUint8Array(encoder))
      },
    )

    rooms.set(name, room)
    return room
  }

  return {
    open(name, conn, seed) {
      const room = getRoom(name, seed)
      room.conns.set(conn, new Set())

      // 1) Kick off sync: send our state vector (SyncStep1).
      const syncEncoder = encoding.createEncoder()
      encoding.writeVarUint(syncEncoder, MESSAGE_SYNC)
      syncProtocol.writeSyncStep1(syncEncoder, room.doc)
      reply(conn, syncEncoder)

      // 2) Send current awareness states so the newcomer sees existing cursors.
      const states = room.awareness.getStates()
      if (states.size > 0) {
        const awEncoder = encoding.createEncoder()
        encoding.writeVarUint(awEncoder, MESSAGE_AWARENESS)
        encoding.writeVarUint8Array(
          awEncoder,
          awarenessProtocol.encodeAwarenessUpdate(room.awareness, Array.from(states.keys())),
        )
        reply(conn, awEncoder)
      }
    },

    message(name, conn, data) {
      const room = rooms.get(name)
      if (!room) return
      const decoder = decoding.createDecoder(data)
      const messageType = decoding.readVarUint(decoder)
      if (messageType === MESSAGE_SYNC) {
        const encoder = encoding.createEncoder()
        encoding.writeVarUint(encoder, MESSAGE_SYNC)
        // origin = conn so our doc.on('update') won't echo back to the sender.
        syncProtocol.readSyncMessage(decoder, encoder, room.doc, conn)
        if (encoding.length(encoder) > 1) reply(conn, encoder)
      } else if (messageType === MESSAGE_AWARENESS) {
        awarenessProtocol.applyAwarenessUpdate(room.awareness, decoding.readVarUint8Array(decoder), conn)
      }
    },

    close(name, conn) {
      const room = rooms.get(name)
      if (!room) return
      const owned = room.conns.get(conn)
      room.conns.delete(conn)
      if (owned && owned.size > 0) {
        awarenessProtocol.removeAwarenessStates(room.awareness, Array.from(owned), null)
      }
      if (room.conns.size === 0) {
        room.doc.destroy()
        rooms.delete(name)
      }
    },

    text(name) {
      const room = rooms.get(name)
      return room ? room.doc.getText('content').toString() : null
    },
    roomCount() {
      return rooms.size
    },
  }
}
