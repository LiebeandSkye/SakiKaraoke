import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { describe, it } from 'node:test'

const appCss = await readFile(new URL('../src/App.css', import.meta.url), 'utf8')
const indexCss = await readFile(new URL('../src/index.css', import.meta.url), 'utf8')
const karaokePlayer = await readFile(
  new URL('../src/components/KaraokePlayer.jsx', import.meta.url),
  'utf8',
)

const matches = (source, pattern) => source.match(pattern) ?? []

describe('rendering performance guardrails', () => {
  it('keeps expensive SVG distortion on a small number of glass surfaces', () => {
    const distortionUses = matches(
      `${appCss}\n${indexCss}`,
      /filter: url\(#glass-distortion\)/g,
    )

    assert.ok(
      distortionUses.length <= 2,
      `expected at most 2 distortion filters, found ${distortionUses.length}`,
    )
  })

  it('uses a reduced blur radius for animated background blobs', () => {
    const blurMatch = indexCss.match(/\.bg-blob\s*\{[^}]*filter: blur\((\d+)px\)/s)

    assert.ok(blurMatch, 'expected .bg-blob to define a blur radius')
    assert.ok(
      Number(blurMatch[1]) <= 80,
      `expected .bg-blob blur to be 80px or less, found ${blurMatch[1]}px`,
    )
  })

  it('avoids broad transitions and persistent GPU hints on repeated controls', () => {
    assert.equal(matches(appCss, /transition: all/g).length, 0)
    assert.equal(matches(indexCss, /transition: all/g).length, 0)
    assert.equal(matches(appCss, /will-change:/g).length, 0)
  })

  it('memoizes playback-derived lyric and user data in the karaoke player', () => {
    assert.match(karaokePlayer, /import \{ useState, useRef, useEffect, useMemo, useCallback \} from 'react'/)
    assert.match(karaokePlayer, /const lyricTime = useMemo\(/)
    assert.match(karaokePlayer, /const lyricWindow = useMemo\(\s*\(\) => getActiveLyricWindow/s)
    assert.match(karaokePlayer, /const visibleLyricLines = useMemo\(\s*\(\) => getVisibleLyricLines/s)
    assert.match(karaokePlayer, /const usersMap = useMemo\(\s*\(\) => new Map/s)
    assert.match(karaokePlayer, /const formatTime = useCallback\(/)
    assert.match(karaokePlayer, /const getSliderFill = useCallback\(/)
  })
})
