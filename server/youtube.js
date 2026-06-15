import { extractYoutubeVideoId, parseIso8601DurationToSeconds } from '../src/shared/youtubeUrl.js'
import { env } from 'node:process'

function extractJsonObjectAfterMarker(html, marker) {
  const markerIndex = html.indexOf(marker)
  if (markerIndex < 0) return null

  const start = html.indexOf('{', markerIndex + marker.length)
  if (start < 0) return null

  let depth = 0
  let inString = false
  let escaped = false

  for (let index = start; index < html.length; index += 1) {
    const char = html[index]

    if (inString) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === '"') {
        inString = false
      }
      continue
    }

    if (char === '"') {
      inString = true
    } else if (char === '{') {
      depth += 1
    } else if (char === '}') {
      depth -= 1
      if (depth === 0) {
        return html.slice(start, index + 1)
      }
    }
  }

  return null
}

function chooseLargestThumbnail(thumbnails, fallbackThumbnail) {
  if (!Array.isArray(thumbnails) || thumbnails.length === 0) return fallbackThumbnail

  return [...thumbnails]
    .map((thumbnail, index) => ({ thumbnail, index }))
    .sort((a, b) => Number(b.thumbnail?.width ?? 0) - Number(a.thumbnail?.width ?? 0) || b.index - a.index)
    .map(({ thumbnail }) => thumbnail)
    .find((thumbnail) => thumbnail?.url)?.url ?? fallbackThumbnail
}

export function extractYoutubePlayerMetadata(html, videoId) {
  const fallbackThumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  const json = extractJsonObjectAfterMarker(String(html ?? ''), 'ytInitialPlayerResponse')
  if (!json) return null

  try {
    const data = JSON.parse(json)
    const details = data?.videoDetails
    if (!details) return null

    const durationSec = Number(details.lengthSeconds)
    return {
      title: details.title || `YouTube Video (${videoId})`,
      durationSec: Number.isFinite(durationSec) ? durationSec : null,
      thumbnail: chooseLargestThumbnail(details.thumbnail?.thumbnails, fallbackThumbnail),
    }
  } catch {
    return null
  }
}

async function fetchYoutubePageMetadata(videoId, fetchImpl = fetch) {
  const response = await fetchImpl(`https://www.youtube.com/watch?v=${videoId}`, {
    signal: AbortSignal.timeout(6000),
    headers: {
      'Accept-Language': 'en-US,en;q=0.9',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    },
  })

  if (!response.ok) return null

  return extractYoutubePlayerMetadata(await response.text(), videoId)
}

/**
 * Fetches YouTube metadata (Title, Thumbnail, Duration) for a given URL.
 * Falls back to basic defaults if YOUTUBE_API_KEY is not set or API fails.
 * 
 * @param {string} url - YouTube video URL
 * @returns {Promise<{videoId: string, url: string, title: string, thumbnail: string, durationSec: number|null}>}
 */
