import { randomInt, randomUUID } from 'node:crypto'

import {
  DEFAULT_CONTROL_DELAY_MS,
  expectedPlaybackTime,
  getDriftCorrection,
  scheduleControl,
} from '../src/shared/playbackSync.js'
import { nextSingerState, normalizeRotation } from '../src/shared/rotation.js'
import { DRINK_CATALOG, SEAT_MAP, TABLE_SLOTS, TABLE_SLOT_MAP } from '../src/shared/barSystem.js'

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

function defaultMakeCode() {
  return Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('')
}

function normalizeRoomCode(roomCode) {
  return String(roomCode ?? '').trim().toUpperCase()
}

function normalizeCharacter(character) {
  const c = String(character || 'miku').trim().toLowerCase()
  return c === 'teto' ? 'teto' : 'miku'
}

function makeUser(socketId, displayName, isHost, character = 'miku') {
  return {
    id: socketId,
    displayName: String(displayName || 'Singer').trim().slice(0, 40) || 'Singer',
    isHost,
    character: normalizeCharacter(character),
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
    bartenderId: room.bartenderId ?? null,
    seats: { ...(room.seats || {}) },
    tableDrinks: [...(room.tableDrinks || [])],
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

  function createRoom({ socketId, displayName, username, character = 'miku' }) {
    const code = createUniqueCode()
    const user = makeUser(socketId, displayName ?? username, true, character)
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
      bartenderId: null,
      seats: {},
      tableDrinks: [],
    }

    rooms.set(code, room)
    socketRooms.set(socketId, code)

    return { ok: true, room: publicState(room) }
  }

  function joinRoom({ roomCode, roomId, socketId, displayName, username, character = 'miku' }) {
    const room = getRoom(roomCode ?? roomId)
    if (!room) return { ok: false, error: 'Room not found' }

    const user = makeUser(socketId, displayName ?? username, false, character)
    room.users.set(socketId, user)

    if (!room.rotation.singerIds.includes(socketId)) {
      room.rotation.singerIds.push(socketId)
    }

    socketRooms.set(socketId, room.code)

    return { ok: true, room: publicState(room) }
  }

  function setCharacter({ roomCode, socketId, character }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    const existing = room.users.get(socketId)
    if (!existing) return { ok: false, error: 'User not in room' }

    room.users.set(socketId, {
      ...existing,
      character: normalizeCharacter(character),
    })

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

    if (room.bartenderId === socketId) {
      room.bartenderId = null
    }
    if (room.seats) {
      for (const [seatId, holderId] of Object.entries(room.seats)) {
        if (holderId === socketId) delete room.seats[seatId]
      }
    }

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
      lyricsOffsetSec: Number(song.lyricsOffsetSec) || 0,
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

  function setLyricsOffset({ roomCode, socketId, offsetSec }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (room.hostId !== socketId) return { ok: false, error: 'Only the host can adjust lyrics offset' }
    if (!room.currentSong) return { ok: false, error: 'No song is playing' }

    const offset = Number(offsetSec)
    if (!Number.isFinite(offset)) return { ok: false, error: 'Invalid offset' }

    room.currentSong = {
      ...room.currentSong,
      lyricsOffsetSec: Math.max(-30, Math.min(30, offset)),
    }

    return { ok: true, room: publicState(room) }
  }

  function claimBartender({ roomCode, socketId }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (!room.users.has(socketId)) return { ok: false, error: 'User not in room' }
    if (room.bartenderId && room.bartenderId !== socketId && room.users.has(room.bartenderId)) {
      return { ok: false, error: 'Another player is currently the bartender' }
    }
    for (const [seatId, holderId] of Object.entries(room.seats)) {
      if (holderId === socketId) delete room.seats[seatId]
    }
    room.bartenderId = socketId
    return { ok: true, room: publicState(room) }
  }

  function releaseBartender({ roomCode, socketId }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (room.bartenderId === socketId) {
      room.bartenderId = null
    }
    return { ok: true, room: publicState(room) }
  }

  function sitOnSeat({ roomCode, socketId, seatId }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (!room.users.has(socketId)) return { ok: false, error: 'User not in room' }
    if (!SEAT_MAP.has(seatId)) return { ok: false, error: 'Invalid seat' }
    const holder = room.seats[seatId]
    if (holder && holder !== socketId && room.users.has(holder)) {
      return { ok: false, error: 'Seat is already taken' }
    }
    for (const [sId, hId] of Object.entries(room.seats)) {
      if (hId === socketId) delete room.seats[sId]
    }
    if (room.bartenderId === socketId) {
      room.bartenderId = null
    }
    room.seats[seatId] = socketId
    return { ok: true, seatId, room: publicState(room) }
  }

  function standFromSeat({ roomCode, socketId }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    for (const [sId, hId] of Object.entries(room.seats)) {
      if (hId === socketId) delete room.seats[sId]
    }
    return { ok: true, room: publicState(room) }
  }

  function placeDrink({ roomCode, socketId, drinkKey, quality = 3, sips, slotId, preferredSurface = 'bar' }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    const user = room.users.get(socketId)
    if (!user) return { ok: false, error: 'User not in room' }

    const recipe = DRINK_CATALOG[drinkKey] || DRINK_CATALOG.miku_fizz
    const usedSlots = new Set(room.tableDrinks.map((d) => d.slotId))

    let chosenSlot = slotId && TABLE_SLOT_MAP.get(slotId)
    if (!chosenSlot || usedSlots.has(chosenSlot.id)) {
      chosenSlot =
        TABLE_SLOTS.find((s) => s.surface === preferredSurface && !usedSlots.has(s.id)) ||
        TABLE_SLOTS.find((s) => !usedSlots.has(s.id))
    }
    if (!chosenSlot) {
      return { ok: false, error: 'All bar and table spots are full!' }
    }

    const drink = {
      id: makeId(),
      drinkKey: recipe.key,
      name: recipe.name,
      emoji: recipe.emoji,
      color: recipe.color,
      rimColor: recipe.rimColor,
      strawColor: recipe.strawColor,
      quality: Math.max(1, Math.min(3, Number(quality) || 3)),
      sips: Math.max(1, Math.min(recipe.sips, Number(sips) || recipe.sips)),
      maxSips: recipe.sips,
      madeBy: socketId,
      madeByName: user.displayName,
      slotId: chosenSlot.id,
      createdAtMs: now(),
    }

    room.tableDrinks.push(drink)
    return { ok: true, drink, room: publicState(room) }
  }

  function takeDrink({ roomCode, socketId, drinkId }) {
    const room = getRoom(roomCode)
    if (!room) return { ok: false, error: 'Room not found' }
    if (!room.users.has(socketId)) return { ok: false, error: 'User not in room' }

    const idx = room.tableDrinks.findIndex((d) => d.id === drinkId)
    if (idx === -1) {
      return { ok: false, error: 'Drink was already taken' }
    }
    const [drink] = room.tableDrinks.splice(idx, 1)
    return { ok: true, drink, room: publicState(room) }
  }

  return {
    addSong,
    advanceSinger,
    applyHostControl,
    claimBartender,
    createRoom,
    getRoom,
    getSyncState,
    hostHeartbeat,
    joinRoom,
    leaveRoom,
    placeDrink,
    playNextSong,
    publicState,
    releaseBartender,
    setCharacter,
    setLyricsOffset,
    setRotationMode,
    sitOnSeat,
    standFromSeat,
    takeDrink,
  }
}
