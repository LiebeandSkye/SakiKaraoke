import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  readMediaDuration,
  readMediaTime,
  seekMediaTo,
} from '../src/shared/mediaElement.js'

describe('media element helpers', () => {
  it('reads current time from ReactPlayer v3 media refs', () => {
    assert.equal(readMediaTime({ currentTime: 42.25 }), 42.25)
  })

  it('falls back to ReactPlayer v2 getCurrentTime refs', () => {
    assert.equal(readMediaTime({ getCurrentTime: () => 17.5 }), 17.5)
  })

  it('seeks using media element currentTime when seekTo is unavailable', () => {
    const media = { currentTime: 0 }

    assert.equal(seekMediaTo(media, 31.75), true)
    assert.equal(media.currentTime, 31.75)
  })

  it('reads finite media duration and ignores invalid values', () => {
    assert.equal(readMediaDuration({ duration: 123 }), 123)
    assert.equal(readMediaDuration({ duration: Number.POSITIVE_INFINITY }), null)
  })
})