export async function fetchYoutubeMetadata(url) {
  const videoId = extractYoutubeVideoId(url)
  if (!videoId) {
    throw new Error('Invalid YouTube URL')
  }

  const normalizedUrl = `https://www.youtube.com/watch?v=${videoId}`
  const fallbackThumbnail = `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
  const fallbackTitle = `YouTube Video (${videoId})`

  const apiKey = env.YOUTUBE_API_KEY
  if (!apiKey) {
    try {
      const scraped = await fetchYoutubePageMetadata(videoId)
      if (scraped) {
        return {
          videoId,
          url: normalizedUrl,
          title: scraped.title || fallbackTitle,
          thumbnail: scraped.thumbnail || fallbackThumbnail,
          durationSec: scraped.durationSec ?? null,
        }
      }
    } catch (error) {
      console.warn('Failed to scrape YouTube metadata, using fallback:', error.message)
    }

    return {
      videoId,
      url: normalizedUrl,
      title: fallbackTitle,
      thumbnail: fallbackThumbnail,
      durationSec: null,
    }
  }

  try {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?part=snippet,contentDetails&id=${videoId}&key=${apiKey}`
    const response = await fetch(apiUrl)
    if (!response.ok) {
      throw new Error(`YouTube API returned status ${response.status}`)
    }

    const data = await response.json()
    const item = data?.items?.[0]
    if (!item) {
      return {
        videoId,
        url: normalizedUrl,
        title: fallbackTitle,
        thumbnail: fallbackThumbnail,
        durationSec: null,
      }
    }

    const title = item.snippet?.title || fallbackTitle
    const thumbnail =
      item.snippet?.thumbnails?.medium?.url ||
      item.snippet?.thumbnails?.high?.url ||
      item.snippet?.thumbnails?.default?.url ||
      fallbackThumbnail

    const isoDuration = item.contentDetails?.duration
    const durationSec = isoDuration ? parseIso8601DurationToSeconds(isoDuration) : null

    return {
      videoId,
      url: normalizedUrl,
      title,
      thumbnail,
      durationSec,
    }
  } catch (error) {
    console.error('Failed to fetch YouTube metadata, trying page scrape:', error)
    try {
      const scraped = await fetchYoutubePageMetadata(videoId)
      if (scraped) {
        return {
          videoId,
          url: normalizedUrl,
          title: scraped.title || fallbackTitle,
          thumbnail: scraped.thumbnail || fallbackThumbnail,
          durationSec: scraped.durationSec ?? null,
        }
      }
    } catch (scrapeError) {
      console.warn('Failed to scrape YouTube metadata, using fallback:', scrapeError.message)
    }

    return {
      videoId,
      url: normalizedUrl,
      title: fallbackTitle,
      thumbnail: fallbackThumbnail,
      durationSec: null,
    }
  }
}

/**
 * Searches YouTube for a song by track name + artist name.
 * Uses YouTube Data API v3 if YOUTUBE_API_KEY is set, otherwise falls back to public Invidious instances.
 *
 * @param {string} trackName
 * @param {string} artistName
 * @returns {Promise<{videoId: string, url: string, title: string, thumbnail: string}|null>}
 */
export async function searchYoutubeForSong(trackName, artistName) {
  const query = `${artistName} ${trackName} official audio`
  const apiKey = env.YOUTUBE_API_KEY

  if (apiKey) {
    try {
      const apiUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=1&key=${apiKey}`
      const response = await fetch(apiUrl)
      if (response.ok) {
        const data = await response.json()
        const item = data?.items?.[0]
        if (item) {
          const videoId = item.id.videoId
          return {
            videoId,
            url: `https://www.youtube.com/watch?v=${videoId}`,
            title: item.snippet?.title || `${artistName} - ${trackName}`,
            thumbnail: item.snippet?.thumbnails?.medium?.url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`,
          }
        }
      }
    } catch (err) {
      console.error('YouTube API search failed, trying Invidious:', err.message)
    }
  }

  // Fallback: try scraping YouTube search results directly
  try {
    const url = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      signal: AbortSignal.timeout(6000),
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      }
    })

    if (response.ok) {
      const html = await response.text()
      const regex = /var ytInitialData = ({.*?});<\/script>/s
      let match = html.match(regex)
      if (!match) {
        const regexAlt = /window\["ytInitialData"\]\s*=\s*({.*?});/s
        match = html.match(regexAlt)
      }

      if (match) {
        const data = JSON.parse(match[1])
        const contents = data.contents?.twoColumnSearchResultsRenderer?.primaryContents?.sectionListRenderer?.contents?.[0]?.itemSectionRenderer?.contents
        if (contents && Array.isArray(contents)) {
          for (const item of contents) {
            if (item.videoRenderer) {
              const vr = item.videoRenderer
              const videoId = vr.videoId
              if (videoId) {
                const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || `${artistName} - ${trackName}`
                const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || `https://img.youtube.com/vi/${videoId}/mqdefault.jpg`
                return {
                  videoId,
                  url: `https://www.youtube.com/watch?v=${videoId}`,
                  title,
                  thumbnail,
                }
              }
            }
          }
        }
      }
    }
  } catch (err) {
    console.warn('Direct YouTube search scraping failed:', err.message)
  }

  console.error('All YouTube search methods exhausted for:', query)
  return null
}
