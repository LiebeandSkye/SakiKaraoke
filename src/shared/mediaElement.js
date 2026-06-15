function finiteNumber(value) {
  const number = Number(value)
  return Number.isFinite(number) ? number : null
}

export function readMediaTime(player) {
  if (!player) return 0

  if (typeof player.getCurrentTime === 'function') {
    return finiteNumber(player.getCurrentTime()) ?? 0
  }

  return finiteNumber(player.currentTime) ?? 0
}

export function readMediaDuration(player) {
  if (!player) return null
  return finiteNumber(player.duration)
}

export function seekMediaTo(player, timeSec) {
  if (!player) return false

  const nextTime = finiteNumber(timeSec) ?? 0

  if (typeof player.seekTo === 'function') {
    player.seekTo(nextTime, 'seconds')
    return true
  }

  if ('currentTime' in player) {
    player.currentTime = nextTime
    return true
  }

  return false
}
