import test from 'node:test'
import assert from 'node:assert/strict'
import {
  createPlayerState,
  stepPlayer,
  WALK_BOUNDS,
  angleDelta,
  maxCameraDistance,
} from '../src/shared/roomPhysics.js'

const run = (s, input, seconds, boxes = []) => {
  for (let i = 0; i < seconds * 60; i += 1) stepPlayer(s, input, 1 / 60, boxes)
  return s
}

test('player cannot walk through walls', () => {
  const s = createPlayerState(0, 0)
  run(s, { dirX: 1, dirZ: 0 }, 8)
  assert.ok(s.x <= WALK_BOUNDS.maxX + 1e-9)
})

test('walking speed converges to walk speed, running is faster', () => {
  const walk = run(createPlayerState(-3, 0), { dirX: 1, dirZ: 0 }, 1)
  const sprint = run(createPlayerState(-3, 0), { dirX: 1, dirZ: 0, run: true }, 1)
  assert.ok(walk.speed > 2 && walk.speed <= 2.2 + 1e-6)
  assert.ok(sprint.speed > walk.speed)
})

test('jump leaves the ground and lands again', () => {
  const s = createPlayerState(0, 0)
  stepPlayer(s, { dirX: 0, dirZ: 0, jump: true }, 1 / 60)
  assert.equal(s.grounded, false)
  let peak = 0
  for (let i = 0; i < 120; i += 1) {
    stepPlayer(s, { dirX: 0, dirZ: 0 }, 1 / 60)
    peak = Math.max(peak, s.y)
  }
  assert.ok(peak > 0.6 && peak < 0.9, `peak ${peak}`)
  assert.equal(s.y, 0)
  assert.equal(s.grounded, true)
})

test('tall furniture blocks, and low furniture can be jumped onto', () => {
  const sofa = { minX: 1, maxX: 2, minZ: -1, maxZ: 1, top: 0.5 }
  const blocked = run(createPlayerState(-1, 0), { dirX: 1, dirZ: 0 }, 2, [sofa])
  assert.ok(blocked.x <= sofa.minX - 0.3 + 1e-6)

  const s = createPlayerState(0.5, 0)
  let onTop = false
  for (let i = 0; i < 90; i += 1) {
    stepPlayer(s, { dirX: 1, dirZ: 0, jump: i === 0 }, 1 / 60, [sofa])
    if (s.grounded && Math.abs(s.y - 0.5) < 1e-6) onTop = true
  }
  assert.ok(onTop, 'player should be able to land on the sofa')
})

test('angleDelta picks the shortest rotation', () => {
  assert.ok(Math.abs(angleDelta(0.1, Math.PI * 2 - 0.1) + 0.2) < 1e-9)
  assert.ok(Math.abs(angleDelta(0, 1) - 1) < 1e-9)
})

test('camera distance is shortened near walls', () => {
  const d = maxCameraDistance({ x: 4.5, y: 1.4, z: 0 }, { x: 1, y: 0, z: 0 }, 3)
  assert.ok(d < 0.3)
  const free = maxCameraDistance({ x: 0, y: 1.4, z: 0 }, { x: 0, y: 0, z: 1 }, 3)
  assert.equal(free, 3)
})
