import express from 'express'
import { createServer } from 'node:http'
import { Server } from 'socket.io'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { env } from 'node:process'

import { createRoomStore } from './roomStore.js'
import { fetchLyricsForMetadata } from './lrclib.js'
import { fetchYoutubeMetadata, searchYoutubeForSong } from './youtube.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const app = express()
const server = createServer(app)

// Enable CORS for frontend
const CORS_ORIGIN = env.FRONTEND_URL || '*'
app.use(cors({ origin: CORS_ORIGIN }))
app.use(express.json())

// Serve static frontend files in production
const distPath = path.join(__dirname, '../dist')
app.use(express.static(distPath))

// Simple status endpoint
app.get('/api/status', (req, res) => {
  res.json({ ok: true, service: 'SakiKaraoke Backend' })
})

// Lrclib search proxy — avoids CORS issues from the browser
app.get('/api/search', async (req, res) => {
  const q = (req.query.q || '').trim()
  if (!q) return res.json([])
  try {
    const lrclibRes = await fetch(`https://lrclib.net/api/search?q=${encodeURIComponent(q)}`, {
      headers: { 'Lrclib-Client': 'SakiKaraoke/1.0 (https://github.com/sakikaraoke)' },
    })
    if (!lrclibRes.ok) return res.status(502).json({ error: 'lrclib unavailable' })
    const results = await lrclibRes.json()
    // Return up to 20 results with only the fields we need
    const filtered = results.slice(0, 20).map((r) => ({
      id: r.id,
      trackName: r.trackName,
      artistName: r.artistName,
      albumName: r.albumName,
      duration: r.duration,
      instrumental: r.instrumental,
      hasSyncedLyrics: !!r.syncedLyrics,
      syncedLyrics: r.syncedLyrics ?? null,
      plainLyrics: r.plainLyrics ?? null,
    }))
    res.json(filtered)
  } catch (err) {
    console.error('lrclib search error:', err)
    res.status(500).json({ error: 'Search failed' })
  }
})

// Serve index.html for spa routing in production
app.use((req, res, next) => {
  if (req.path.startsWith('/api') || req.path.startsWith('/socket.io')) {
    return next()
  }
  res.sendFile(path.join(distPath, 'index.html'), (err) => {
    if (err) {
      res.status(200).send('SakiKaraoke Backend is running. Run npm run dev to access the frontend.')
    }
  })
})

const io = new Server(server, {
  cors: {
    origin: CORS_ORIGIN,
    methods: ['GET', 'POST'],
  },
})

const store = createRoomStore()

