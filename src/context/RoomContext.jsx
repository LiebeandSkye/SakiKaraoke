/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useEffect } from 'react'
import { socket } from '../api/socket.js'

const RoomContext = createContext(null)

export function RoomProvider({ children }) {
  const [room, setRoom] = useState(null)
  const [user, setUser] = useState(null)
  const [isConnected, setIsConnected] = useState(socket.connected)
  const [error, setError] = useState(null)

  const clearError = () => setError(null)

  useEffect(() => {
    function onConnect() {
      setIsConnected(true)
    }

    function onDisconnect() {
      setIsConnected(false)
      // Reset local state on clean disconnect
      setRoom(null)
      setUser(null)
    }

    function onRoomUpdate(updatedRoom) {
      setRoom(updatedRoom)
      if (updatedRoom && Array.isArray(updatedRoom.users)) {
        // Try socket.id first, then fall back to the already-known user id
        setUser((currentUser) => {
          const lookupId = socket.id || currentUser?.id
          return updatedRoom.users.find((u) => u.id === lookupId) ?? currentUser
        })
      }
    }

    socket.on('connect', onConnect)
    socket.on('disconnect', onDisconnect)
    socket.on('room-update', onRoomUpdate)

    return () => {
      socket.off('connect', onConnect)
      socket.off('disconnect', onDisconnect)
      socket.off('room-update', onRoomUpdate)
    }
  }, [])

  const createRoom = (displayName) => {
    setError(null)
    if (!displayName || !displayName.trim()) {
      setError('Display name is required')
      return
    }

    // Ensure socket is connected before emitting
    if (!socket.connected) {
      socket.once('connect', () => createRoom(displayName))
      socket.connect()
      return
    }

    socket.emit('create-room', { displayName }, (res) => {
      if (res.ok) {
        setRoom(res.room)
        // The host is the creator — use hostId to reliably find ourselves
        if (res.room && Array.isArray(res.room.users)) {
          const me = res.room.users.find((u) => u.id === res.room.hostId)
          if (me) setUser(me)
        }
      } else {
        setError(res.error || 'Failed to create room')
      }
    })
  }

  const joinRoom = (roomCode, displayName) => {
    setError(null)
    if (!roomCode || !roomCode.trim()) {
      setError('Room code is required')
      return
    }
    if (!displayName || !displayName.trim()) {
      setError('Display name is required')
      return
    }

    // Ensure socket is connected before emitting
    if (!socket.connected) {
      socket.once('connect', () => joinRoom(roomCode, displayName))
      socket.connect()
      return
    }

    socket.emit('join-room', { roomCode: roomCode.trim(), displayName }, (res) => {
      if (res.ok) {
        setRoom(res.room)
        if (res.room && Array.isArray(res.room.users)) {
          // Use socket.id to find ourselves in the joined room
          const me = res.room.users.find((u) => u.id === socket.id)
          if (me) setUser(me)
        }
      } else {
        setError(res.error || 'Failed to join room')
      }
    })
  }

  // addSong accepts either a YouTube URL string or a lrclib song object
  const addSong = (urlOrLrclibSong) => {
    if (!room) return
    setError(null)
    const payload =
      typeof urlOrLrclibSong === 'string'
        ? { roomCode: room.code, url: urlOrLrclibSong }
        : { roomCode: room.code, lrclibSong: urlOrLrclibSong }
    socket.emit('add-song', payload, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to add song')
      }
    })
  }

  const controlPlayback = (type, timeSec, isPlaying) => {
    if (!room) return
    socket.emit('host-control', { roomCode: room.code, type, timeSec, isPlaying }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to apply playback control')
      }
    })
  }

  const playNext = () => {
    if (!room) return
    socket.emit('next-song', { roomCode: room.code }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to skip song')
      }
    })
  }

  const advanceRotation = (reason) => {
    if (!room) return
    socket.emit('advance-singer', { roomCode: room.code, reason }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to advance singer rotation')
      }
    })
  }

  const changeRotationMode = (mode) => {
    if (!room) return
    socket.emit('set-rotation-mode', { roomCode: room.code, mode }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to set rotation mode')
      }
    })
  }

  const setLyricsOffset = (offsetSec) => {
    if (!room) return
    socket.emit('set-lyrics-offset', { roomCode: room.code, offsetSec }, (res) => {
      if (!res.ok) {
        setError(res.error || 'Failed to adjust lyrics sync')
      }
    })
  }

  const leaveRoom = () => {
    socket.disconnect()
    // Instantly reconnect so client is ready for a new room
    setTimeout(() => {
      socket.connect()
    }, 100)
    setRoom(null)
    setUser(null)
    setError(null)
  }

  return (
    <RoomContext.Provider
      value={{
        room,
        user,
        isConnected,
        error,
        setError,
        clearError,
        createRoom,
        joinRoom,
        addSong,
        controlPlayback,
        playNext,
        advanceRotation,
        changeRotationMode,
        setLyricsOffset,
        leaveRoom,
      }}
    >
      {children}
    </RoomContext.Provider>
  )
}

export function useRoom() {
  const context = useContext(RoomContext)
  if (!context) {
    throw new Error('useRoom must be used within a RoomProvider')
  }
  return context
}
