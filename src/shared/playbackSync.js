export const DEFAULT_DRIFT_THRESHOLD_SEC = 1
export const DEFAULT_CONTROL_DELAY_MS = 250

function toFiniteNumber(value, fallback = 0) {
  const number = Number(value)
  return Number.isFinite(number) ? number : fallback
}

export function expectedPlaybackTime(playback, nowMs = Date.now()) {
  const timeSec = toFiniteNumber(playback?.timeSec)
  const updatedAtMs = toFiniteNumber(playback?.updatedAtMs, nowMs)

  if (!playback?.isPlaying) return timeSec

  const elapsedSec = Math.max(0, nowMs - updatedAtMs) / 1000
  return timeSec + elapsedSec
}

export function getRemoteTargetTime(playback, serverNowMs = Date.now()) {
  return expectedPlaybackTime(playback, serverNowMs)
}

export function getDriftCorrection({
  expectedTimeSec,
  localTimeSec,
  thresholdSec = DEFAULT_DRIFT_THRESHOLD_SEC,
}) {
  const targetTimeSec = toFiniteNumber(expectedTimeSec)
  const driftSec = Number((targetTimeSec - toFiniteNumber(localTimeSec)).toFixed(3))

  return {
    shouldCorrect: Math.abs(driftSec) > thresholdSec,
    targetTimeSec,
    driftSec,
  }
}

export function scheduleControl({
  nowMs = Date.now(),
  delayMs = DEFAULT_CONTROL_DELAY_MS,
  type,
  playback,
}) {
  const applyAtMs = nowMs + delayMs

  return {
    type,
    applyAtMs,
    playback: {
      ...playback,
      updatedAtMs: applyAtMs,
      version: toFiniteNumber(playback?.version) + 1,
    },
  }
}
