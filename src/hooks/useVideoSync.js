import { useEffect, useRef } from 'react'
import { socket } from '../api/socket.js'
import { readMediaTime, seekMediaTo } from '../shared/mediaElement.js'
import { getRemoteTargetTime, SYNC_PING_INTERVAL_MS } from '../shared/playbackSync.js'

export function useVideoSync({
  playerRef,
  room,
  user,
  isPlaying,
  setIsPlaying,
}) {
  const isHost = user?.isHost
  const roomCode = room?.code
  const isHostRef = useRef(isHost)
  const roomCodeRef = useRef(roomCode)
  const isPlayingRef = useRef(isPlaying)

  // Sync refs to avoid breaking useEffect on state change
  useEffect(() => {
    isHostRef.current = isHost
    roomCodeRef.current = roomCode
    isPlayingRef.current = isPlaying
  }, [isHost, roomCode, isPlaying])

  // 1. Listen for immediate host playback controls (for guests)
  useEffect(() => {
    if (!roomCode) return

    function onPlaybackControl(control) {
      if (isHostRef.current) return // Host ignores incoming playback control commands

      console.log('Received playback-control:', control)
      
      // Determine if we should play or pause
      const targetPlaying = control.playback.isPlaying
      setIsPlaying(targetPlaying)

      // Calculate target time based on server playback timestamp math
      const targetTimeSec = getRemoteTargetTime(control.playback, Date.now())
      
      seekMediaTo(playerRef.current, targetTimeSec)
    }

    socket.on('playback-control', onPlaybackControl)

    return () => {
      socket.off('playback-control', onPlaybackControl)
    }
  }, [roomCode, playerRef, setIsPlaying])

  // 2. Host Heartbeat & Client Drift Sync loop
  useEffect(() => {
    if (!roomCode) return

    const interval = setInterval(() => {
      if (!playerRef.current) return

      const player = playerRef.current
      // Try to get current time. If player is not loaded, it might return 0 or throw
      let currentTime
      try {
        currentTime = readMediaTime(player)
      } catch (err) {
        console.warn('Could not read player current time', err)
        return
      }

      if (isHostRef.current) {
        // HOST: Send heartbeat to update server's authoritative playback state
        socket.emit('host-heartbeat', {
          roomCode: roomCodeRef.current,
          timeSec: currentTime,
          isPlaying: isPlayingRef.current,
        })
      } else {
        // CLIENT: Sync ping the server to check for playback drift
        socket.emit(
          'sync-ping',
          {
            roomCode: roomCodeRef.current,
            localTimeSec: currentTime,
          },
          (res) => {
            if (res && res.ok) {
              const { correction, playback } = res
              
              // Correct drift if server advises us to
              if (correction.shouldCorrect) {
                console.log(`Drift detected: ${correction.driftSec}s. Re-syncing...`)
                seekMediaTo(player, correction.targetTimeSec)
              }
              
              // Ensure playing status is aligned
              if (playback.isPlaying !== isPlayingRef.current) {
                setIsPlaying(playback.isPlaying)
              }
            }
          }
        )
      }
    }, SYNC_PING_INTERVAL_MS)

    return () => clearInterval(interval)
  }, [roomCode, playerRef, setIsPlaying])
}
