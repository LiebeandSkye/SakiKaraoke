export function nextSingerState(rotation, reason) {
  const singerIds = Array.isArray(rotation?.singerIds) ? rotation.singerIds : []
  const singerCount = singerIds.length

  if (singerCount <= 1) return rotation

  if (!shouldAdvance(rotation, reason)) return rotation

  return {
    ...rotation,
    currentSingerIndex: ((rotation.currentSingerIndex ?? 0) + 1) % singerCount,
  }
}

export function shouldAdvance(rotation, reason) {
  const singerCount = rotation?.singerIds?.length ?? 0
  const mode = rotation?.mode ?? 'auto'

  if (mode === 'segment') return reason === 'segment-ended' || reason === 'song-ended'
  if (mode === 'song') return reason === 'song-ended'
  if (singerCount === 2) return reason === 'segment-ended' || reason === 'song-ended'

  return reason === 'song-ended'
}

export function normalizeRotation(rotation) {
  const singerIds = Array.isArray(rotation?.singerIds) ? rotation.singerIds : []
  const currentSingerIndex = Math.min(
    Math.max(0, rotation?.currentSingerIndex ?? 0),
    Math.max(0, singerIds.length - 1),
  )

  return {
    singerIds,
    currentSingerIndex,
    mode: rotation?.mode ?? 'auto',
  }
}
