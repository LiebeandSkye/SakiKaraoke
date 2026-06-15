import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { extractYoutubePlayerMetadata } from '../server/youtube.js'

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
