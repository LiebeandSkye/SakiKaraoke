import { useEffect, useRef, useState } from 'react'
import { socket } from '../api/socket.js'
import { useRoom } from '../context/RoomContext.jsx'
import { roomController } from '../three/roomController.js'
import { IoMicSharp, IoTvOutline } from 'react-icons/io5'

const TIPS = ['W A S D  move', 'Shift  run', 'Space  jump', 'Drag  look', 'Hold E  TV']

/**
 * The 3D karaoke room: WebGL canvas + CSS3D TV + HUD. All per-frame work lives in
 * `roomController` (outside React) so React only re-renders on room/network changes.
 */
export default function KaraokeRoom3D({ onTvElement, onOpenTv, tvOpen }) {
  const { room, user, changeCharacter, isConnected } = useRoom()
  const hostRef = useRef(null)
  const ringRef = useRef(null)
  const [loadPct, setLoadPct] = useState(0)
  const [ready, setReady] = useState(false)

  const cbRef = useRef({ onTvElement, onOpenTv })
  useEffect(() => {
    cbRef.current = { onTvElement, onOpenTv }
  })

  // Mount the renderer once
  useEffect(() => {
    let lastPct = -1
    const code = room?.code
    const uid = user?.id || socket.id
    roomController.mount(hostRef.current, {
      onTvElement: (el) => cbRef.current.onTvElement?.(el),
      onOpenTv: () => cbRef.current.onOpenTv?.(),
      onProgress: (p) => {
        const pct = Math.round(p * 100)
        if (pct !== lastPct) {
          lastPct = pct
          setLoadPct(pct)
        }
      },
      onReady: () => setReady(true),
      onHoldProgress: (p) => ringRef.current?.style.setProperty('--p', String(p)),
    })
    if (code) {
      roomController.setNetwork({
        send: (pose) => socket.volatile.emit('player-pose', { roomCode: code, ...pose }),
      })
    }
    if (room?.users && uid) {
      roomController.syncUsers(room.users, uid)
    }
    const playingNow = Boolean(room?.currentSong && room?.playback?.isPlaying)
    roomController.setPlayback(playingNow ? room.playback : null, room?.currentSingerId)
    roomController.setInputEnabled(!tvOpen)
    return () => roomController.unmount()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roomCode = room?.code
  const myId = user?.id || socket.id

  // Pose relay: send ours at 15Hz (volatile), receive everyone else's
  useEffect(() => {
    if (!roomCode) return undefined
    roomController.setNetwork({
      send: (pose) => socket.volatile.emit('player-pose', { roomCode, ...pose }),
    })
    const onPose = (pose) => roomController.onRemotePose(pose)
    socket.on('player-pose', onPose)
    return () => {
      socket.off('player-pose', onPose)
      roomController.setNetwork(null)
    }
  }, [roomCode])

  useEffect(() => {
    if (room?.users && myId) roomController.syncUsers(room.users, myId)
  }, [room?.users, myId])

  const isPlaying = Boolean(room?.currentSong && room?.playback?.isPlaying)
  useEffect(() => {
    roomController.setPlayback(isPlaying ? room.playback : null, room?.currentSingerId)
  }, [isPlaying, room?.playback, room?.currentSingerId])

  useEffect(() => {
    roomController.setInputEnabled(!tvOpen)
  }, [tvOpen])

  const users = room?.users || []
  const singer = users.find((u) => u.id === room?.currentSingerId)
  const myCharacter = user?.character || 'miku'

  const copyCode = () => navigator.clipboard?.writeText(roomCode || '')

  return (
    <div className="room3d-root">
      <div ref={hostRef} className="room3d-host" />

      {!ready && (
        <div className="room-loader" role="status" aria-live="polite">
          <div className="room-loader-card">
            <IoMicSharp className="room-loader-icon" />
            <h2>Setting up the karaoke room</h2>
            <div className="room-loader-bar">
              <span style={{ transform: `scaleX(${Math.max(0.04, loadPct / 100)})` }} />
            </div>
            <p>{loadPct < 100 ? `Loading your character… ${loadPct}%` : 'Almost ready…'}</p>
          </div>
        </div>
      )}

      <div className="room-hud room-hud-top-left">
        <button type="button" className="room-chip room-code-chip" onClick={copyCode} title="Copy room code">
          <span className="room-chip-label">ROOM</span>
          <strong>{roomCode}</strong>
        </button>
        <span className="room-chip">
          {users.length} in room
        </span>
      </div>

      {room?.currentSong && (
        <div className="room-hud room-hud-top-center">
          <span className="room-chip room-now-playing">
            <IoMicSharp /> {singer?.displayName || 'Singer'} · {room.currentSong.title}
          </span>
        </div>
      )}

      <div className="room-hud room-hud-top-right">
        <div className="room-char-switch" role="group" aria-label="Switch character">
          {['miku', 'teto'].map((c) => (
            <button
              key={c}
              type="button"
              className={myCharacter === c ? 'active' : ''}
              onClick={() => changeCharacter(c)}
            >
              {c === 'miku' ? 'Miku' : 'Teto'}
            </button>
          ))}
        </div>
        <span className={`room-conn ${isConnected ? 'ok' : 'down'}`} title={isConnected ? 'Realtime connected' : 'Reconnecting…'} />
      </div>

      <div className="room-hud room-hud-bottom">
        <button type="button" className="room-tv-hint" onClick={onOpenTv}>
          <span ref={ringRef} className="room-hold-ring" style={{ '--p': 0 }}>
            <kbd>E</kbd>
          </span>
          <span>
            <IoTvOutline /> Hold to open TV
          </span>
        </button>
        <div className="room-tips" aria-hidden="true">
          {TIPS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>
    </div>
  )
}
