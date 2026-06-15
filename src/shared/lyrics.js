const LRC_TIMESTAMP_PATTERN = /\[(\d{1,2}):(\d{2})(?:[.:](\d{1,3}))?]/g

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

function parseTimestamp(match) {
  const minutes = Number(match[1])
  const seconds = Number(match[2])
  const fraction = match[3] ? Number(`0.${match[3].padEnd(3, '0')}`) : 0
  return Number((minutes * 60 + seconds + fraction).toFixed(3))
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value))
}

export function parseSyncedLyrics(value) {
  if (!value) return []

  const parsed = []

  for (const rawLine of String(value).split(/\r?\n/)) {
    const matches = [...rawLine.matchAll(LRC_TIMESTAMP_PATTERN)]
    if (matches.length === 0) continue

    const text = rawLine.replace(LRC_TIMESTAMP_PATTERN, '').trim()
    for (const match of matches) {
      parsed.push({
        timeSec: parseTimestamp(match),
        text,
      })
    }
  }

  return parsed
    .sort((a, b) => a.timeSec - b.timeSec)
    .map((line, index) => ({
      id: `${line.timeSec}-${index}`,
      ...line,
    }))
}

export function getActiveLyricWindow(lines, currentTimeSec) {
  const lyricLines = Array.isArray(lines) ? lines : []

  if (lyricLines.length === 0) {
    return {
      currentIndex: -1,
      current: null,
      next: null,
      progress: 0,
    }
  }

  const timeSec = toFiniteNumber(currentTimeSec)
  let currentIndex = -1

  for (let index = 0; index < lyricLines.length; index += 1) {
    if (lyricLines[index].timeSec > timeSec) break
    currentIndex = index
  }

  const current = currentIndex >= 0 ? lyricLines[currentIndex] : null
  const next = lyricLines[currentIndex + 1] ?? null
  let progress = current ? 1 : 0

  if (current && next) {
    const span = Math.max(0.001, next.timeSec - current.timeSec)
    progress = clamp((timeSec - current.timeSec) / span, 0, 1)
  }

  return {
    currentIndex,
    current,
    next,
    progress: Number(progress.toFixed(3)),
  }
}

export function splitPlainLyrics(value) {
  return String(value ?? '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
}
