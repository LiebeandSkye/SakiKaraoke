import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  extractYoutubeVideoId,
  isValidYoutubeUrl,
  normalizeYoutubeUrl,
  parseIso8601DurationToSeconds,
} from '../src/shared/youtubeUrl.js'

describe('youtubeUrl helpers', () => {
  it('extracts video ids from common YouTube URL shapes', () => {
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    )
    assert.equal(extractYoutubeVideoId('https://youtu.be/dQw4w9WgXcQ?t=43'), 'dQw4w9WgXcQ')
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'),
      'dQw4w9WgXcQ',
    )
    assert.equal(
      extractYoutubeVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ?feature=share'),
      'dQw4w9WgXcQ',
    )
  })

  it('rejects non-YouTube and malformed video URLs', () => {
    assert.equal(isValidYoutubeUrl('https://example.com/watch?v=dQw4w9WgXcQ'), false)
    assert.equal(isValidYoutubeUrl('not a url'), false)
    assert.equal(extractYoutubeVideoId('https://www.youtube.com/watch?v=too-short'), null)
  })

  it('normalizes accepted URLs to canonical watch URLs', () => {
    assert.equal(
      normalizeYoutubeUrl('https://youtu.be/dQw4w9WgXcQ?t=43'),
      'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
    )
  })

  it('parses YouTube ISO 8601 durations into seconds', () => {
    assert.equal(parseIso8601DurationToSeconds('PT3M42S'), 222)
    assert.equal(parseIso8601DurationToSeconds('PT1H2M3S'), 3723)
    assert.equal(parseIso8601DurationToSeconds('PT45S'), 45)
  })
})
