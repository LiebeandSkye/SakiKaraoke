import { useEffect, useRef, useState, useCallback } from 'react'
import { socket } from '../api/socket.js'
import { useRoom } from '../context/RoomContext.jsx'
import { roomController } from '../three/roomController.js'
import { findNearestFreeTableSlot } from '../shared/barSystem.js'
import BartenderMinigameModal from './BartenderMinigameModal.jsx'
import DrinkHotbar from './DrinkHotbar.jsx'
import { IoMicSharp, IoTvOutline, IoWine } from 'react-icons/io5'

const TIPS = ['W A S D  move', 'Shift  run', 'Space  jump', 'Hold E  interact / sit', '1-9  drink tool', 'F  place drink']

/**
 * The 3D karaoke room: WebGL canvas + CSS3D TV + HUD + Bartender Minigame + Drink Tool Hotbar.
 * All per-frame work lives in `roomController` (outside React) so React only re-renders on room/network changes.
 */
export default function KaraokeRoom3D({ onTvElement, onOpenTv, tvOpen }) {
  const {
    room,
    user,
    changeCharacter,
    isConnected,
    claimBartender,
    releaseBartender,
    sitOnSeat,
    standFromSeat,
    placeDrink,
    takeDrink,
  } = useRoom()

  const hostRef = useRef(null)
  const ringRef = useRef(null)
  const sipTimerRef = useRef(0)
  const toastTimerRef = useRef(0)

  const [loadPct, setLoadPct] = useState(0)
  const [ready, setReady] = useState(false)
  const [bartenderOpen, setBartenderOpen] = useState(false)
  const [inventory, setInventory] = useState([])
  const [equippedIndex, setEquippedIndex] = useState(null)
  const [isSipping, setIsSipping] = useState(false)
  const [interaction, setInteraction] = useState({ type: 'open-tv', label: 'Hold E — Open TV' })
  const [toast, setToast] = useState(null)

  const showToast = useCallback((msg) => {
    clearTimeout(toastTimerRef.current)
    setToast(msg)
    toastTimerRef.current = setTimeout(() => setToast(null), 2800)
  }, [])

  const myId = user?.id || socket.id
  const isMyBartender = Boolean(room?.bartenderId && room.bartenderId === myId)
  const equippedDrink = equippedIndex !== null ? inventory[equippedIndex] ?? null : null

  const addDrinkToInventory = useCallback(
    (drinkObj) => {
      const item = {
        ...drinkObj,
        id: drinkObj.id || `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        sips: drinkObj.sips ?? 3,
        maxSips: drinkObj.maxSips ?? 3,
      }
      setInventory((prev) => {
        const next = [...prev, item]
        setEquippedIndex((cur) => (cur === null ? next.length - 1 : cur))
        showToast(`${item.emoji || '🍹'} Added ${item.name} to Slot ${next.length}!`)
        return next
      })
    },
    [showToast],
  )

  const handleSelectToolSlot = useCallback(
    (slotIdx) => {
      setInventory((prev) => {
        if (slotIdx < 0 || slotIdx >= prev.length) return prev
        const target = prev[slotIdx]
        if (!target) return prev

        // Equip this slot and take a refreshing sip!
        setEquippedIndex(slotIdx)
        clearTimeout(sipTimerRef.current)
        setIsSipping(true)

        const remaining = (target.sips ?? 3) - 1
        sipTimerRef.current = setTimeout(() => {
          setIsSipping(false)
          if (remaining <= 0) {
            setInventory((curr) => {
              const filtered = curr.filter((_, i) => i !== slotIdx)
              setEquippedIndex((eq) => {
                if (filtered.length === 0) return null
                if (eq === null) return null
                return Math.min(eq, filtered.length - 1)
              })
              return filtered
            })
            showToast(`✨ Finished ${target.name}! Refreshing!`)
          }
        }, 1250)

        if (remaining > 0) {
          showToast(`🍹 Sipping ${target.name}… (${remaining}/${target.maxSips || 3} left)`)
          return prev.map((it, i) => (i === slotIdx ? { ...it, sips: remaining } : it))
        }
        showToast(`🍹 Taking the last sip of ${target.name}…`)
        return prev
      })
    },
    [showToast],
  )

  const handlePlaceEquippedDrink = useCallback(
    (explicitSlotId) => {
      if (equippedIndex === null || !inventory[equippedIndex]) return
      const item = inventory[equippedIndex]
      const px = roomController.player?.x ?? 0
      const pz = roomController.player?.z ?? 0
      const nearest = findNearestFreeTableSlot(px, pz, room?.tableDrinks || [], null, 2.2)
      const slotId = explicitSlotId || nearest?.slot?.id
      const preferredSurface = px < -1.8 ? 'bar' : 'table'

      placeDrink(
        {
          drinkKey: item.drinkKey,
          quality: item.quality || 3,
          sips: item.sips || 3,
          slotId,
          preferredSurface,
        },
        (res) => {
          if (res?.ok) {
            setInventory((prev) => {
              const next = prev.filter((_, i) => i !== equippedIndex)
              setEquippedIndex(next.length > 0 ? Math.min(equippedIndex, next.length - 1) : null)
              return next
            })
            showToast(`🍹 Placed ${item.name} on the table for others to take!`)
          } else {
            showToast(res?.error || 'Move closer to the bar counter or coffee table to place drink!')
          }
        },
      )
    },
    [equippedIndex, inventory, placeDrink, room?.tableDrinks, showToast],
  )

  const handleTakeDrink = useCallback(
    (drinkId) => {
      takeDrink(drinkId, (res) => {
        if (res?.ok && res.drink) {
          addDrinkToInventory(res.drink)
        }
      })
    },
    [takeDrink, addDrinkToInventory],
  )

  const handleInteractBartender = useCallback(() => {
    if (isMyBartender) {
      setBartenderOpen(true)
      return
    }
    if (room && room.bartenderId && room.bartenderId !== myId) {
      const btUser = room.users?.find((u) => u.id === room.bartenderId)
      showToast(`🍹 ${btUser?.displayName || 'Another player'} is currently the bartender!`)
      return
    }
    claimBartender((res) => {
      if (res?.ok) {
        roomController.stepToBartenderStation()
        setBartenderOpen(true)
        showToast('🍹 You are now the Bartender! Mix a signature juice!')
      } else {
        showToast(res?.error || 'Could not become bartender')
      }
    })
  }, [isMyBartender, room, myId, claimBartender, showToast])

  const cbRef = useRef(null)
  useEffect(() => {
    cbRef.current = {
      onTvElement,
      onOpenTv,
      onSitSeat: (seatId) => sitOnSeat(seatId),
      onStandSeat: () => standFromSeat(),
      onTakeDrink: handleTakeDrink,
      onPlaceEquippedDrink: handlePlaceEquippedDrink,
      onInteractBartender: handleInteractBartender,
      onSelectToolSlot: handleSelectToolSlot,
      onInteractionChange: (act) => setInteraction(act),
    }
  }, [
    onTvElement,
    onOpenTv,
    sitOnSeat,
    standFromSeat,
    handleTakeDrink,
    handlePlaceEquippedDrink,
    handleInteractBartender,
    handleSelectToolSlot,
  ])

  // Mount the renderer once
  useEffect(() => {
    let lastPct = -1
    const code = room?.code
    const uid = user?.id || socket.id
    roomController.mount(hostRef.current, {
      onTvElement: (el) => cbRef.current.onTvElement?.(el),
      onOpenTv: () => cbRef.current.onOpenTv?.(),
      onSitSeat: (seatId) => cbRef.current.onSitSeat?.(seatId),
      onStandSeat: () => cbRef.current.onStandSeat?.(),
      onTakeDrink: (drinkId) => cbRef.current.onTakeDrink?.(drinkId),
      onPlaceEquippedDrink: (slotId) => cbRef.current.onPlaceEquippedDrink?.(slotId),
      onInteractBartender: () => cbRef.current.onInteractBartender?.(),
      onSelectToolSlot: (idx) => cbRef.current.onSelectToolSlot?.(idx),
      onInteractionChange: (act) => cbRef.current.onInteractionChange?.(act),
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
    roomController.syncRoomExtras({
      bartenderId: room?.bartenderId,
      seats: room?.seats,
      tableDrinks: room?.tableDrinks,
      users: room?.users,
    })
    const playingNow = Boolean(room?.currentSong && room?.playback?.isPlaying)
    roomController.setPlayback(playingNow ? room.playback : null, room?.currentSingerId)
    roomController.setInputEnabled(!tvOpen && !bartenderOpen)
    return () => {
      clearTimeout(sipTimerRef.current)
      clearTimeout(toastTimerRef.current)
      roomController.unmount()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const roomCode = room?.code

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
    roomController.syncRoomExtras({
      bartenderId: room?.bartenderId,
      seats: room?.seats,
      tableDrinks: room?.tableDrinks,
      users: room?.users,
    })
  }, [room?.users, room?.bartenderId, room?.seats, room?.tableDrinks, myId])

  useEffect(() => {
    roomController.setLocalDrinkState({
      heldDrinkKey: equippedDrink?.drinkKey || null,
      equippedDrink,
      isSipping,
      isBartending: isMyBartender && bartenderOpen,
    })
  }, [equippedDrink, isSipping, isMyBartender, bartenderOpen])

  const isPlaying = Boolean(room?.currentSong && room?.playback?.isPlaying)
  useEffect(() => {
    roomController.setPlayback(isPlaying ? room.playback : null, room?.currentSingerId)
  }, [isPlaying, room?.playback, room?.currentSingerId])

  useEffect(() => {
    roomController.setInputEnabled(!tvOpen && !bartenderOpen)
  }, [tvOpen, bartenderOpen])

  const users = room?.users || []
  const singer = users.find((u) => u.id === room?.currentSingerId)
  const bartenderUser = users.find((u) => u.id === room?.bartenderId)
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
        <span className="room-chip">{users.length} in room</span>
        {bartenderUser && (
          <span className="room-chip room-bartender-chip">
            <IoWine /> Bartender: {bartenderUser.displayName}
          </span>
        )}
      </div>

      {room?.currentSong && (
        <div className="room-hud room-hud-top-center">
          <span className="room-chip room-now-playing">
            <IoMicSharp /> {singer?.displayName || 'Singer'} · {room.currentSong.title}
          </span>
        </div>
      )}

      <div className="room-hud room-hud-top-right">
        {isMyBartender && (
          <button
            type="button"
            className="room-chip room-mixer-btn"
            onClick={() => setBartenderOpen(true)}
          >
            <IoWine /> Juice Mixer
          </button>
        )}
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
        <span
          className={`room-conn ${isConnected ? 'ok' : 'down'}`}
          title={isConnected ? 'Realtime connected' : 'Reconnecting…'}
        />
      </div>

      {toast && (
        <div className="room-toast" role="status" aria-live="polite">
          {toast}
        </div>
      )}

      <div className="room-hud room-hud-bottom">
        {/* Bottom-center numbered drink tool hotbar (Slot 1, 2, 3...) */}
        <DrinkHotbar
          inventory={inventory}
          equippedIndex={equippedIndex}
          isSipping={isSipping}
          onSelectSlot={handleSelectToolSlot}
          onPlaceEquipped={() => handlePlaceEquippedDrink()}
          onUnequip={() => setEquippedIndex(null)}
        />

        <div className="room-interaction-row">
          <button
            type="button"
            className="room-tv-hint"
            onClick={() => roomController.triggerCurrentInteraction()}
          >
            <span ref={ringRef} className="room-hold-ring" style={{ '--p': 0 }}>
              <kbd>E</kbd>
            </span>
            <span>{interaction.label}</span>
          </button>

          {interaction.type !== 'open-tv' && (
            <button type="button" className="room-tv-quick-btn" onClick={onOpenTv} title="Open Karaoke TV">
              <IoTvOutline /> TV
            </button>
          )}
        </div>

        <div className="room-tips" aria-hidden="true">
          {TIPS.map((t) => (
            <span key={t}>{t}</span>
          ))}
        </div>
      </div>

      <BartenderMinigameModal
        open={bartenderOpen}
        onClose={() => setBartenderOpen(false)}
        onLeaveBartender={() => {
          releaseBartender()
          showToast('Stepped off the bartender station.')
        }}
        onServeToBar={({ drinkKey, quality }) => {
          placeDrink({ drinkKey, quality, preferredSurface: 'bar' }, (res) => {
            if (res?.ok && res.drink) {
              showToast(`🍹 Served ${res.drink.name} onto the Bar Counter!`)
            } else {
              showToast(res?.error || 'Could not place drink on bar counter')
            }
          })
        }}
        onKeepInHotbar={(drinkItem) => {
          addDrinkToInventory(drinkItem)
        }}
        tableDrinksCount={room?.tableDrinks?.length || 0}
      />
    </div>
  )
}
