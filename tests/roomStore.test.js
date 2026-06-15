import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { createRoomStore } from '../server/roomStore.js'

describe('room store', () => {
  it('creates a room with a six-character code and host user', () => {
    const store = createRoomStore({
      now: () => 1000,
      makeCode: () => 'ABC123',
      makeId: () => 'song-1',
    })

    const result = store.createRoom({ socketId: 'host', displayName: 'Saki' })

    assert.equal(result.ok, true)
    assert.equal(result.room.code, 'ABC123')
    assert.equal(result.room.hostId, 'host')
    assert.deepEqual(result.room.rotation.singerIds, ['host'])
  })

  it('joins existing rooms and adds users to singer rotation', () => {
    const store = createRoomStore({ now: () => 1000, makeCode: () => 'ABC123' })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })

    const result = store.joinRoom({
      roomCode: 'abc123',
      socketId: 'guest',
      displayName: 'Haru',
    })

    assert.equal(result.ok, true)
    assert.deepEqual(result.room.rotation.singerIds, ['host', 'guest'])
    assert.equal(result.room.users.at(1).displayName, 'Haru')
  })

  it('adds songs to the global queue with submitter information', () => {
    const store = createRoomStore({
      now: () => 1000,
      makeCode: () => 'ABC123',
      makeId: () => 'song-1',
    })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })

    // First song: no active song, should auto-become currentSong and wait for host play
    const result = store.addSong({
      roomCode: 'ABC123',
      socketId: 'host',
      song: {
        videoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Never Gonna Give You Up',
        thumbnail: 'thumb.jpg',
        durationSec: 213,
      },
    })

    assert.equal(result.ok, true)
    assert.equal(result.room.currentSong.id, 'song-1')
    assert.equal(result.room.currentSong.addedBy, 'host')
    assert.equal(result.room.playback.isPlaying, false)
    assert.equal(result.room.queue.length, 0)

    // Second song: active song exists, should go into the queue
    const result2 = store.addSong({
      roomCode: 'ABC123',
      socketId: 'host',
      song: {
        videoId: 'abcdefghijk',
        url: 'https://www.youtube.com/watch?v=abcdefghijk',
        title: 'Another Song',
        thumbnail: 'thumb2.jpg',
        durationSec: 180,
      },
    })

    assert.equal(result2.ok, true)
    assert.equal(result2.room.queue.length, 1)
    assert.equal(result2.room.queue.at(0).title, 'Another Song')
  })

  it('preserves LRCLIB lyrics metadata on queued songs', () => {
    const store = createRoomStore({
      now: () => 1000,
      makeCode: () => 'ABC123',
      makeId: () => 'song-1',
    })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })

    const result = store.addSong({
      roomCode: 'ABC123',
      socketId: 'host',
      song: {
        videoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Artist - Track',
        thumbnail: 'thumb.jpg',
        durationSec: 213,
        lrclibId: 123,
        trackName: 'Track',
        artistName: 'Artist',
        albumName: 'Album',
        instrumental: false,
        syncedLyrics: '[00:01.00] Lyric',
        plainLyrics: 'Lyric',
      },
    })

    assert.equal(result.ok, true)
    assert.equal(result.room.currentSong.lrclibId, 123)
    assert.equal(result.room.currentSong.trackName, 'Track')
    assert.equal(result.room.currentSong.syncedLyrics, '[00:01.00] Lyric')
    assert.equal(result.room.currentSong.plainLyrics, 'Lyric')
    assert.equal(result.room.currentSong.instrumental, false)
    assert.equal(result.room.currentSong.lyricsOffsetSec, 0)
  })

  it('lets the host adjust lyrics offset on the current song', () => {
    const store = createRoomStore({
      now: () => 1000,
      makeCode: () => 'ABC123',
      makeId: () => 'song-1',
    })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })
    store.addSong({
      roomCode: 'ABC123',
      socketId: 'host',
      song: {
        videoId: 'dQw4w9WgXcQ',
        url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        title: 'Artist - Track',
        thumbnail: 'thumb.jpg',
        durationSec: 213,
        syncedLyrics: '[00:01.00] Lyric',
      },
    })

    const result = store.setLyricsOffset({
      roomCode: 'ABC123',
      socketId: 'host',
      offsetSec: 2,
    })

    assert.equal(result.ok, true)
    assert.equal(result.room.currentSong.lyricsOffsetSec, 2)

    const guestAttempt = store.setLyricsOffset({
      roomCode: 'ABC123',
      socketId: 'guest',
      offsetSec: 5,
    })

    assert.deepEqual(guestAttempt, { ok: false, error: 'Only the host can adjust lyrics offset' })
  })


  it('rejects playback controls from non-host users', () => {
    const store = createRoomStore({ now: () => 1000, makeCode: () => 'ABC123' })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })
    store.joinRoom({ roomCode: 'ABC123', socketId: 'guest', displayName: 'Haru' })

    const result = store.applyHostControl({
      roomCode: 'ABC123',
      socketId: 'guest',
      type: 'play',
      timeSec: 15,
      isPlaying: true,
    })

    assert.deepEqual(result, { ok: false, error: 'Only the host can control playback' })
  })

  it('applies host playback controls and reports expected sync time', () => {
    let nowMs = 1000
    const store = createRoomStore({ now: () => nowMs, makeCode: () => 'ABC123' })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })

    const control = store.applyHostControl({
      roomCode: 'ABC123',
      socketId: 'host',
      type: 'play',
      timeSec: 20,
      isPlaying: true,
      delayMs: 250,
    })

    assert.equal(control.ok, true)
    assert.equal(control.control.applyAtMs, 1250)
    nowMs = 3250

    const sync = store.getSyncState({ roomCode: 'ABC123', localTimeSec: 21 })

    assert.equal(sync.ok, true)
    assert.equal(sync.expectedTimeSec, 22)
    assert.equal(sync.correction.shouldCorrect, false)
  })

  it('advances singer rotation based on room mode', () => {
    const store = createRoomStore({ now: () => 1000, makeCode: () => 'ABC123' })
    store.createRoom({ socketId: 'host', displayName: 'Saki' })
    store.joinRoom({ roomCode: 'ABC123', socketId: 'guest', displayName: 'Haru' })

    const result = store.advanceSinger({ roomCode: 'ABC123', reason: 'segment-ended' })

    assert.equal(result.ok, true)
    assert.equal(result.room.rotation.currentSingerIndex, 1)
  })
})