io.on('connection', (socket) => {
  console.log(`Socket connected: ${socket.id}`)

  // Create Room
  socket.on('create-room', ({ displayName }, callback) => {
    try {
      const result = store.createRoom({ socketId: socket.id, displayName })
      if (result.ok) {
        socket.join(result.room.code)
        console.log(`Room created: ${result.room.code} by ${displayName} (${socket.id})`)
        callback({ ok: true, room: result.room })
      } else {
        callback({ ok: false, error: result.error || 'Failed to create room' })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Join Room
  socket.on('join-room', ({ roomCode, displayName }, callback) => {
    try {
      const result = store.joinRoom({ roomCode, socketId: socket.id, displayName })
      if (result.ok) {
        socket.join(result.room.code)
        console.log(`Socket ${socket.id} joined room ${result.room.code}`)
        
        // Notify others in the room
        io.to(result.room.code).emit('room-update', result.room)
        
        callback({ ok: true, room: result.room })
      } else {
        callback({ ok: false, error: result.error || 'Room not found' })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Add Song — accepts { roomCode, url } OR { roomCode, lrclibSong }
  socket.on('add-song', async ({ roomCode, url, lrclibSong }, callback) => {
    try {
      const room = store.getRoom(roomCode)
      if (!room) {
        return callback({ ok: false, error: 'Room not found' })
      }

      let songMetadata

      if (lrclibSong) {
        // Song selected from lrclib search — find the YouTube video
        const ytResult = await searchYoutubeForSong(lrclibSong.trackName, lrclibSong.artistName)
        if (!ytResult) {
          return callback({
            ok: false,
            error:
              'Could not find a karaoke version on YouTube for this song. Try pasting a karaoke YouTube URL instead.',
          })
        }
        songMetadata = {
          videoId: ytResult.videoId,
          url: ytResult.url,
          title: `${lrclibSong.artistName} - ${lrclibSong.trackName}`,
          thumbnail: ytResult.thumbnail,
          durationSec: lrclibSong.duration ?? null,
          lrclibId: lrclibSong.lrclibId ?? lrclibSong.id ?? null,
          trackName: lrclibSong.trackName ?? null,
          artistName: lrclibSong.artistName ?? null,
          albumName: lrclibSong.albumName ?? null,
          instrumental: Boolean(lrclibSong.instrumental),
          syncedLyrics: lrclibSong.syncedLyrics ?? null,
          plainLyrics: lrclibSong.plainLyrics ?? null,
        }
      } else if (url) {
        songMetadata = await fetchYoutubeMetadata(url)
        try {
          const lyrics = await fetchLyricsForMetadata(songMetadata)
          if (lyrics) {
            songMetadata = {
              ...songMetadata,
              lrclibId: lyrics.lrclibId ?? null,
              trackName: lyrics.trackName ?? null,
              artistName: lyrics.artistName ?? null,
              albumName: lyrics.albumName ?? null,
              instrumental: Boolean(lyrics.instrumental),
              syncedLyrics: lyrics.syncedLyrics ?? null,
              plainLyrics: lyrics.plainLyrics ?? null,
            }
          }
        } catch (lyricsError) {
          console.warn('Could not fetch LRCLIB lyrics for YouTube URL:', lyricsError.message)
        }
      } else {
        return callback({ ok: false, error: 'Provide a YouTube URL or select a song from search' })
      }

      const result = store.addSong({
        roomCode,
        socketId: socket.id,
        song: songMetadata,
      })

      if (result.ok) {
        io.to(room.code).emit('room-update', result.room)
        callback({ ok: true, song: result.song })
      } else {
        callback({ ok: false, error: result.error || 'Failed to add song' })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Skip / Play Next Song
  socket.on('next-song', ({ roomCode }, callback) => {
    try {
      const room = store.getRoom(roomCode)
      if (!room) {
        return callback({ ok: false, error: 'Room not found' })
      }

      // Only host can skip songs
      if (room.hostId !== socket.id) {
        return callback({ ok: false, error: 'Only the host can skip songs' })
      }

      const result = store.playNextSong(roomCode)
      if (result.ok) {
        io.to(room.code).emit('room-update', result.room)
        callback({ ok: true })
      } else {
        callback({ ok: false, error: result.error || 'Failed to play next song' })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Host Playback Control (play, pause, seek)
  socket.on('host-control', ({ roomCode, type, timeSec, isPlaying }, callback) => {
    try {
      const room = store.getRoom(roomCode)
      if (!room) {
        return callback({ ok: false, error: 'Room not found' })
      }

      const result = store.applyHostControl({
        roomCode,
        socketId: socket.id,
        type,
        timeSec,
        isPlaying,
      })

      if (result.ok) {
        // Emit control action to all other sockets in the room so they act immediately
        socket.to(room.code).emit('playback-control', result.control)
        
        // Broadcast the full room state update to all sockets
        io.to(room.code).emit('room-update', result.room)
        
        callback({ ok: true })
      } else {
        callback({ ok: false, error: result.error || 'Control failed' })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Host Heartbeat
  socket.on('host-heartbeat', ({ roomCode, timeSec, isPlaying }) => {
    try {
      store.hostHeartbeat({ roomCode, socketId: socket.id, timeSec, isPlaying })
    } catch {
      // Slient fail for heartbeat logging to avoid spam
    }
  })

  // Sync Ping (drift check)
  socket.on('sync-ping', ({ roomCode, localTimeSec }, callback) => {
    try {
      const result = store.getSyncState({ roomCode, localTimeSec })
      if (result.ok) {
        callback({
          ok: true,
          expectedTimeSec: result.expectedTimeSec,
          playback: result.playback,
          correction: result.correction,
        })
      } else {
        callback({ ok: false, error: result.error || 'Sync failed' })
      }
    } catch (err) {
      callback({ ok: false, error: err.message })
    }
  })

  // Advance Singer Rotation
  socket.on('advance-singer', ({ roomCode, reason }, callback) => {
    try {
      const room = store.getRoom(roomCode)
      if (!room) {
        return callback({ ok: false, error: 'Room not found' })
      }

      const result = store.advanceSinger({ roomCode, reason })
      if (result.ok) {
        io.to(room.code).emit('room-update', result.room)
        if (callback) callback({ ok: true })
      } else {
        if (callback) callback({ ok: false, error: result.error })
      }
    } catch (err) {
      console.error(err)
      if (callback) callback({ ok: false, error: err.message })
    }
  })

  // Set Rotation Mode
  socket.on('set-rotation-mode', ({ roomCode, mode }, callback) => {
    try {
      const room = store.getRoom(roomCode)
      if (!room) {
        return callback({ ok: false, error: 'Room not found' })
      }

      if (room.hostId !== socket.id) {
        return callback({ ok: false, error: 'Only host can change rotation mode' })
      }

      const result = store.setRotationMode({ roomCode, mode })
      if (result.ok) {
        io.to(room.code).emit('room-update', result.room)
        callback({ ok: true })
      } else {
        callback({ ok: false, error: result.error })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Set Lyrics Offset (host adjusts sync when karaoke video timing differs from studio track)
  socket.on('set-lyrics-offset', ({ roomCode, offsetSec }, callback) => {
    try {
      const result = store.setLyricsOffset({
        roomCode,
        socketId: socket.id,
        offsetSec,
      })

      if (result.ok) {
        io.to(result.room.code).emit('room-update', result.room)
        callback({ ok: true })
      } else {
        callback({ ok: false, error: result.error })
      }
    } catch (err) {
      console.error(err)
      callback({ ok: false, error: err.message })
    }
  })

  // Disconnect
  socket.on('disconnecting', () => {
    try {
      const result = store.leaveRoom(socket.id)
      if (result.ok) {
        if (result.deleted) {
          console.log(`Room ${result.roomCode} deleted because all users left`)
        } else {
          console.log(`Socket ${socket.id} left room ${result.room.code}`)
          io.to(result.room.code).emit('room-update', result.room)
        }
      }
    } catch (err) {
      console.error('Error on disconnect:', err)
    }
  })

  socket.on('disconnect', () => {
    console.log(`Socket disconnected: ${socket.id}`)
  })
})

const PORT = env.PORT || 3001
server.listen(PORT, () => {
  console.log(`SakiKaraoke backend server listening on port ${PORT}`)
})
