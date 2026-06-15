import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildLrclibGetUrl,
  normalizeLrclibRecord,
  pickBestLrclibRecord,
} from '../server/lrclib.js'

describe('lrclib helpers', () => {
  it('builds cached get URLs with LRCLIB signature query parameters', () => {
    const url = buildLrclibGetUrl({
      trackName: 'I Want to Live',
      artistName: 'Borislav Slavov',
      albumName: "Baldur's Gate 3",
      duration: 233,
      cached: true,
    })

    assert.equal(
      url,
      "https://lrclib.net/api/get-cached?track_name=I+Want+to+Live&artist_name=Borislav+Slavov&album_name=Baldur%27s+Gate+3&duration=233",
    )
  })

  it('normalizes LRCLIB records into the app song metadata shape', () => {
    assert.deepEqual(
      normalizeLrclibRecord({
        id: 123,
        trackName: 'Track',
        artistName: 'Artist',
        albumName: 'Album',
        duration: 190,
        instrumental: false,
        plainLyrics: 'plain',
        syncedLyrics: '[00:01.00] synced',
      }),
      {
        lrclibId: 123,
        trackName: 'Track',
        artistName: 'Artist',
        albumName: 'Album',
        duration: 190,
        instrumental: false,
        plainLyrics: 'plain',
        syncedLyrics: '[00:01.00] synced',
        hasSyncedLyrics: true,
      },
    )
  })

  it('prefers duration matches within two seconds and synced lyrics', () => {
    const records = [
      { id: 1, duration: 208, syncedLyrics: '[00:01.00] wrong duration' },
      { id: 2, duration: 213, plainLyrics: 'plain only' },
      { id: 3, duration: 214, syncedLyrics: '[00:01.00] synced' },
    ]

    assert.equal(pickBestLrclibRecord(records, 212)?.id, 3)
  })
})
