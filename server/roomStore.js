import { randomInt, randomUUID } from 'node:crypto'

import {
  DEFAULT_CONTROL_DELAY_MS,
  expectedPlaybackTime,
  getDriftCorrection,
  scheduleControl,
} from '../src/shared/playbackSync.js'
import { nextSingerState, normalizeRotation } from '../src/shared/rotation.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function defaultMakeCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

function normalizeRoomCode(roomCode) {
  return String(roomCode ?? '').trim().toUpperCase()
}

function makeUser(socketId, displayName, isHost) {
  return {
    id: socketId,
    displayName: String(displayName || 'Singer').trim().slice(0, 40) || 'Singer',
    isHost,
  }
}

function serializeRoom(room, nowMs = Date.now()) {
  return {
    code: room.code,
    hostId: room.hostId,
    users: [...room.users.values()],
    queue: room.queue,
    currentSong: room.currentSong,
    playback: room.playback,
    rotation: normalizeRotation(room.rotation),
    currentSingerId: room.rotation.singerIds.at(room.rotation.currentSingerIndex) ?? null,
    expectedTimeSec: expectedPlaybackTime(room.playback, nowMs),
  }
}

export function createRoomStore({
  now = () => Date.now(),
  makeCode = defaultMakeCode,
  makeId = randomUUID,
} = {}) {
  const rooms = new Map()
  const socketRooms = new Map()

  function getRoom(roomCode) {
    return rooms.get(normalizeRoomCode(roomCode)) ?? null
  }

  function publicState(room) {
    return serializeRoom(room, now())
  }

  function createUniqueCode() {
    for (let attempt = 0; attempt < 25; attempt += 1) {
      const code = normalizeRoomCode(makeCode())
      if (/^[A-Z0-9]{6}$/.test(code) && !rooms.has(code)) return code
    }

    throw new Error('Could not generate a unique room code')
  }

  function createRoom({ socketId, displayName }) {
    const code = createUniqueCode()
    const user = makeUser(socketId, displayName, true)
    const room = {
      code,
      hostId: socketId,
      users: new Map([[socketId, user]]),
      queue: [],
      currentSong: null,
      playback: {
        isPlaying: false,
        timeSec: 0,
        updatedAtMs: now(),
        version: 0,
      },
      rotation: {
        singerIds: [socketId],
        currentSingerIndex: 0,
        mode: 'auto',
      },
    }

    rooms.set(code, room)
    socketRooms.set(socketId, code)

    return { ok: true, room: publicState(room) }
  }

  function joinRoom({ roomCode, socketId, displayName }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }

    const user = makeUser(socketId, displayName, false)
    room.users.set(socketId, user)

    if (!room.rotation.singerIds.includes(socketId)) {
      room.rotation.singerIds.push(socketId)
    }

    socketRooms.set(socketId, room.code)

    return { ok: true, room: publicState(room) }
  }

  function leaveRoom(socketId) {
    const roomCode = socketRooms.get(socketId)
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }

    room.users.delete(socketId)
    socketRooms.delete(socketId)
    room.rotation.singerIds = room.rotation.singerIds.filter((id) => id !== socketId)
    room.rotation = normalizeRotation(room.rotation)

    if (room.users.size === 0) {
      rooms.delete(room.code)
      return { ok: true, deleted: true, roomCode: room.code }
    }

    if (room.hostId === socketId) {
      room.hostId = room.users.keys().next().value
      const host = room.users.get(room.hostId)
      room.users.set(room.hostId, { ...host, isHost: true })
    }

    return { ok: true, room: publicState(room) }
  }

  function addSong({ roomCode, socketId, song }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (!room.users.has(socketId)) return { ok: false, error: 'Join the room before adding songs' }

    const queuedSong = {
      id: makeId(),
      videoId: song.videoId,
      url: song.url,
      title: song.title,
      thumbnail: song.thumbnail,
      durationSec: song.durationSec ?? null,
      lrclibId: song.lrclibId ?? null,
      trackName: song.trackName ?? null,
      syncedLyrics: song.syncedLyrics ?? null,
      plainLyrics: song.plainLyrics ?? null,
      artistName: song.artistName ?? null,
      albumName: song.albumName ?? null,
      instrumental: Boolean(song.instrumental),
      addedBy: socketId,
      addedAtMs: now(),
    }

    // If no song is currently playing, auto-promote this song and wait for host play.
    // This avoids browser autoplay-with-sound blocking before the host interacts.
    if (!room.currentSong) {
      room.currentSong = queuedSong
      room.playback = {
        isPlaying: false,
        timeSec: 0,
        updatedAtMs: now(),
        version: room.playback.version + 1,
      }
    } else {
      room.queue.push(queuedSong)
    }

    return { ok: true, song: queuedSong, room: publicState(room) }
  }

  function playNextSong(roomCode) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }

    const nextSong = room.queue.shift() ?? null
    room.currentSong = nextSong
    room.playback = {
      // Auto-play if there is a next song, otherwise stop
      isPlaying: nextSong !== null,
      timeSec: 0,
      updatedAtMs: now(),
      version: room.playback.version + 1,
    }

    return { ok: true, room: publicState(room) }
  }

  function applyHostControl({
    roomCode,
    socketId,
    type,
    timeSec,
    isPlaying,
    delayMs = DEFAULT_CONTROL_DELAY_MS,
  }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (room.hostId !== socketId) return { ok: false, error: 'Only the host can control playback' }

    const control = scheduleControl({
      nowMs: now(),
      delayMs,
      type,
      playback: {
        isPlaying: Boolean(isPlaying),
        timeSec: Number.isFinite(Number(timeSec))
          ? Number(timeSec)
          : expectedPlaybackTime(room.playback, now()),
        version: room.playback.version,
      },
    })

    room.playback = control.playback

    return { ok: true, control, room: publicState(room) }
  }

  function hostHeartbeat({ roomCode, socketId, timeSec, isPlaying }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (room.hostId !== socketId) return { ok: false, error: 'Only the host can update heartbeat' }

    room.playback = {
      ...room.playback,
      isPlaying: Boolean(isPlaying),
      timeSec: Number(timeSec) || 0,
      updatedAtMs: now(),
    }

    return { ok: true, room: publicState(room) }
  }

  function getSyncState({ roomCode, localTimeSec }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }

    const expectedTimeSec = expectedPlaybackTime(room.playback, now())

    return {
      ok: true,
      expectedTimeSec,
      playback: room.playback,
      correction: getDriftCorrection({ expectedTimeSec, localTimeSec }),
    }
  }

  function advanceSinger({ roomCode, reason }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }

    room.rotation = normalizeRotation(nextSingerState(room.rotation, reason))

    return { ok: true, room: publicState(room) }
  }

  function setRotationMode({ roomCode, mode }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (!['auto', 'segment', 'song'].includes(mode)) {
      return { ok: false, error: 'Invalid rotation mode' }
    }

    room.rotation = normalizeRotation({ ...room.rotation, mode })

    return { ok: true, room: publicState(room) }
  }

  return {
    addSong,
    advanceSinger,
    applyHostControl,
    createRoom,
    getRoom,
    getSyncState,
    hostHeartbeat,
    joinRoom,
    leaveRoom,
    playNextSong,
    publicState,
    setRotationMode,
  }
}
