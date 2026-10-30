import * as THREE from 'three'
import { CSS3DRenderer, CSS3DObject } from 'three/examples/jsm/renderers/CSS3DRenderer.js'
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js'
import { createKaraokeRoom } from './roomBuilder.js'
import {
  loadCharacterAvatar,
  disposeAvatarRecord,
  loadAnimationLibrary,
  onModelProgress,
} from './vrmLoader.js'
import { updateAvatarAnimationFrame } from './mixamoVRMRigMap.js'
import { expectedPlaybackTime } from '../shared/playbackSync.js'
import {
  createPlayerState,
  stepPlayer,
  groundHeight,
  angleDelta,
  maxCameraDistance,
} from '../shared/roomPhysics.js'

const TV_PX_W = 1280
const TV_PX_H = 720
const HOLD_TO_OPEN_MS = 600
const POSE_SEND_INTERVAL = 1 / 15
const POSE_HEARTBEAT = 1.5

const MOVE_KEYS = {
  KeyW: 'fwd', ArrowUp: 'fwd',
  KeyS: 'back', ArrowDown: 'back',
  KeyA: 'left', ArrowLeft: 'left',
  KeyD: 'right', ArrowRight: 'right',
}

const damp = THREE.MathUtils.damp

function isEditable(target) {
  return (
    target?.tagName === 'INPUT' ||
    target?.tagName === 'TEXTAREA' ||
    target?.tagName === 'SELECT' ||
    target?.isContentEditable
  )
}

function hashString(str = '') {
  let h = 2166136261
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function createBlobShadowTexture() {
  const size = 64
  const data = new Uint8Array(size * size * 4)
  const half = (size - 1) / 2
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const r = Math.hypot((x - half) / half, (y - half) / half)
      const idx = (y * size + x) * 4
      data[idx] = data[idx + 1] = data[idx + 2] = 0
      data[idx + 3] = Math.round(Math.max(0, 1 - r) ** 2 * 170)
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat)
  tex.needsUpdate = true
  return tex
}

const _v = new THREE.Vector3()
const _proj = new THREE.Vector3()
const _dir = new THREE.Vector3()
const _target = new THREE.Vector3()

class KaraokeRoomController {
  constructor() {
    this.reset()
  }

  reset() {
    // generation intentionally survives reset() so stale async loads can be recognised
    this.host = null
    this.renderer = null
    this.cssRenderer = null
    this.scene = null
    this.cssScene = null
    this.camera = null
    this.room = null
    this.rafId = 0
    this.mounted = false
    this.callbacks = {}
    this.entries = new Map() // userId -> avatar entry
    this.loadTokens = new Map()
    this.myId = null
    this.singerId = null
    this.playback = null
    this.userSignature = ''
    this.inputEnabled = true
    this.keys = { fwd: false, back: false, left: false, right: false, run: false }
    this.jumpBufferedUntil = 0
    this.holdStart = null
    this.holdFired = false
    this.lastHoldReport = 0
    this.player = createPlayerState(0, 1, Math.PI)
    this.camYaw = Math.PI
    this.camPitch = 0.25
    this.camDist = 3.1
    this.camDistActual = 3.1
    this.camTargetY = 1.35
    this.dragging = null
    this.net = null
    this.sendTimer = 0
    this.heartbeatTimer = 0
    this.lastSent = null
    this.forceSend = true
    this.pendingPoses = new Map()
    this.shadowGeo = null
    this.shadowMat = null
    this.shadowTex = null
    this.singerSpot = null
    this.slowFrames = 0
    this.pixelRatio = 1
    this.progress = new Map()
    this.removeProgress = null
    this.cleanups = []
    this.startMs = 0
    this.lastMs = 0
    this.overlayHost = null
    this.ready = false
  }

