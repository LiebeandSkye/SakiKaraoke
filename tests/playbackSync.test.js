import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  expectedPlaybackTime,
  getDriftCorrection,
  getRemoteTargetTime,
  scheduleControl,
} from '../src/shared/playbackSync.js'

describe('playback sync helpers', () => {
  it('advances expected time only while playback is running', () => {
    assert.equal(
      expectedPlaybackTime({ isPlaying: true, timeSec: 10, updatedAtMs: 1000 }, 3500),
      12.5,
    )
    assert.equal(
      expectedPlaybackTime({ isPlaying: false, timeSec: 10, updatedAtMs: 1000 }, 3500),
      10,
    )
  })

  it('returns drift correction only when clients are off by more than threshold', () => {
    assert.deepEqual(
      getDriftCorrection({ expectedTimeSec: 12.2, localTimeSec: 11, thresholdSec: 1 }),
      { shouldCorrect: true, targetTimeSec: 12.2, driftSec: 1.2 },
    )
    assert.deepEqual(
      getDriftCorrection({ expectedTimeSec: 12, localTimeSec: 11.1, thresholdSec: 1 }),
      { shouldCorrect: false, targetTimeSec: 12, driftSec: 0.9 },
    )
  })

  it('calculates remote target time from server clock for scheduled controls', () => {
    assert.equal(
      getRemoteTargetTime(
        { isPlaying: true, timeSec: 30, updatedAtMs: 10000 },
        11250,
      ),
      31.25,
    )
  })

  it('creates a delayed control payload with versioned playback state', () => {
    const payload = scheduleControl({
      nowMs: 1000,
      delayMs: 250,
      type: 'play',
      playback: { isPlaying: true, timeSec: 5, version: 2 },
    })

    assert.deepEqual(payload, {
      type: 'play',
      applyAtMs: 1250,
      playback: {
        isPlaying: true,
        timeSec: 5,
        updatedAtMs: 1250,
        version: 3,
      },
    })
  })
})
