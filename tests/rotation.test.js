import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { nextSingerState } from '../src/shared/rotation.js'

describe('rotation helpers', () => {
  it('advances two singers after each segment in auto mode', () => {
    const rotation = { singerIds: ['a', 'b'], currentSingerIndex: 0, mode: 'auto' }
    assert.deepEqual(nextSingerState(rotation, 'segment-ended'), {
      singerIds: ['a', 'b'],
      currentSingerIndex: 1,
      mode: 'auto',
    })
  })

  it('advances three or more singers only after full songs in auto mode', () => {
    const rotation = { singerIds: ['a', 'b', 'c'], currentSingerIndex: 1, mode: 'auto' }
    assert.deepEqual(nextSingerState(rotation, 'segment-ended'), rotation)
    assert.deepEqual(nextSingerState(rotation, 'song-ended'), {
      singerIds: ['a', 'b', 'c'],
      currentSingerIndex: 2,
      mode: 'auto',
    })
  })

  it('wraps to the first singer', () => {
    const rotation = { singerIds: ['a', 'b', 'c'], currentSingerIndex: 2, mode: 'song' }
    assert.deepEqual(nextSingerState(rotation, 'song-ended'), {
      singerIds: ['a', 'b', 'c'],
      currentSingerIndex: 0,
      mode: 'song',
    })
  })
})
