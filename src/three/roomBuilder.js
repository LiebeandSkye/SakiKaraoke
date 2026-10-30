import * as THREE from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { ROOM } from '../shared/roomPhysics.js'
import { TABLE_SLOTS, TABLE_SLOT_MAP } from '../shared/barSystem.js'

/**
 * Procedural karaoke lounge. Real-world scale (metres): 10 x 8 x 3.2 room.
 * Every static prop is merged per-material so the whole room is ~30 draw calls,
 * textures are small canvas-generated maps (no downloads), lighting is baked-looking
 * (soft contact decals + emissive LED strips) with only a handful of real lights.
 */

const SRGB = THREE.SRGBColorSpace
const HW = ROOM.width / 2
const HD = ROOM.depth / 2
const H = ROOM.height

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a += 0x6d2b79f5
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function canvasTexture(w, h, draw, { repeatX = 1, repeatY = 1, aniso = 8, repeat = true } = {}) {
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const g = canvas.getContext('2d')
  draw(g, w, h)
  const tex = new THREE.CanvasTexture(canvas)
  tex.colorSpace = SRGB
  tex.anisotropy = aniso
  if (repeat) {
    tex.wrapS = tex.wrapT = THREE.RepeatWrapping
    tex.repeat.set(repeatX, repeatY)
  }
  return tex
}

function woodFloorTexture() {
  return canvasTexture(
    1024, 1024,
    (g, w, h) => {
      const r = rng(7)
      const cols = 12
      const pw = w / cols
      for (let c = 0; c < cols; c += 1) {
        let y = -r() * 300
        while (y < h) {
          const len = 280 + r() * 520
          const hue = 27 + r() * 5
          const sat = 36 + r() * 6
          const lig = 37 + r() * 7
          g.fillStyle = `hsl(${hue} ${sat}% ${lig}%)`
          g.fillRect(c * pw, y, pw, len)
          for (let i = 0; i < 16; i += 1) {
            g.strokeStyle = `hsla(${hue - 3} ${sat}% ${lig - 10}%, ${0.05 + r() * 0.09})`
            g.lineWidth = 0.6 + r() * 1.2
            const gx = c * pw + r() * pw
            g.beginPath()
            g.moveTo(gx, y)
            g.bezierCurveTo(gx + (r() - 0.5) * 8, y + len * 0.3, gx + (r() - 0.5) * 8, y + len * 0.7, gx + (r() - 0.5) * 4, y + len)
            g.stroke()
          }
          g.fillStyle = 'rgba(20,10,4,0.4)'
          g.fillRect(c * pw, y, pw, 2)
          y += len
        }
        g.fillStyle = 'rgba(20,10,4,0.5)'
        g.fillRect(c * pw, 0, 2, h)
      }
    },
    { repeatX: ROOM.width / 2.4, repeatY: ROOM.depth / 2.4, aniso: 8 },
  )
}

function wallTexture() {
  return canvasTexture(
    256, 256,
    (g, w, h) => {
      const r = rng(21)
      g.fillStyle = '#2d4a45'
      g.fillRect(0, 0, w, h)
      for (let x = 0; x < w; x += 4) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${0.015 + r() * 0.03})`
        g.fillRect(x, 0, 2, h)
      }
      for (let i = 0; i < 2500; i += 1) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '0,0,0'},${r() * 0.05})`
        g.fillRect(r() * w, r() * h, 1.5, 1.5)
      }
    },
    { repeatX: ROOM.width / 2, repeatY: H / 2, aniso: 4 },
  )
}

function rugTexture() {
  return canvasTexture(
    768, 512,
    (g, w, h) => {
      g.fillStyle = '#e9dcc2'
      g.fillRect(0, 0, w, h)
      const band = (inset, color, thick) => {
        g.strokeStyle = color
        g.lineWidth = thick
        g.strokeRect(inset, inset, w - inset * 2, h - inset * 2)
      }
      band(16, '#b4552f', 22)
      band(52, '#2f7f78', 10)
      band(70, '#d9a441', 6)
      const cx = w / 2
      const cy = h / 2
      for (let i = 5; i >= 0; i -= 1) {
        const s = 40 + i * 34
        g.fillStyle = ['#b4552f', '#e9dcc2', '#2f7f78', '#e9dcc2', '#d9a441', '#e9dcc2'][i]
        g.beginPath()
        g.moveTo(cx, cy - s)
        g.lineTo(cx + s * 1.5, cy)
        g.lineTo(cx, cy + s)
        g.lineTo(cx - s * 1.5, cy)
        g.closePath()
        g.fill()
      }
      const r = rng(3)
      for (let i = 0; i < 6000; i += 1) {
        g.fillStyle = `rgba(${r() > 0.5 ? '255,255,255' : '40,20,10'},${r() * 0.08})`
        g.fillRect(r() * w, r() * h, 2, 2)
      }
    },
    { repeat: false, aniso: 8 },
  )
}

