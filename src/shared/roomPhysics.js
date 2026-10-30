/**
 * Pure (DOM/Three-free) movement + collision helpers for the 3D karaoke room.
 * Coordinates are metres. +Y is up, the TV wall is at z = -depth/2.
 */

export const ROOM = { width: 10, depth: 8, height: 3.2 }

export const PLAYER = {
  radius: 0.3,
  walkSpeed: 2.2,
  runSpeed: 4.0,
  jumpSpeed: 4.8,
  gravity: 14,
  stepHeight: 0.2,
}

/** Player centre must stay inside these bounds (walls minus body radius and a small margin). */
export const WALK_BOUNDS = {
  minX: -ROOM.width / 2 + 0.42,
  maxX: ROOM.width / 2 - 0.42,
  minZ: -ROOM.depth / 2 + 0.42,
  maxZ: ROOM.depth / 2 - 0.42,
}

export function createPlayerState(x = 0, z = 0, yaw = 0) {
  return { x, y: 0, z, vx: 0, vz: 0, vy: 0, yaw, grounded: true, speed: 0 }
}

function moveAxis(s, axis, delta, boxes, opts) {
  if (delta === 0) return
  s[axis] += delta
  const r = opts.radius
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    if (s.y >= b.top - opts.stepHeight) continue
    if (s.x > b.minX - r && s.x < b.maxX + r && s.z > b.minZ - r && s.z < b.maxZ + r) {
      if (axis === 'x') {
        s.x = delta > 0 ? b.minX - r : b.maxX + r
        s.vx = 0
      } else {
        s.z = delta > 0 ? b.minZ - r : b.maxZ + r
        s.vz = 0
      }
    }
  }
}

/** Highest walkable surface under the player (0 = floor). */
export function groundHeight(s, boxes, opts = PLAYER) {
  let ground = 0
  for (let i = 0; i < boxes.length; i += 1) {
    const b = boxes[i]
    if (
      s.x > b.minX - 0.1 && s.x < b.maxX + 0.1 &&
      s.z > b.minZ - 0.1 && s.z < b.maxZ + 0.1 &&
      s.y >= b.top - opts.stepHeight - 0.001 &&
      b.top > ground
    ) {
      ground = b.top
    }
  }
  return ground
}

/**
 * Advances the player one frame.
 * input: { dirX, dirZ } world-space unit (or zero) move direction, run, jump.
 */
export function stepPlayer(s, input, dt, boxes = [], opts = PLAYER, bounds = WALK_BOUNDS) {
  const maxSpeed = input.run ? opts.runSpeed : opts.walkSpeed
  const accel = s.grounded ? 14 : 3.5
  const k = 1 - Math.exp(-accel * dt)
  s.vx += (input.dirX * maxSpeed - s.vx) * k
  s.vz += (input.dirZ * maxSpeed - s.vz) * k

  if (input.jump && s.grounded) {
    s.vy = opts.jumpSpeed
    s.grounded = false
  }
  s.vy -= opts.gravity * dt

  moveAxis(s, 'x', s.vx * dt, boxes, opts)
  moveAxis(s, 'z', s.vz * dt, boxes, opts)
  s.x = Math.min(bounds.maxX, Math.max(bounds.minX, s.x))
  s.z = Math.min(bounds.maxZ, Math.max(bounds.minZ, s.z))

  s.y += s.vy * dt
  const ground = groundHeight(s, boxes, opts)
  if (s.y <= ground && s.vy <= 0) {
    s.y = ground
    s.vy = 0
    s.grounded = true
  } else if (s.y > ground + 0.02) {
    s.grounded = false
  }

  s.speed = Math.hypot(s.vx, s.vz)
  return s
}

/** Shortest signed angle difference b - a, in (-PI, PI]. */
export function angleDelta(a, b) {
  let d = (b - a) % (Math.PI * 2)
  if (d > Math.PI) d -= Math.PI * 2
  if (d <= -Math.PI) d += Math.PI * 2
  return d
}

/**
 * Largest camera distance along `dir` (unit vector from target) that keeps the camera inside the room.
 */
export function maxCameraDistance(target, dir, desired, margin = 0.3) {
  const lim = (pos, d, min, max) => {
    if (d > 1e-6) return (max - pos) / d
    if (d < -1e-6) return (min - pos) / d
    return Infinity
  }
  const hw = ROOM.width / 2 - margin
  const hd = ROOM.depth / 2 - margin
  const t = Math.min(
    lim(target.x, dir.x, -hw, hw),
    lim(target.z, dir.z, -hd, hd),
    lim(target.y, dir.y, 0.2, ROOM.height - 0.15),
  )
  return Math.max(0, Math.min(desired, t))
}
