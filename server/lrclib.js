const LRCLIB_BASE_URL = 'https://lrclib.net'
const LRCLIB_HEADERS = {
  'Lrclib-Client': 'SakiKaraoke/1.0',
}

function toFiniteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

function hasLyrics(record) {
  return Boolean(record?.syncedLyrics || record?.plainLyrics || record?.instrumental)
}

export function buildLrclibGetUrl({
  trackName,
  artistName,
  albumName,
  duration,
  cached = true,
}) {
  const params = new URLSearchParams()
  params.set('track_name', trackName)
  params.set('artist_name', artistName)
  params.set('album_name', albumName)
  params.set('duration', String(duration))

  const endpoint = cached ? '/api/get-cached' : '/api/get'
  return `${LRCLIB_BASE_URL}${endpoint}?${params.toString()}`
}

export function buildLrclibSearchUrl(query) {
  const params = new URLSearchParams()
  params.set('q', query)
  return `${LRCLIB_BASE_URL}/api/search?${params.toString()}`
}

export function normalizeLrclibRecord(record) {
  if (!record) return null

  return {
    lrclibId: record.id,
    trackName: record.trackName ?? null,
    artistName: record.artistName ?? null,
    albumName: record.albumName ?? null,
    duration: record.duration ?? null,
    instrumental: Boolean(record.instrumental),
    plainLyrics: record.plainLyrics ?? null,
    syncedLyrics: record.syncedLyrics ?? null,
    hasSyncedLyrics: Boolean(record.syncedLyrics),
  }
}

export function pickBestLrclibRecord(records, durationSec) {
  if (!Array.isArray(records) || records.length === 0) return null

  const targetDuration = toFiniteNumber(durationSec)

  return records
    .map((record, index) => {
      const duration = toFiniteNumber(record.duration)
      const durationDelta =
        targetDuration !== null && duration !== null
          ? Math.abs(duration - targetDuration)
          : Number.POSITIVE_INFINITY
      const durationMatches = targetDuration === null || durationDelta <= 2

      return {
        record,
        index,
        score:
          (durationMatches ? 100 : 0) +
          (record.syncedLyrics ? 20 : 0) +
          (record.plainLyrics ? 5 : 0) +
          (record.instrumental ? 1 : 0) -
          (Number.isFinite(durationDelta) ? durationDelta : 20),
      }
    })
    .filter(({ record, score }) => score > 0 && hasLyrics(record))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .at(0)?.record ?? null
}

export async function searchLrclib(query, fetchImpl = fetch) {
  const trimmed = String(query ?? '').trim()
  if (!trimmed) return []

  const response = await fetchImpl(buildLrclibSearchUrl(trimmed), {
    headers: LRCLIB_HEADERS,
    signal: AbortSignal.timeout(5000),
  })

  if (!response.ok) {
    throw new Error(`LRCLIB search returned ${response.status}`)
  }

  return response.json()
}

export async function fetchLyricsForMetadata(metadata, fetchImpl = fetch) {
  if (!metadata?.title) return null

  const results = await searchLrclib(metadata.title, fetchImpl)
  const best = pickBestLrclibRecord(results, metadata.durationSec)
  return normalizeLrclibRecord(best)
}
