const YOUTUBE_ID_PATTERN = /^[A-Za-z0-9_-]{11}$/

function cleanVideoId(value) {
  if (!value) return null
  const [id] = String(value).split(/[?&#/]/)
  return YOUTUBE_ID_PATTERN.test(id) ? id : null
}

export function extractYoutubeVideoId(input) {
  try {
    const url = new URL(input)
    const host = url.hostname.toLowerCase().replace(/^www\./, '').replace(/^m\./, '')

    if (host === 'youtu.be') {
      return cleanVideoId(url.pathname.split('/').filter(Boolean).at(0))
    }

    if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
      if (url.pathname === '/watch') return cleanVideoId(url.searchParams.get('v'))

      const [kind, id] = url.pathname.split('/').filter(Boolean)
      if (['embed', 'shorts', 'live'].includes(kind)) return cleanVideoId(id)
    }
  } catch {
    return null
  }

  return null
}

export function isValidYoutubeUrl(input) {
  return extractYoutubeVideoId(input) !== null
}

export function normalizeYoutubeUrl(input) {
  const videoId = extractYoutubeVideoId(input)
  return videoId ? `https://www.youtube.com/watch?v=${videoId}` : null
}

export function parseIso8601DurationToSeconds(duration) {
  const match = String(duration).match(
    /^P(?:(?<days>\d+)D)?(?:T(?:(?<hours>\d+)H)?(?:(?<minutes>\d+)M)?(?:(?<seconds>\d+)S)?)?$/,
  )

  if (!match) return null

  const days = Number(match.groups.days ?? 0)
  const hours = Number(match.groups.hours ?? 0)
  const minutes = Number(match.groups.minutes ?? 0)
  const seconds = Number(match.groups.seconds ?? 0)

  return days * 86400 + hours * 3600 + minutes * 60 + seconds
}
