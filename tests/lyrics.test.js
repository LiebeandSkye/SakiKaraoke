import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  getActiveLyricWindow,
  parseSyncedLyrics,
} from '../src/shared/lyrics.js'

describe('lyrics helpers', () => {
  it('parses synced LRC timestamps into sorted lyric lines', () => {
    const lines = parseSyncedLyrics(`
[00:12.50] Second line
[00:01.20] First line
[bad] ignored
`)

    assert.deepEqual(lines, [
      { id: '1.2-0', timeSec: 1.2, text: 'First line' },
      { id: '12.5-1', timeSec: 12.5, text: 'Second line' },
    ])
  })

  it('returns current, next, and progress for low-latency lyric display', () => {
    const lines = parseSyncedLyrics(`
[00:10.00] Current line
[00:12.00] Next line
[00:20.00] Later line
`)

    assert.deepEqual(getActiveLyricWindow(lines, 11), {
      currentIndex: 0,
      current: { id: '10-0', timeSec: 10, text: 'Current line' },
      next: { id: '12-1', timeSec: 12, text: 'Next line' },
      progress: 0.5,
    })
  })

  it('falls back cleanly before the first lyric line and after the last', () => {
    const lines = parseSyncedLyrics(`
[00:10.00] First line
[00:12.00] Last line
`)

    assert.equal(getActiveLyricWindow(lines, 5).current, null)
    assert.equal(getActiveLyricWindow(lines, 5).next.text, 'First line')
    assert.equal(getActiveLyricWindow(lines, 30).current.text, 'Last line')
    assert.equal(getActiveLyricWindow(lines, 30).next, null)
    assert.equal(getActiveLyricWindow(lines, 30).progress, 1)
  })
})
