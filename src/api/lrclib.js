/**
 * Calls the SakiKaraoke backend /api/search which proxies lrclib.net.
 * @param {string} query
 * @returns {Promise<Array>}
 */
const BASE = import.meta.env.PROD ? '' : 'http://localhost:3001'

export async function searchSongs(query) {
  const res = await fetch(`${BASE}/api/search?q=${encodeURIComponent(query)}`)
  if (!res.ok) throw new Error('Search request failed')
  return res.json()
}

/** Format seconds into m:ss */
export function formatDuration(sec) {
  if (!sec && sec !== 0) return '?:??'
  const m = Math.floor(sec / 60)
  const s = Math.floor(sec % 60)
  return `${m}:${s.toString().padStart(2, '0')}`
}