  /**
   * Mounts the room into `host` (a positioned element). Layers (bottom → top):
   *   CSS3D (TV iframe) → WebGL canvas (hole punched at the TV) → nameplate overlay.
   */
  async mount(host, callbacks = {}) {
    if (!host) return
    if (this.mounted) this.unmount()
    this.callbacks = callbacks
    this.host = host
    this.mounted = true
    this.generation = (this.generation || 0) + 1
    this.startMs = performance.now()

    this.removeProgress = onModelProgress(({ url, loaded, total }) => {
      this.progress.set(url, { loaded, total })
      this._reportProgress()
    })

    const width = host.clientWidth || window.innerWidth
    const height = host.clientHeight || window.innerHeight

    // CSS3D layer for the YouTube iframe (sits under the canvas)
    const cssRenderer = new CSS3DRenderer()
    cssRenderer.setSize(width, height)
    cssRenderer.domElement.className = 'room-css3d-layer'
    host.appendChild(cssRenderer.domElement)
    this.cssRenderer = cssRenderer

    const canvas = document.createElement('canvas')
    canvas.className = 'room-webgl-canvas'
    host.appendChild(canvas)
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance',
    })
    this.pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5)
    renderer.setPixelRatio(this.pixelRatio)
    renderer.setSize(width, height, false)
    renderer.setClearColor(0x000000, 0)
    renderer.outputColorSpace = THREE.SRGBColorSpace
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.05
    this.renderer = renderer

    const overlay = document.createElement('div')
    overlay.className = 'room-nameplate-layer'
    host.appendChild(overlay)
    this.overlayHost = overlay

    const scene = new THREE.Scene()
    this.scene = scene
    this.cssScene = new THREE.Scene()
    this.camera = new THREE.PerspectiveCamera(58, width / Math.max(1, height), 0.1, 40)

    // Soft image-based light for believable metal/leather/glass
    const pmrem = new THREE.PMREMGenerator(renderer)
    const envScene = new RoomEnvironment()
    scene.environment = pmrem.fromScene(envScene, 0.04).texture
    scene.environmentIntensity = 0.28
    envScene.dispose()
    pmrem.dispose()

    this.room = createKaraokeRoom()
    scene.add(this.room.group)

    // TV iframe host element
    const tvEl = document.createElement('div')
    tvEl.className = 'tv-screen-root'
    tvEl.style.width = `${TV_PX_W}px`
    tvEl.style.height = `${TV_PX_H}px`
    const tvObj = new CSS3DObject(tvEl)
    tvObj.position.copy(this.room.tv.center)
    tvObj.scale.setScalar(this.room.tv.width / TV_PX_W)
    this.cssScene.add(tvObj)
    this.tvElement = tvEl
    callbacks.onTvElement?.(tvEl)

    // Shared blob shadow for avatars
    this.shadowTex = createBlobShadowTexture()
    this.shadowGeo = new THREE.PlaneGeometry(0.85, 0.85)
    this.shadowMat = new THREE.MeshBasicMaterial({
      map: this.shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -3,
    })

    // Follow-spot on the current singer
    const spot = new THREE.SpotLight(0xffe2b8, 0, 7, Math.PI / 7, 0.7, 1.6)
    spot.position.set(0, 3.0, -1.4)
    scene.add(spot, spot.target)
    this.singerSpot = spot

    this._bindEvents(canvas)
    this._reportProgress(0.02)

    // Warm the animation library in parallel with the first avatar
    loadAnimationLibrary().catch(() => {})
    this._placeLocalPlayer()
    this._loop(performance.now())
  }

  unmount() {
    if (!this.mounted && !this.renderer) return
    cancelAnimationFrame(this.rafId)
    this.cleanups.forEach((fn) => fn())
    this.removeProgress?.()
    for (const entry of this.entries.values()) this._disposeEntry(entry)
    this.room?.dispose()
    this.shadowGeo?.dispose()
    this.shadowMat?.dispose()
    this.shadowTex?.dispose()
    this.scene?.environment?.dispose?.()
    this.renderer?.dispose()
    this.renderer?.forceContextLoss?.()
    this.host?.replaceChildren()
    this.callbacks.onTvElement?.(null)
    this.reset()
  }

  // ---------- Public API ----------

  getStats() {
    const info = this.renderer?.info
    return info
      ? { calls: info.render.calls, triangles: info.render.triangles, geometries: info.memory.geometries, textures: info.memory.textures, pixelRatio: this.pixelRatio }
      : null
  }

  setNetwork(net) {
    this.net = net
    this.forceSend = true
  }

  setInputEnabled(enabled) {
    this.inputEnabled = Boolean(enabled)
    if (!enabled) {
      Object.keys(this.keys).forEach((k) => {
        this.keys[k] = false
      })
      this._cancelHold()
      this.dragging = null
    }
  }

  setPlayback(playback, singerId) {
    this.playback = playback || null
    this.singerId = singerId ?? null
  }

  onRemotePose(pose) {
    if (!pose || pose.id === this.myId) return
    const entry = this.entries.get(pose.id)
    const net = { x: pose.x, y: pose.y, z: pose.z, ry: pose.ry, s: pose.s, a: pose.a, t: performance.now() }
    if (entry) {
      entry.net = net
    } else {
      this.pendingPoses.set(pose.id, net)
    }
  }

  /** Reconcile avatars with room.users. Cheap no-op when nothing relevant changed. */
  syncUsers(users = [], myId = null) {
    if (!this.scene) return
    this.myId = myId
    const sig = users.map((u) => `${u.id}:${u.character || 'miku'}:${u.displayName || ''}`).join('|')
    if (sig === this.userSignature) return
    const hadUsers = this.userSignature !== ''
    this.userSignature = sig
    const active = new Set(users.map((u) => u.id))

    for (const [id, entry] of this.entries) {
      if (!active.has(id)) {
        this._disposeEntry(entry)
        this.entries.delete(id)
        this.loadTokens.delete(id)
      }
    }

    users.forEach((u) => {
      const character = u.character === 'teto' ? 'teto' : 'miku'
      const existing = this.entries.get(u.id)
      if (existing && existing.character === character) {
        existing.displayName = u.displayName
        this._updateNameplateText(existing)
        return
      }
      this._loadEntry(u, character, existing)
    })
    // A newcomer needs our position right away
    if (hadUsers) this.forceSend = true
  }

  // ---------- Avatars ----------

  async _loadEntry(user, character, previous) {
    const token = (this.loadTokens.get(user.id) || 0) + 1
    const generation = this.generation
    this.loadTokens.set(user.id, token)
    const isMe = user.id === this.myId
    const keepPos = previous?.pos?.clone()
    const keepYaw = previous?.yaw
    if (previous) {
      this._disposeEntry(previous)
      this.entries.delete(user.id)
    }

    const rec = await loadCharacterAvatar(character)
    // Discard if unmounted/remounted (StrictMode) or superseded by a newer load for this user
    if (!this.scene || this.generation !== generation || this.loadTokens.get(user.id) !== token) {
      disposeAvatarRecord(rec)
      return
    }

    rec.externalTransform = true
    rec.phaseOffset = (hashString(user.id) % 100) / 10
    rec.spawn = 0.01
    rec.rootGroup.scale.setScalar(0.01)
    this.scene.add(rec.rootGroup)

    const shadow = new THREE.Mesh(this.shadowGeo, this.shadowMat)
    shadow.rotation.x = -Math.PI / 2
    shadow.renderOrder = 1
    this.scene.add(shadow)

    const el = document.createElement('div')
    el.className = 'room-nameplate'
    this.overlayHost?.appendChild(el)

    const slot = this.room.spawnPoints[hashString(user.id) % this.room.spawnPoints.length]
    const pos = keepPos || new THREE.Vector3(slot[0], 0, slot[1])
    const entry = {
      id: user.id,
      isMe,
      character,
      displayName: user.displayName,
      rec,
      shadow,
      el,
      pos,
      yaw: keepYaw ?? Math.PI,
      net: this.pendingPoses.get(user.id) || null,
      lastClass: '',
      lastText: '',
    }
    this.pendingPoses.delete(user.id)
    if (entry.net && !isMe) {
      pos.set(entry.net.x, entry.net.y, entry.net.z)
      entry.yaw = entry.net.ry
    }
    if (isMe) {
      this.player.x = pos.x
      this.player.z = pos.z
      this.player.yaw = entry.yaw
    }
    this._updateNameplateText(entry)
    this.entries.set(user.id, entry)

    if (isMe && !this.ready) {
      this.ready = true
      this._reportProgress(1)
      // Let the first frame render before hiding the loader
      requestAnimationFrame(() => this.callbacks.onReady?.())
    }
  }

  _disposeEntry(entry) {
    disposeAvatarRecord(entry.rec)
    entry.shadow?.parent?.remove(entry.shadow)
    entry.el?.remove()
  }

  _updateNameplateText(entry) {
    if (entry.lastText === entry.displayName) return
    entry.lastText = entry.displayName
    entry.el.textContent = entry.displayName || ''
  }

  _placeLocalPlayer() {
    const slot = this.room.spawnPoints[hashString(this.myId || 'me') % this.room.spawnPoints.length]
    this.player.x = slot[0]
    this.player.z = slot[1]
  }

  _reportProgress(forced) {
    let pct = forced
    if (pct === undefined) {
      let loaded = 0
      let total = 0
      this.progress.forEach((p) => {
        loaded += p.loaded
        total += p.total
      })
      pct = total > 0 ? 0.05 + 0.9 * (loaded / total) : 0.05
    }
    this.callbacks.onProgress?.(Math.min(1, pct))
  }

  // ---------- Input ----------

  _bindEvents(canvas) {
    const on = (target, type, fn, opts) => {
      target.addEventListener(type, fn, opts)
      this.cleanups.push(() => target.removeEventListener(type, fn, opts))
    }

    on(window, 'keydown', (e) => {
      if (!this.inputEnabled || isEditable(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      const move = MOVE_KEYS[e.code]
      if (move) {
        this.keys[move] = true
        e.preventDefault()
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        this.keys.run = true
      } else if (e.code === 'Space') {
        e.preventDefault()
        if (!e.repeat) this.jumpBufferedUntil = performance.now() + 140
      } else if (e.code === 'KeyE' && !e.repeat) {
        this.holdStart = performance.now()
        this.holdFired = false
      }
    })
    on(window, 'keyup', (e) => {
      const move = MOVE_KEYS[e.code]
      if (move) this.keys[move] = false
      else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') this.keys.run = false
      else if (e.code === 'KeyE') this._cancelHold()
      else if (e.code === 'Space' && this.inputEnabled && !isEditable(e.target)) e.preventDefault()
    })
    on(window, 'blur', () => this.setInputEnabled(this.inputEnabled))

    on(canvas, 'pointerdown', (e) => {
      if (!this.inputEnabled) return
      document.activeElement?.blur?.()
      this.dragging = { id: e.pointerId, x: e.clientX, y: e.clientY }
      canvas.setPointerCapture?.(e.pointerId)
    })
    on(canvas, 'pointermove', (e) => {
      if (!this.dragging || this.dragging.id !== e.pointerId) return
      const dx = e.clientX - this.dragging.x
      const dy = e.clientY - this.dragging.y
      this.dragging.x = e.clientX
      this.dragging.y = e.clientY
      this.camYaw -= dx * 0.0042
      this.camPitch = THREE.MathUtils.clamp(this.camPitch + dy * 0.0038, -0.15, 1.15)
    })
    const endDrag = (e) => {
      if (this.dragging?.id === e.pointerId) this.dragging = null
    }
    on(canvas, 'pointerup', endDrag)
    on(canvas, 'pointercancel', endDrag)
    on(
      canvas,
      'wheel',
      (e) => {
        if (!this.inputEnabled) return
        e.preventDefault()
        this.camDist = THREE.MathUtils.clamp(this.camDist + Math.sign(e.deltaY) * 0.35, 1.6, 5.2)
      },
      { passive: false },
    )
    on(canvas, 'contextmenu', (e) => e.preventDefault())

    on(window, 'resize', () => this.handleResize())
    if (typeof ResizeObserver !== 'undefined') {
      const ro = new ResizeObserver(() => this.handleResize())
      ro.observe(this.host)
      this.cleanups.push(() => ro.disconnect())
    }
  }

  _cancelHold() {
    this.holdStart = null
    if (this.lastHoldReport !== 0) {
      this.lastHoldReport = 0
      this.callbacks.onHoldProgress?.(0)
    }
  }

  handleResize() {
    if (!this.host || !this.renderer) return
    const width = this.host.clientWidth || window.innerWidth
    const height = this.host.clientHeight || window.innerHeight
    this.camera.aspect = width / Math.max(1, height)
    this.camera.updateProjectionMatrix()
    this.renderer.setSize(width, height, false)
    this.cssRenderer.setSize(width, height)
  }

  // ---------- Frame loop ----------

  _loop(nowMs) {
    this.lastMs = nowMs
    const tick = (now) => {
      this.rafId = requestAnimationFrame(tick)
      const dt = Math.min(0.05, Math.max(0.0001, (now - this.lastMs) / 1000))
      this.lastMs = now
      this._frame(dt, now)
    }
    this.rafId = requestAnimationFrame(tick)
  }

  _frame(dt, nowMs) {
    const elapsed = (nowMs - this.startMs) / 1000
    this._adaptQuality(dt)
    this._updateHold(nowMs)
    this._updateLocalPlayer(dt, nowMs)

    const playing = Boolean(this.playback?.isPlaying)
    const songSec = playing ? expectedPlaybackTime(this.playback, Date.now()) : null
    const singerEntry = this.singerId ? this.entries.get(this.singerId) : null

    for (const entry of this.entries.values()) {
      this._updateEntry(entry, dt, nowMs, songSec, playing)
    }

    this._updateCamera(dt)
    this._updateSpot(dt, singerEntry, playing)

    this.room.update(dt, elapsed, { playing, beat: (songSec ?? elapsed) * 2 })

    this.renderer.render(this.scene, this.camera)
    this.cssRenderer.render(this.cssScene, this.camera)
    this._updateNameplates()
    this._maybeSendPose(dt)
  }

  _adaptQuality(dt) {
    if (dt > 1 / 40) this.slowFrames += 1
    else this.slowFrames = Math.max(0, this.slowFrames - 2)
    if (this.slowFrames > 100 && this.pixelRatio > 0.85) {
      this.slowFrames = 0
      this.pixelRatio = Math.max(0.85, this.pixelRatio - 0.25)
      this.renderer.setPixelRatio(this.pixelRatio)
      this.handleResize()
    }
  }

  _updateHold(nowMs) {
    if (this.holdStart === null || this.holdFired) return
    const p = Math.min(1, (nowMs - this.holdStart) / HOLD_TO_OPEN_MS)
    if (p - this.lastHoldReport >= 0.04 || p >= 1) {
      this.lastHoldReport = p
      this.callbacks.onHoldProgress?.(p)
    }
    if (p >= 1) {
      this.holdFired = true
      this.holdStart = null
      this.lastHoldReport = 0
      this.callbacks.onHoldProgress?.(0)
      this.callbacks.onOpenTv?.()
    }
  }

  _updateLocalPlayer(dt, nowMs) {
    const me = this.entries.get(this.myId)
    if (!me) return
    const k = this.keys
    const fwd = (k.fwd ? 1 : 0) - (k.back ? 1 : 0)
    const strafe = (k.right ? 1 : 0) - (k.left ? 1 : 0)
    let dirX = 0
    let dirZ = 0
    if ((fwd || strafe) && this.inputEnabled) {
      const lx = Math.sin(this.camYaw)
      const lz = Math.cos(this.camYaw)
      dirX = lx * fwd + -lz * strafe
      dirZ = lz * fwd + lx * strafe
      const len = Math.hypot(dirX, dirZ)
      dirX /= len
      dirZ /= len
    }

    const wantsJump = nowMs < this.jumpBufferedUntil
    const p = this.player
    stepPlayer(p, { dirX, dirZ, run: k.run, jump: wantsJump && p.grounded }, dt, this.room.colliders)
    if (wantsJump && !p.grounded) this.jumpBufferedUntil = 0

    if (dirX !== 0 || dirZ !== 0) {
      p.yaw += angleDelta(p.yaw, Math.atan2(dirX, dirZ)) * (1 - Math.exp(-13 * dt))
    }

    me.pos.set(p.x, p.y, p.z)
    me.yaw = p.yaw
    me.rec.moveSpeed = p.speed
    me.rec.isAirborne = !p.grounded
    me.rec.verticalSpeed = p.vy / 4
  }

  _updateEntry(entry, dt, nowMs, songSec, playing) {
    const { rec } = entry
    if (!entry.isMe) this._updateRemote(entry, dt, nowMs)

    // Singing / cheering state follows the shared playback + rotation
    const lead = !this.singerId || entry.id === this.singerId
    rec.animationState = playing ? (lead ? 'singing' : 'cheering') : 'idle'
    rec.beatTime = songSec !== null ? songSec + (rec.phaseOffset || 0) * 0.15 : 0

    if (rec.spawn < 0.999) {
      rec.spawn = damp(rec.spawn, 1, 9, dt)
      rec.rootGroup.scale.setScalar(rec.spawn)
    }
    rec.rootGroup.position.copy(entry.pos)
    rec.rootGroup.rotation.y = entry.yaw
    rec.lookYaw = 0

    updateAvatarAnimationFrame(rec, dt, (nowMs - this.startMs) / 1000)

    // Contact shadow follows the ground under the avatar
    const ground = groundHeight({ x: entry.pos.x, y: entry.pos.y, z: entry.pos.z }, this.room.colliders)
    entry.shadow.position.set(entry.pos.x, ground + 0.016, entry.pos.z)
    const lift = Math.max(0, entry.pos.y - ground)
    entry.shadow.scale.setScalar(Math.max(0.5, 1 - lift * 0.55) * rec.rootGroup.scale.x)
  }

  _updateRemote(entry, dt, nowMs) {
    const net = entry.net
    if (!net) return
    const age = Math.min(0.15, (nowMs - net.t) / 1000)
    const moving = net.s > 0.2
    const tx = net.x + (moving ? Math.sin(net.ry) * net.s * age : 0)
    const tz = net.z + (moving ? Math.cos(net.ry) * net.s * age : 0)
    const dist = Math.hypot(tx - entry.pos.x, tz - entry.pos.z)
    if (dist > 3) {
      entry.pos.set(tx, net.y, tz)
    } else {
      entry.pos.x = damp(entry.pos.x, tx, 16, dt)
      entry.pos.z = damp(entry.pos.z, tz, 16, dt)
      entry.pos.y = damp(entry.pos.y, net.y, 24, dt)
    }
    entry.yaw += angleDelta(entry.yaw, net.ry) * (1 - Math.exp(-14 * dt))
    const speed = moving ? Math.min(net.s, dist > 0.02 ? 8 : net.s) : 0
    entry.rec.moveSpeed = damp(entry.rec.moveSpeed ?? 0, speed, 14, dt)
    entry.rec.isAirborne = Boolean(net.a)
    entry.rec.verticalSpeed = net.a ? (net.y > entry.pos.y ? 0.6 : -0.6) : 0
  }

  _updateCamera(dt) {
    const me = this.entries.get(this.myId)
    const cam = this.camera
    const p = this.player
    this.camTargetY = damp(this.camTargetY, p.y + 1.32, 9, dt)
    _target.set(p.x, this.camTargetY, p.z)

    const cp = Math.cos(this.camPitch)
    _dir.set(-Math.sin(this.camYaw) * cp, Math.sin(this.camPitch), -Math.cos(this.camYaw) * cp)
    const limit = maxCameraDistance(_target, _dir, this.camDist)
    // Pull in instantly when a wall is in the way, ease back out smoothly
    this.camDistActual = limit < this.camDistActual ? limit : damp(this.camDistActual, limit, 5, dt)
    cam.position.copy(_target).addScaledVector(_dir, this.camDistActual)
    cam.lookAt(_target)

    if (me) me.rec.rootGroup.visible = this.camDistActual > 0.75
  }

  _updateSpot(dt, singerEntry, playing) {
    const spot = this.singerSpot
    if (!spot) return
    const on = playing && singerEntry
    spot.intensity = damp(spot.intensity, on ? 10 : 0, 5, dt)
    if (singerEntry) {
      spot.target.position.set(singerEntry.pos.x, singerEntry.pos.y + 1, singerEntry.pos.z)
      spot.position.set(singerEntry.pos.x * 0.6, 3.0, singerEntry.pos.z * 0.6 - 0.4)
    }
  }

  _updateNameplates() {
    const cam = this.camera
    const w = this.host.clientWidth
    const h = this.host.clientHeight
    for (const entry of this.entries.values()) {
      const head = entry.rec.headAnchor
      if (head) head.getWorldPosition(_v)
      else _v.set(entry.pos.x, entry.pos.y + 1.5, entry.pos.z)
      _v.y += 0.3
      const dist = cam.position.distanceTo(_v)
      _proj.copy(_v).project(cam)
      const visible = _proj.z < 1 && _proj.z > -1 && dist < 14 && !(entry.isMe && !entry.rec.rootGroup.visible)
      const state = entry.rec.animationState
      const cls = `room-nameplate${entry.isMe ? ' is-me' : ''}${state === 'singing' ? ' is-singing' : ''}${visible ? '' : ' is-hidden'}`
      if (cls !== entry.lastClass) {
        entry.lastClass = cls
        entry.el.className = cls
      }
      if (visible) {
        const x = (_proj.x * 0.5 + 0.5) * w
        const y = (-_proj.y * 0.5 + 0.5) * h
        const scale = THREE.MathUtils.clamp(5 / dist, 0.6, 1.1)
        entry.el.style.transform = `translate(-50%,-100%) translate(${x.toFixed(1)}px,${y.toFixed(1)}px) scale(${scale.toFixed(2)})`
      }
    }
  }

  _maybeSendPose(dt) {
    if (!this.net) return
    this.sendTimer += dt
    this.heartbeatTimer += dt
    if (this.sendTimer < POSE_SEND_INTERVAL) return
    const p = this.player
    const pose = {
      x: +p.x.toFixed(3), y: +p.y.toFixed(3), z: +p.z.toFixed(3),
      ry: +p.yaw.toFixed(3), s: +p.speed.toFixed(2), a: p.grounded ? 0 : 1,
    }
    const last = this.lastSent
    const changed =
      !last ||
      Math.abs(pose.x - last.x) > 0.004 || Math.abs(pose.z - last.z) > 0.004 ||
      Math.abs(pose.y - last.y) > 0.004 || Math.abs(pose.ry - last.ry) > 0.01 ||
      pose.a !== last.a || (pose.s > 0.2) !== (last.s > 0.2)
    if (changed || this.forceSend || this.heartbeatTimer > POSE_HEARTBEAT) {
      this.sendTimer = 0
      this.heartbeatTimer = 0
      this.forceSend = false
      this.lastSent = pose
      this.net.send(pose)
    }
  }
}

export const roomController = new KaraokeRoomController()

if (import.meta.env?.DEV && typeof window !== 'undefined') {
  // Dev-only handle for profiling (draw calls / triangles)
  window.__karaokeRoom = roomController
}
