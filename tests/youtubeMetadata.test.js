import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildKaraokeSearchQuery,
  extractYoutubePlayerMetadata,
  KARAOKE_SEARCH_SUFFIXES,
} from '../server/youtube.js'

describe('youtube metadata helpers', () => {
  it('extracts title, thumbnail, and duration from YouTube player HTML', () => {
    const html = `
      <script>
        var ytInitialPlayerResponse = {
          "videoDetails": {
            "title": "Artist - Track",
            "lengthSeconds": "213",
            "thumbnail": {
              "thumbnails": [
                { "url": "https://img.example/small.jpg" },
                { "url": "https://img.example/large.jpg" }
              ]
            }
          }
        };
      </script>
    `

    assert.deepEqual(extractYoutubePlayerMetadata(html, 'dQw4w9WgXcQ'), {
      title: 'Artist - Track',
      durationSec: 213,
      thumbnail: 'https://img.example/large.jpg',
    })
  })
})

describe('karaoke youtube search', () => {
  it('builds karaoke-oriented search queries from clean LRCLIB metadata', () => {
    assert.equal(
      buildKaraokeSearchQuery('The Weeknd', 'Blinding Lights'),
      'The Weeknd Blinding Lights karaoke',
    )
    assert.equal(
      buildKaraokeSearchQuery('The Weeknd', 'Blinding Lights', 'instrumental karaoke'),
      'The Weeknd Blinding Lights instrumental karaoke',
    )
  })

  it('prefers karaoke suffixes over official audio', () => {
    assert.deepEqual(KARAOKE_SEARCH_SUFFIXES, [
      'karaoke',
      'instrumental karaoke',
      'karaoke version',
    ])
    assert.ok(!KARAOKE_SEARCH_SUFFIXES.some((suffix) => suffix.includes('official audio')))
  })
})