function posterTexture(kind) {
  return canvasTexture(
    256, 352,
    (g, w, h) => {
      if (kind === 0) {
        const grad = g.createLinearGradient(0, 0, 0, h)
        grad.addColorStop(0, '#ffb14a')
        grad.addColorStop(0.6, '#ff6f61')
        grad.addColorStop(1, '#7c2d2a')
        g.fillStyle = grad
        g.fillRect(0, 0, w, h)
        g.fillStyle = '#ffe6b8'
        g.beginPath()
        g.arc(w / 2, h * 0.45, 62, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#2a1512'
        g.fillRect(0, h * 0.62, w, h)
        g.fillStyle = '#ffe6b8'
        g.font = 'bold 40px Impact, sans-serif'
        g.textAlign = 'center'
        g.fillText('LIVE', w / 2, h * 0.8)
        g.font = '16px sans-serif'
        g.fillText('ONE NIGHT ONLY', w / 2, h * 0.9)
      } else if (kind === 1) {
        g.fillStyle = '#143a3a'
        g.fillRect(0, 0, w, h)
        g.strokeStyle = '#3dd6c9'
        g.lineWidth = 3
        for (let i = 0; i < 9; i += 1) {
          g.beginPath()
          g.arc(w / 2, h * 0.42, 24 + i * 12, 0, Math.PI * 2)
          g.stroke()
        }
        g.fillStyle = '#e9dcc2'
        g.font = 'bold 34px Impact, sans-serif'
        g.textAlign = 'center'
        g.fillText('SING', w / 2, h * 0.86)
      } else {
        g.fillStyle = '#e9dcc2'
        g.fillRect(0, 0, w, h)
        g.fillStyle = '#1d1f23'
        g.beginPath()
        g.arc(w / 2, h * 0.4, 90, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#d9a441'
        g.beginPath()
        g.arc(w / 2, h * 0.4, 34, 0, Math.PI * 2)
        g.fill()
        g.fillStyle = '#1d1f23'
        g.beginPath()
        g.arc(w / 2, h * 0.4, 5, 0, Math.PI * 2)
        g.fill()
        g.font = 'bold 28px Impact, sans-serif'
        g.textAlign = 'center'
        g.fillText('VINYL NIGHT', w / 2, h * 0.88)
      }
    },
    { repeat: false, aniso: 4 },
  )
}

function neonTexture(text, color, w = 1024, h = 256, font = 'bold 150px "Trebuchet MS", Arial, sans-serif') {
  return canvasTexture(
    w, h,
    (g) => {
      g.clearRect(0, 0, w, h)
      g.font = font
      g.textAlign = 'center'
      g.textBaseline = 'middle'
      g.shadowColor = color
      g.shadowBlur = 36
      g.strokeStyle = color
      g.lineWidth = 6
      g.strokeText(text, w / 2, h / 2)
      g.shadowBlur = 14
      g.fillStyle = '#fff4e2'
      g.fillText(text, w / 2, h / 2)
    },
    { repeat: false, aniso: 4 },
  )
}

function radialTexture() {
  return canvasTexture(
    64, 64,
    (g, w, h) => {
      const grad = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2)
      grad.addColorStop(0, 'rgba(0,0,0,0.55)')
      grad.addColorStop(0.55, 'rgba(0,0,0,0.25)')
      grad.addColorStop(1, 'rgba(0,0,0,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    },
    { repeat: false, aniso: 1 },
  )
}

function beamTexture() {
  return canvasTexture(
    8, 64,
    (g, w, h) => {
      const grad = g.createLinearGradient(0, 0, 0, h)
      grad.addColorStop(0, 'rgba(255,255,255,0.9)')
      grad.addColorStop(1, 'rgba(255,255,255,0)')
      g.fillStyle = grad
      g.fillRect(0, 0, w, h)
    },
    { repeat: false, aniso: 1 },
  )
}

/** Collects transformed geometry per material then merges each group into one mesh. */
class Batcher {
  constructor() {
    this.lists = new Map()
    this.base = new THREE.Matrix4()
    this.cache = new Map()
    this._m = new THREE.Matrix4()
    this._q = new THREE.Quaternion()
    this._e = new THREE.Euler()
    this._p = new THREE.Vector3()
    this._s = new THREE.Vector3()
  }

  geo(key, factory) {
    if (!this.cache.has(key)) this.cache.set(key, factory())
    return this.cache.get(key)
  }

  at(x, z, ry, fn) {
    const prev = this.base.clone()
    const local = new THREE.Matrix4().compose(
      new THREE.Vector3(x, 0, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, ry, 0)),
      new THREE.Vector3(1, 1, 1),
    )
    this.base.multiply(local)
    fn()
    this.base.copy(prev)
  }

  add(mat, geometry, x, y, z, rx = 0, ry = 0, rz = 0, sx = 1, sy = 1, sz = 1) {
    this._e.set(rx, ry, rz)
    this._q.setFromEuler(this._e)
    this._m.compose(this._p.set(x, y, z), this._q, this._s.set(sx, sy, sz))
    this._m.premultiply(this.base)
    const g = geometry.clone()
    g.applyMatrix4(this._m)
    if (!this.lists.has(mat)) this.lists.set(mat, [])
    this.lists.get(mat).push(g)
  }

  box(mat, w, h, d, x, y, z, rx, ry, rz) {
    this.add(mat, this.geo('box', () => new THREE.BoxGeometry(1, 1, 1)), x, y, z, rx, ry, rz, w, h, d)
  }

  cyl(mat, rTop, rBottom, h, x, y, z, seg = 14, rx, ry, rz) {
    const key = `cyl|${rTop}|${rBottom}|${h}|${seg}`
    this.add(mat, this.geo(key, () => new THREE.CylinderGeometry(rTop, rBottom, h, seg)), x, y, z, rx, ry, rz)
  }

  sphere(mat, r, x, y, z, sx = 1, sy = 1, sz = 1, detail = 1) {
    this.add(mat, this.geo(`sph|${r}|${detail}`, () => new THREE.SphereGeometry(r, 8 + detail * 2, 6 + detail * 2)), x, y, z, 0, 0, 0, sx, sy, sz)
  }

  disc(mat, r, x, y, z, seg = 20) {
    this.add(mat, this.geo(`disc|${r}|${seg}`, () => new THREE.CircleGeometry(r, seg)), x, y, z, Math.PI / 2, 0, 0)
  }

  build(group) {
    for (const [mat, list] of this.lists) {
      const merged = mergeGeometries(list, false)
      list.forEach((g) => g.dispose())
      if (!merged) continue
      const mesh = new THREE.Mesh(merged, mat)
      mesh.matrixAutoUpdate = false
      mesh.updateMatrix()
      mesh.frustumCulled = false
      group.add(mesh)
    }
    this.cache.forEach((g) => g.dispose())
    this.lists.clear()
  }
}

export function createKaraokeRoom() {
  const group = new THREE.Group()
  group.name = 'KaraokeRoom'
  const disposables = []
  const track = (x) => {
    disposables.push(x)
    return x
  }

  const std = (color, rough = 0.6, metal = 0, extra = {}) =>
    track(new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra }))
  const glow = (color, extra = {}) => track(new THREE.MeshBasicMaterial({ color, toneMapped: false, ...extra }))

  // --- Palette (warm woods, deep teal, brass, cognac leather: no purple) ---
  const M = {
    walnut: std(0x5a3724, 0.55),
    walnutDark: std(0x3f2619, 0.6),
    oak: std(0x946a43, 0.5),
    charcoal: std(0x202327, 0.7),
    black: std(0x101113, 0.45, 0.3),
    leather: std(0x8f4a2c, 0.5),
    cream: std(0xe9dcc2, 0.85),
    mustard: std(0xd9a441, 0.85),
    teal: std(0x2f8f83, 0.85),
    terracotta: std(0xb4552f, 0.8),
    brass: std(0xc9a24b, 0.3, 1),
    steel: std(0x9aa0a6, 0.3, 0.9),
    leaf: std(0x2f6b45, 0.8),
    leaf2: std(0x3f8a56, 0.8),
    ceiling: std(0x1b1d20, 0.9),
    glassAmber: std(0xd48a2e, 0.1, 0.1, { transparent: true, opacity: 0.8 }),
    glassGreen: std(0x2f7a4d, 0.1, 0.1, { transparent: true, opacity: 0.8 }),
    glassClear: std(0xcfe8ea, 0.05, 0.1, { transparent: true, opacity: 0.5 }),
    mirror: std(0xb9c2c6, 0.08, 1),
    amberLed: glow(0xffb14a),
    coralLed: glow(0xff6f61),
    tealLed: glow(0x35d6c9),
    warmWhite: glow(0xfff0d6),
    shade: glow(0xffd9a0),
  }

  const batch = new Batcher()
  const colliders = []
  const solid = (minX, maxX, minZ, maxZ, top) => colliders.push({ minX, maxX, minZ, maxZ, top })

  // --- Shell: floor, ceiling, walls ---
  const floorTex = track(woodFloorTexture())
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(ROOM.width, ROOM.depth),
    track(new THREE.MeshStandardMaterial({ map: floorTex, roughness: 0.42, metalness: 0.05 })),
  )
  track(floor.geometry)
  floor.rotation.x = -Math.PI / 2
  group.add(floor)

  const ceil = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, ROOM.depth), M.ceiling)
  track(ceil.geometry)
  ceil.rotation.x = Math.PI / 2
  ceil.position.y = H
  group.add(ceil)

  const wallTex = track(wallTexture())
  const wallMat = track(new THREE.MeshStandardMaterial({ map: wallTex, roughness: 0.9 }))
  const wall = (w, x, z, ry) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, H), wallMat)
    track(m.geometry)
    m.position.set(x, H / 2, z)
    m.rotation.y = ry
    group.add(m)
  }
  wall(ROOM.width, 0, HD, Math.PI) // back
  wall(ROOM.depth, -HW, 0, Math.PI / 2) // left
  wall(ROOM.depth, HW, 0, -Math.PI / 2) // right
  // TV wall is a dark backing behind the walnut slats
  const tvWallBack = new THREE.Mesh(new THREE.PlaneGeometry(ROOM.width, H), M.charcoal)
  track(tvWallBack.geometry)
  tvWallBack.position.set(0, H / 2, -HD)
  group.add(tvWallBack)

  // Baseboards + crown LED cove
  batch.box(M.walnutDark, ROOM.width, 0.12, 0.03, 0, 0.06, HD - 0.015)
  batch.box(M.walnutDark, ROOM.width, 0.12, 0.03, 0, 0.06, -HD + 0.015)
  batch.box(M.walnutDark, 0.03, 0.12, ROOM.depth, -HW + 0.015, 0.06, 0)
  batch.box(M.walnutDark, 0.03, 0.12, ROOM.depth, HW - 0.015, 0.06, 0)
  const coveY = H - 0.1
  batch.box(M.amberLed, ROOM.width - 0.2, 0.025, 0.04, 0, coveY, HD - 0.1)
  batch.box(M.amberLed, ROOM.width - 0.2, 0.025, 0.04, 0, coveY, -HD + 0.1)
  batch.box(M.amberLed, 0.04, 0.025, ROOM.depth - 0.2, -HW + 0.1, coveY, 0)
  batch.box(M.amberLed, 0.04, 0.025, ROOM.depth - 0.2, HW - 0.1, coveY, 0)
  // Cove lip hides the LED source
  batch.box(M.charcoal, ROOM.width, 0.12, 0.12, 0, H - 0.06, HD - 0.06)
  batch.box(M.charcoal, ROOM.width, 0.12, 0.12, 0, H - 0.06, -HD + 0.06)
  batch.box(M.charcoal, 0.12, 0.12, ROOM.depth, -HW + 0.06, H - 0.06, 0)
  batch.box(M.charcoal, 0.12, 0.12, ROOM.depth, HW - 0.06, H - 0.06, 0)

  // Ceiling: acoustic walnut panels + recessed downlights
  for (let ix = 0; ix < 3; ix += 1) {
    for (let iz = 0; iz < 2; iz += 1) {
      batch.box(M.walnutDark, 2.6, 0.04, 2.8, -3 + ix * 3, H - 0.03, -2 + iz * 3.4)
    }
  }
  for (let ix = 0; ix < 4; ix += 1) {
    for (let iz = 0; iz < 3; iz += 1) {
      batch.disc(M.warmWhite, 0.07, -3.6 + ix * 2.4, H - 0.055, -2.6 + iz * 2.6, 16)
    }
  }

  // --- TV wall ---
  for (let i = 0; i < 72; i += 1) {
    const x = -4.26 + i * 0.12
    batch.box(i % 3 === 0 ? M.walnutDark : M.walnut, 0.07, H - 0.2, 0.05, x, 0.1 + (H - 0.2) / 2, -HD + 0.04)
  }
  batch.box(M.amberLed, 0.03, H - 0.4, 0.02, -4.45, H / 2, -HD + 0.012)
  batch.box(M.amberLed, 0.03, H - 0.4, 0.02, 4.45, H / 2, -HD + 0.012)

  const TV = { cx: 0, cy: 1.62, w: 2.2, h: 1.24, z: -HD + 0.14 }
  batch.box(M.black, TV.w + 0.14, TV.h + 0.14, 0.07, TV.cx, TV.cy, TV.z - 0.035)
  // TV console, soundbar, speakers, subwoofer
  batch.box(M.walnut, 3.4, 0.44, 0.46, 0, 0.24, -HD + 0.26)
  batch.box(M.walnutDark, 1.62, 0.34, 0.01, -0.85, 0.24, -HD + 0.495)
  batch.box(M.walnutDark, 1.62, 0.34, 0.01, 0.85, 0.24, -HD + 0.495)
  ;[-1.6, 1.6].forEach((x) => batch.cyl(M.brass, 0.02, 0.015, 0.02, x, 0.01, -HD + 0.4, 8))
  batch.box(M.black, 1.3, 0.07, 0.1, 0, 0.5, -HD + 0.3)
  solid(-1.7, 1.7, -HD, -HD + 0.5, 0.48)
  ;[-2.45, 2.45].forEach((x) => {
    batch.box(M.black, 0.42, 1.5, 0.36, x, 0.75, -HD + 0.33)
    batch.cyl(M.charcoal, 0.14, 0.14, 0.03, x, 1.15, -HD + 0.52, 20, Math.PI / 2)
    batch.cyl(M.charcoal, 0.1, 0.1, 0.03, x, 0.72, -HD + 0.52, 20, Math.PI / 2)
    batch.cyl(M.steel, 0.04, 0.04, 0.035, x, 1.15, -HD + 0.52, 12, Math.PI / 2)
    solid(x - 0.21, x + 0.21, -HD, -HD + 0.52, 1.5)
  })
  batch.box(M.black, 0.5, 0.5, 0.5, -3.3, 0.25, -HD + 0.35)
  batch.cyl(M.charcoal, 0.18, 0.18, 0.03, -3.3, 0.25, -HD + 0.61, 20, Math.PI / 2)
  solid(-3.55, -3.05, -HD, -HD + 0.6, 0.5)

  const plant = (x, z, s = 1) => {
    batch.cyl(M.terracotta, 0.2 * s, 0.15 * s, 0.38 * s, x, 0.19 * s, z, 16)
    batch.cyl(M.walnutDark, 0.19 * s, 0.19 * s, 0.03, x, 0.38 * s, z, 16)
    const spots = [[0, 0.8, 0, 1], [0.14, 0.62, 0.05, 0.8], [-0.12, 0.66, -0.06, 0.85], [0.04, 0.95, -0.1, 0.7], [-0.1, 0.9, 0.1, 0.65]]
    spots.forEach(([dx, dy, dz, k], i) => {
      batch.sphere(i % 2 ? M.leaf2 : M.leaf, 0.24 * k * s, x + dx * s, dy * s + 0.2 * s, z + dz * s, 1, 1.5, 1, 1)
    })
    solid(x - 0.22 * s, x + 0.22 * s, z - 0.22 * s, z + 0.22 * s, 0.4 * s)
  }
  plant(-4.35, -HD + 0.45, 1.5)
  plant(4.35, -HD + 0.45, 1.5)
  plant(4.4, HD - 0.45, 1.3)
  plant(-4.4, HD - 0.5, 1.1)

  // --- Rug (sing zone) ---
  const rugTex = track(rugTexture())
  const rug = new THREE.Mesh(
    new THREE.PlaneGeometry(4.6, 3.1),
    track(new THREE.MeshStandardMaterial({ map: rugTex, roughness: 1 })),
  )
  track(rug.geometry)
  rug.rotation.x = -Math.PI / 2
  rug.position.set(0, 0.008, -1.6)
  group.add(rug)

  // Mic stand on the rug
  batch.cyl(M.black, 0.16, 0.18, 0.025, 1.9, 0.0125, -2.5, 20)
  batch.cyl(M.black, 0.012, 0.012, 1.45, 1.9, 0.75, -2.5, 8)
  batch.cyl(M.black, 0.05, 0.03, 0.14, 1.9, 1.5, -2.5, 10, 0.35)
  batch.sphere(M.steel, 0.035, 1.9, 1.575, -2.54, 1, 1, 1, 1)

  // --- Sofa builder (default faces -Z, back toward +Z) ---
  const sofa = (len, fabric, pillows) => {
    const seats = Math.max(2, Math.round(len / 1.2))
    batch.box(fabric, len, 0.4, 0.95, 0, 0.2, 0)
    batch.box(fabric, len, 0.62, 0.22, 0, 0.7, 0.365)
    batch.box(fabric, 0.2, 0.62, 0.95, -len / 2 + 0.1, 0.5, 0)
    batch.box(fabric, 0.2, 0.62, 0.95, len / 2 - 0.1, 0.5, 0)
    const sw = (len - 0.4) / seats
    for (let i = 0; i < seats; i += 1) {
      batch.box(fabric, sw - 0.03, 0.17, 0.72, -len / 2 + 0.2 + sw * (i + 0.5), 0.485, -0.08)
      batch.box(fabric, sw - 0.05, 0.4, 0.14, -len / 2 + 0.2 + sw * (i + 0.5), 0.78, 0.2, 0.18)
    }
    ;[-1, 1].forEach((s) => {
      batch.cyl(M.brass, 0.025, 0.02, 0.1, s * (len / 2 - 0.1), 0.05, 0.35, 8)
      batch.cyl(M.brass, 0.025, 0.02, 0.1, s * (len / 2 - 0.1), 0.05, -0.35, 8)
    })
    pillows.forEach(([mat, x, y, rz, ry]) => batch.box(mat, 0.4, 0.4, 0.12, x, y - 0.03, 0.14, 0.15, ry || 0, rz))
  }

  // Back-wall sofa facing the TV
  batch.at(1.0, HD - 0.5, 0, () => {
    sofa(4.6, M.leather, [
      [M.mustard, -1.6, 0.8, 0.2],
      [M.teal, -1.1, 0.8, -0.1],
      [M.cream, 1.2, 0.8, 0.12],
      [M.mustard, 1.8, 0.8, -0.2],
    ])
  })
  solid(-1.3, 3.3, HD - 0.98, HD, 0.58)
  solid(-1.3, 3.3, HD - 0.3, HD, 1.0)

  // Right-wall sectional facing the room (-X)
  batch.at(HW - 0.5, -0.4, Math.PI / 2, () => {
    sofa(3.8, M.leather, [
      [M.teal, -1.2, 0.8, 0.15],
      [M.cream, -0.6, 0.8, -0.1],
      [M.mustard, 1.3, 0.8, 0.2],
    ])
  })
  solid(HW - 0.98, HW, -2.3, 1.5, 0.58)
  solid(HW - 0.3, HW, -2.3, 1.5, 1.0)

  // Coffee tables
  const coffeeTable = (x, z, w, d) => {
    batch.box(M.walnut, w, 0.05, d, x, 0.4, z)
    batch.box(M.walnutDark, w - 0.2, 0.04, d - 0.2, x, 0.16, z)
    ;[[-1, -1], [1, -1], [-1, 1], [1, 1]].forEach(([sx, sz]) =>
      batch.cyl(M.brass, 0.02, 0.02, 0.38, x + sx * (w / 2 - 0.06), 0.19, z + sz * (d / 2 - 0.06), 8))
    solid(x - w / 2, x + w / 2, z - d / 2, z + d / 2, 0.43)
  }
  coffeeTable(1.0, 2.05, 1.6, 0.75)
  coffeeTable(3.05, -0.4, 0.75, 1.5)
  // Centerpiece bowl + remote on main coffee table (leaving coaster spots free for player drinks)
  batch.cyl(M.cream, 0.11, 0.075, 0.055, 1.0, 0.452, 2.05, 16)
  batch.box(M.black, 0.14, 0.022, 0.045, 0.7, 0.438, 2.04)

  // --- Upgraded Juice Bar (left wall) ---
  // Front bar counter shifted slightly right so the bartender walkway (-4.72 to -3.82) is comfortable
  batch.box(M.walnut, 0.66, 1.0, 4.0, -3.48, 0.5, -0.6)
  batch.box(M.walnutDark, 0.02, 0.7, 3.7, -3.14, 0.55, -0.6)
  batch.box(M.oak, 0.84, 0.06, 4.15, -3.44, 1.03, -0.6)
  batch.cyl(M.brass, 0.022, 0.022, 4.0, -3.02, 0.22, -0.6, 8, Math.PI / 2)
  batch.box(M.tealLed, 0.02, 0.025, 3.7, -3.14, 0.07, -0.6)
  solid(-3.82, -3.05, -2.68, 1.48, 1.06)

  // Bartender station floor mat behind the bar
  batch.box(M.charcoal, 0.55, 0.014, 1.4, -4.22, 0.007, -0.6)
  batch.box(M.tealLed, 0.58, 0.008, 1.44, -4.22, 0.004, -0.6)

  // Juice Bar prep station on counter: Blender, Cocktail Shaker, Fruit Bowl, Juice Dispensers
  // 1) High-speed Blender at (-3.62, 1.06, -0.85)
  batch.box(M.charcoal, 0.18, 0.12, 0.18, -3.62, 1.12, -0.85)
  batch.cyl(M.steel, 0.06, 0.07, 0.03, -3.62, 1.19, -0.85, 12)
  batch.cyl(M.glassClear, 0.075, 0.06, 0.22, -3.62, 1.31, -0.85, 12)
  batch.cyl(M.coralLed, 0.065, 0.052, 0.14, -3.62, 1.28, -0.85, 10)
  batch.cyl(M.black, 0.08, 0.078, 0.03, -3.62, 1.43, -0.85, 12)

  // 2) Stainless Cocktail Shaker & Jigger on bar mat at (-3.58, 1.06, -0.45)
  batch.box(M.charcoal, 0.26, 0.01, 0.52, -3.55, 1.065, -0.45)
  batch.cyl(M.steel, 0.042, 0.032, 0.16, -3.58, 1.15, -0.42, 12)
  batch.cyl(M.steel, 0.028, 0.04, 0.06, -3.58, 1.25, -0.42, 12)
  batch.cyl(M.brass, 0.022, 0.015, 0.07, -3.56, 1.105, -0.58, 10)

  // 3) Fresh Fruit Basket at (-3.6, 1.06, 0.15)
  batch.box(M.walnutDark, 0.24, 0.07, 0.38, -3.6, 1.095, 0.15)
  batch.sphere(M.amberLed, 0.042, -3.62, 1.14, 0.05, 1, 1, 1, 1)
  batch.sphere(M.coralLed, 0.038, -3.56, 1.14, 0.14, 1, 1, 1, 1)
  batch.sphere(M.leaf2, 0.038, -3.63, 1.14, 0.22, 1, 1, 1, 1)
  batch.sphere(M.mustard, 0.044, -3.57, 1.15, 0.27, 1, 1, 1, 1)

  // 4) Three glowing Juice Dispenser Towers on the back counter (-4.82, 0.92, z)
  ;[
    [-1.35, M.tealLed],
    [-0.6, M.coralLed],
    [0.15, M.amberLed],
  ].forEach(([jz, jMat]) => {
    batch.box(M.charcoal, 0.2, 0.1, 0.2, -HW + 0.18, 0.95, jz)
    batch.cyl(M.glassClear, 0.085, 0.085, 0.26, -HW + 0.18, 1.13, jz, 14)
    batch.cyl(jMat, 0.076, 0.076, 0.21, -HW + 0.18, 1.11, jz, 12)
    batch.cyl(M.brass, 0.09, 0.09, 0.025, -HW + 0.18, 1.27, jz, 14)
  })

  // Brass serving coasters on bar counter and coffee tables for drink placement
  TABLE_SLOTS.forEach((slot) => {
    batch.cyl(M.brass, 0.068, 0.068, 0.006, slot.x, slot.y + 0.003, slot.z, 16)
    batch.cyl(M.charcoal, 0.056, 0.056, 0.007, slot.x, slot.y + 0.004, slot.z, 16)
  })

  // Back bar shelves + mirror + bottles
  batch.box(M.mirror, 0.02, 1.35, 3.8, -HW + 0.02, 1.65, -0.6)
  batch.box(M.walnutDark, 0.26, 0.9, 3.9, -HW + 0.15, 0.45, -0.6)
  solid(-HW, -HW + 0.28, -2.6, 1.4, 0.92)
  const bottleMats = [M.glassAmber, M.glassGreen, M.glassClear, M.glassAmber]
  ;[1.42, 1.82, 2.22].forEach((y, row) => {
    batch.box(M.oak, 0.24, 0.035, 3.7, -HW + 0.15, y, -0.6)
    batch.box(M.amberLed, 0.02, 0.02, 3.6, -HW + 0.05, y - 0.03, -0.6)
    for (let i = 0; i < 14; i += 1) {
      const z = -2.3 + i * 0.26 + (row % 2) * 0.05
      const mat = bottleMats[(i + row) % 4]
      const hgt = 0.18 + ((i * 7 + row * 3) % 4) * 0.022
      batch.cyl(mat, 0.032, 0.032, hgt, -HW + 0.15, y + 0.018 + hgt / 2, z, 10)
      batch.cyl(mat, 0.013, 0.019, 0.06, -HW + 0.15, y + 0.018 + hgt + 0.028, z, 8)
    }
  })
  // Bar stools (aligned with ROOM_SEATS at x = -2.65)
  ;[-2.1, -1.2, -0.3, 0.6].forEach((z) => {
    const x = -2.65
    batch.cyl(M.leather, 0.2, 0.2, 0.07, x, 0.69, z, 18)
    batch.cyl(M.steel, 0.025, 0.025, 0.62, x, 0.34, z, 8)
    batch.cyl(M.steel, 0.17, 0.19, 0.02, x, 0.01, z, 16)
    batch.cyl(M.brass, 0.14, 0.14, 0.015, x, 0.27, z, 16)
    solid(x - 0.2, x + 0.2, z - 0.2, z + 0.2, 0.72)
  })

  // --- Door (back wall, left) ---
  batch.box(M.walnutDark, 1.2, 2.25, 0.05, -3.7, 1.125, HD - 0.03)
  batch.box(M.walnut, 0.98, 2.1, 0.04, -3.7, 1.05, HD - 0.065)
  ;[0.5, 1.55].forEach((y) => batch.box(M.walnutDark, 0.7, 0.6, 0.012, -3.7, y + 0.2, HD - 0.09))
  batch.cyl(M.brass, 0.018, 0.018, 0.14, -3.32, 1.0, HD - 0.1, 8, Math.PI / 2)
  batch.sphere(M.brass, 0.03, -3.32, 1.0, HD - 0.15, 1, 1, 1, 1)

  // --- Floor lamp + wall sconces ---
  batch.cyl(M.black, 0.15, 0.17, 0.03, -1.9, 0.015, HD - 0.4, 18)
  batch.cyl(M.brass, 0.01, 0.01, 1.5, -1.9, 0.78, HD - 0.4, 6)
  batch.cyl(M.shade, 0.1, 0.18, 0.28, -1.9, 1.62, HD - 0.4, 16)
  solid(-2.07, -1.73, HD - 0.57, HD - 0.23, 0.05)
  ;[-0.4, 2.4].forEach((x) => {
    batch.box(M.brass, 0.1, 0.02, 0.08, x, 2.1, HD - 0.04)
    batch.cyl(M.shade, 0.05, 0.08, 0.16, x, 2.2, HD - 0.1, 12)
  })

  // --- Contact shadows (merged soft decals) ---
  const shadowTex = track(radialTexture())
  const shadowMat = track(
    new THREE.MeshBasicMaterial({
      map: shadowTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2,
    }),
  )
  const decal = (cx, cz, w, d) => batch.add(shadowMat, batch.geo('plane', () => new THREE.PlaneGeometry(1, 1)), cx, 0.012, cz, -Math.PI / 2, 0, 0, w, d, 1)
  decal(1.0, HD - 0.5, 5.6, 1.9)
  decal(HW - 0.5, -0.4, 1.9, 4.8)
  decal(1.0, 2.05, 2.2, 1.3)
  decal(3.05, -0.4, 1.3, 2.0)
  decal(-3.7, -0.6, 1.5, 4.8)
  decal(-3.0, -0.75, 0.9, 3.4)
  decal(0, -HD + 0.3, 4.6, 1.2)
  decal(-2.45, -HD + 0.4, 0.9, 0.9)
  decal(2.45, -HD + 0.4, 0.9, 0.9)
  decal(-4.35, -HD + 0.45, 0.9, 0.9)
  decal(4.35, -HD + 0.45, 0.9, 0.9)
  decal(4.4, HD - 0.45, 0.8, 0.8)

  // --- Posters (individual textured planes) ---
  const posterMats = [0, 1, 2].map((k) => track(new THREE.MeshStandardMaterial({ map: track(posterTexture(k)), roughness: 0.8 })))
  const poster = (k, x, y, z, ry) => {
    const g = new THREE.PlaneGeometry(0.55, 0.77)
    track(g)
    const m = new THREE.Mesh(g, posterMats[k])
    m.position.set(x, y, z)
    m.rotation.y = ry
    group.add(m)
    const rx = Math.cos(ry)
    const rz = -Math.sin(ry)
    const nx = Math.sin(ry)
    const nz = Math.cos(ry)
    const frame = (w, h, ox, oy) =>
      batch.box(M.black, w, h, 0.03, x + rx * ox + nx * 0.015, y + oy, z + rz * ox + nz * 0.015, 0, ry, 0)
    frame(0.6, 0.03, 0, 0.4)
    frame(0.6, 0.03, 0, -0.4)
    frame(0.03, 0.83, 0.3, 0)
    frame(0.03, 0.83, -0.3, 0)
  }
  poster(0, -0.4, 1.75, HD - 0.015, Math.PI)
  poster(1, 0.7, 1.75, HD - 0.015, Math.PI)
  poster(2, 1.8, 1.75, HD - 0.015, Math.PI)
  poster(1, 2.9, 1.75, HD - 0.015, Math.PI)
  poster(2, HW - 0.015, 1.75, -1.6, -Math.PI / 2)
  poster(0, HW - 0.015, 1.75, -0.4, -Math.PI / 2)
  poster(1, HW - 0.015, 1.75, 0.8, -Math.PI / 2)

  // --- Neon signs ---
  const neonPlane = (text, color, w, h, x, y, z, ry, font) => {
    const tex = track(neonTexture(text, color, 1024, Math.round(1024 * (h / w)), font))
    const mat = track(new THREE.MeshBasicMaterial({ map: tex, transparent: true, toneMapped: false, depthWrite: false }))
    const g = new THREE.PlaneGeometry(w, h)
    track(g)
    const m = new THREE.Mesh(g, mat)
    m.position.set(x, y, z)
    m.rotation.y = ry
    group.add(m)
    return mat
  }
  const signMats = [
    neonPlane('SAKI KARAOKE', '#ff6f61', 2.7, 0.55, 0, 2.75, -HD + 0.075, 0, 'bold 118px "Trebuchet MS", Arial, sans-serif'),
    neonPlane('JUICE BAR', '#35d6c9', 1.85, 0.45, -HW + 0.045, 2.68, -0.6, Math.PI / 2, 'bold 148px "Trebuchet MS", Arial, sans-serif'),
  ]

  batch.build(group)

  // --- Dynamic 3D drinks placed on bar counter & coffee tables ---
  const drinksGroup = new THREE.Group()
  drinksGroup.name = 'PlacedTableDrinks'
  group.add(drinksGroup)

  const drinkGlassGeo = track(new THREE.CylinderGeometry(0.044, 0.034, 0.135, 14, 1, true))
  const drinkLiquidGeo = track(new THREE.CylinderGeometry(0.039, 0.031, 0.105, 14))
  const drinkRimGeo = track(new THREE.TorusGeometry(0.043, 0.004, 8, 18))
  drinkRimGeo.rotateX(Math.PI / 2)
  const drinkStrawGeo = track(new THREE.CylinderGeometry(0.0045, 0.0045, 0.16, 8))
  const drinkIceGeo = track(new THREE.BoxGeometry(0.022, 0.022, 0.022))
  const drinkRingGeo = track(new THREE.RingGeometry(0.052, 0.068, 20))
  drinkRingGeo.rotateX(-Math.PI / 2)

  const drinkMatCache = new Map()
  const getDrinkMat = (hex, glowMode = false) => {
    const key = `${hex}|${glowMode}`
    if (!drinkMatCache.has(key)) {
      const m = glowMode
        ? track(new THREE.MeshBasicMaterial({ color: hex, toneMapped: false }))
        : track(new THREE.MeshStandardMaterial({ color: hex, roughness: 0.2, metalness: 0.05, transparent: true, opacity: 0.92 }))
      drinkMatCache.set(key, m)
    }
    return drinkMatCache.get(key)
  }

  let currentDrinkSig = ''
  function syncTableDrinks(tableDrinks = []) {
    const sig = tableDrinks.map((d) => `${d.id}:${d.slotId}:${d.drinkKey}:${d.sips || 3}`).join('|')
    if (sig === currentDrinkSig) return
    currentDrinkSig = sig
    drinksGroup.clear()

    tableDrinks.forEach((d) => {
      const slot = TABLE_SLOT_MAP.get(d.slotId)
      if (!slot) return
      const itemGroup = new THREE.Group()
      itemGroup.position.set(slot.x, slot.y + 0.006, slot.z)
      itemGroup.userData.drink = d

      const glassMesh = new THREE.Mesh(drinkGlassGeo, M.glassClear)
      glassMesh.position.y = 0.068
      itemGroup.add(glassMesh)

      const fillRatio = Math.max(0.35, (d.sips ?? 3) / (d.maxSips ?? 3))
      const liqMesh = new THREE.Mesh(drinkLiquidGeo, getDrinkMat(d.color || '#35d6c9', false))
      liqMesh.scale.y = fillRatio
      liqMesh.position.y = 0.012 + 0.052 * fillRatio
      itemGroup.add(liqMesh)

      const rimMesh = new THREE.Mesh(drinkRimGeo, getDrinkMat(d.rimColor || '#ffffff', true))
      rimMesh.position.y = 0.135
      itemGroup.add(rimMesh)

      const strawMesh = new THREE.Mesh(drinkStrawGeo, getDrinkMat(d.strawColor || '#ff6f61', true))
      strawMesh.position.set(0.014, 0.095, 0.006)
      strawMesh.rotation.z = -0.22
      itemGroup.add(strawMesh)

      const iceMesh = new THREE.Mesh(drinkIceGeo, M.warmWhite)
      iceMesh.position.set(-0.01, 0.02 + 0.085 * fillRatio, -0.005)
      iceMesh.rotation.set(0.3, 0.5, 0.2)
      itemGroup.add(iceMesh)

      const baseRing = new THREE.Mesh(drinkRingGeo, getDrinkMat(d.color || '#35d6c9', true))
      baseRing.position.y = 0.002
      itemGroup.add(baseRing)

      drinksGroup.add(itemGroup)
    })
  }

  // --- Disco ball + moving beams ---
  const discoGroup = new THREE.Group()
  discoGroup.position.set(0, 2.88, -1.0)
  const rodGeo = track(new THREE.CylinderGeometry(0.008, 0.008, 0.3, 6))
  const rod = new THREE.Mesh(rodGeo, M.steel)
  rod.position.y = 0.28
  discoGroup.add(rod)
  const ballGeo = track(new THREE.IcosahedronGeometry(0.26, 2))
  const ball = new THREE.Mesh(
    ballGeo,
    track(new THREE.MeshStandardMaterial({ color: 0xdfe4e6, metalness: 1, roughness: 0.12, flatShading: true, envMapIntensity: 1.6 })),
  )
  discoGroup.add(ball)
  group.add(discoGroup)

  const beamTex = track(beamTexture())
  const beamGeo = track(new THREE.ConeGeometry(0.85, 2.75, 24, 1, true))
  beamGeo.translate(0, -1.375, 0)
  const beams = [
    { color: 0xffb14a, x: -1.8, z: -2.4, ph: 0 },
    { color: 0x35d6c9, x: 1.8, z: -2.4, ph: 2 },
    { color: 0xff6f61, x: 0, z: -0.9, ph: 4 },
  ].map((b) => {
    const mat = track(new THREE.MeshBasicMaterial({
      color: b.color, map: beamTex, transparent: true, opacity: 0.05, depthWrite: false,
      blending: THREE.AdditiveBlending, side: THREE.DoubleSide, toneMapped: false,
    }))
    const mesh = new THREE.Mesh(beamGeo, mat)
    mesh.position.set(b.x, H - 0.1, b.z)
    group.add(mesh)
    return { ...b, mesh, mat }
  })

  // --- TV screen "hole" (lets the CSS3D iframe behind the canvas show through) ---
  const holeMat = track(new THREE.MeshBasicMaterial({
    color: 0x000000, opacity: 0, blending: THREE.NoBlending, side: THREE.DoubleSide,
  }))
  const holeGeo = track(new THREE.PlaneGeometry(TV.w, TV.h))
  const screen = new THREE.Mesh(holeGeo, holeMat)
  screen.position.set(TV.cx, TV.cy, TV.z + 0.002)
  screen.name = 'TVScreen'
  group.add(screen)

  // --- Lights (few, physically-based) ---
  const lights = []
  const hemi = new THREE.HemisphereLight(0xfff0dc, 0x3a2b20, 0.5)
  group.add(hemi)
  const warm = (x, z, i) => {
    const l = new THREE.PointLight(0xffc27a, i, 11, 2)
    l.position.set(x, 2.7, z)
    group.add(l)
    lights.push(l)
  }
  warm(-2.5, -1.2, 16)
  warm(2.5, -1.2, 16)
  warm(0.5, 2.3, 14)
  const tvLight = new THREE.PointLight(0xd7e6ff, 0, 7, 2)
  tvLight.position.set(0, TV.cy, -HD + 1.1)
  group.add(tvLight)
  const rimLight = new THREE.PointLight(0x35d6c9, 6, 6, 2)
  rimLight.position.set(-3.6, 1.6, -0.6)
  group.add(rimLight)

  const tvCenter = new THREE.Vector3(TV.cx, TV.cy, TV.z + 0.002)

  function update(dt, t, { playing = false, beat = 0 } = {}) {
    ball.rotation.y += dt * (playing ? 0.9 : 0.3)
    const energy = playing ? 1 : 0.35
    beams.forEach((b, i) => {
      const k = t * (0.5 + i * 0.13) + b.ph
      b.mesh.rotation.z = Math.sin(k) * 0.32 * energy
      b.mesh.rotation.x = Math.cos(k * 0.8) * 0.28 * energy
      const pulse = playing ? 0.5 + 0.5 * Math.sin(beat * Math.PI * 2 + i * 2.1) : 0
      b.mat.opacity = 0.04 + (playing ? 0.05 : 0.0) + pulse * 0.035
    })
    const flicker = 0.94 + Math.sin(t * 23) * 0.02 + Math.sin(t * 7.3) * 0.03
    signMats.forEach((m) => {
      m.opacity = flicker
    })
    const target = playing ? 5.5 : 0.8
    tvLight.intensity += (target - tvLight.intensity) * Math.min(1, dt * 4)
  }

  function dispose() {
    group.traverse((o) => {
      if (o.geometry) o.geometry.dispose()
    })
    disposables.forEach((d) => {
      if (d.isTexture || d.isMaterial || d.isBufferGeometry) {
        if (d.isMaterial) {
          Object.values(d).forEach((v) => v?.isTexture && v.dispose())
        }
        d.dispose()
      }
    })
    group.clear()
  }

  return {
    group,
    colliders,
    update,
    dispose,
    syncTableDrinks,
    tv: { center: tvCenter, width: TV.w, height: TV.h, lightPos: tvLight.position },
    spawnPoints: [
      [-1.2, 1.0], [0, 1.0], [1.2, 1.0], [-1.8, 0.4], [2.2, 0.4], [-0.6, 0.0], [0.6, 0.0], [0, -0.6],
    ],
  }
}
