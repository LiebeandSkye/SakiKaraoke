import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  buildKaraokeSearchQuery,
  extractYoutubePlayerMetadata,
  KARAOKE_SEARCH_SUFFIXES,
  searchYoutube,
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

  it('limits YouTube API search results to embeddable syndicated videos', async () => {
    const originalApiKey = process.env.YOUTUBE_API_KEY
    const originalFetch = globalThis.fetch
    let requestedUrl

    process.env.YOUTUBE_API_KEY = 'test-key'
    globalThis.fetch = async (url) => {
      requestedUrl = String(url)
      return {
        ok: true,
        async json() {
          return {
            items: [
              {
                id: { videoId: 'abc123def45' },
                snippet: {
                  title: 'Embeddable Karaoke',
                  thumbnails: { medium: { url: 'https://img.example/video.jpg' } },
                },
              },
            ],
          }
        },
      }
    }

    try {
      const result = await searchYoutube('Artist Track karaoke')
      const apiUrl = new URL(requestedUrl)

      assert.equal(result.videoId, 'abc123def45')
      assert.equal(apiUrl.searchParams.get('videoEmbeddable'), 'true')
      assert.equal(apiUrl.searchParams.get('videoSyndicated'), 'true')
    } finally {
      process.env.YOUTUBE_API_KEY = originalApiKey
      globalThis.fetch = originalFetch
    }
  })

  it('does not fall back to unverified scraped results when API search has no embeddable match', async () => {
    const originalApiKey = process.env.YOUTUBE_API_KEY
    const originalFetch = globalThis.fetch
    const requestedUrls = []

    process.env.YOUTUBE_API_KEY = 'test-key'
    globalThis.fetch = async (url) => {
      requestedUrls.push(String(url))
      return {
        ok: true,
        async json() {
          return { items: [] }
        },
      }
    }

    try {
      const result = await searchYoutube('Artist Track karaoke')

      assert.equal(result, null)
      assert.equal(requestedUrls.length, 1)
      assert.equal(new URL(requestedUrls[0]).hostname, 'www.googleapis.com')
    } finally {
      process.env.YOUTUBE_API_KEY = originalApiKey
      globalThis.fetch = originalFetch
    }
  })
})
