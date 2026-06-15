import { useState, useRef, useEffect, useMemo } from 'react'
import ReactPlayer from 'react-player'
import { useRoom } from '../context/RoomContext.jsx'
import { useVideoSync } from '../hooks/useVideoSync.js'
import { readMediaDuration, seekMediaTo } from '../shared/mediaElement.js'
import { getActiveLyricWindow, parseSyncedLyrics, splitPlainLyrics } from '../shared/lyrics.js'

export default function KaraokePlayer() {
  const { room, user, controlPlayback, playNext, advanceRotation, setLyricsOffset } = useRoom()
  const [isPlaying, setIsPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const [isSeeking, setIsSeeking] = useState(false)
  const [volume, setVolume] = useState(0.8)
  const [muted, setMuted] = useState(false)

  const playerRef = useRef(null)
  const triggeredSegmentsRef = useRef(new Set())

  const isHost = user?.isHost
  const currentSong = room?.currentSong
  const syncedLyricLines = useMemo(
    () => parseSyncedLyrics(currentSong?.syncedLyrics),
    [currentSong?.syncedLyrics],
  )
  const plainLyricLines = useMemo(
    () => splitPlainLyrics(currentSong?.plainLyrics),
    [currentSong?.plainLyrics],
  )
  const lyricWindow = getActiveLyricWindow(
    syncedLyricLines,
    currentTime + (currentSong?.lyricsOffsetSec ?? 0),
  )
  const hasSyncedLyrics = syncedLyricLines.length > 0
  const hasPlainLyrics = !hasSyncedLyrics && plainLyricLines.length > 0

  // Reset segment triggers when current song changes
  useEffect(() => {
    triggeredSegmentsRef.current.clear()
  }, [currentSong?.id])

  // Sync hook handles background socket sync and drift correction
  useVideoSync({
    playerRef,
    room,
    user,
    isPlaying,
    setIsPlaying,
  })

  // Synchronize playing state when room playback state changes from socket updates
  useEffect(() => {
    if (room?.playback) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setIsPlaying(room.playback.isPlaying)
    }
  }, [room?.playback])


  if (!room) return null

  // Helpers to format seconds
  const formatTime = (seconds) => {
    const m = Math.floor(seconds / 60)
    const s = Math.floor(seconds % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Host Control Handlers
  const handlePlayPause = () => {
    if (!isHost) return
    const nextPlaying = !isPlaying
    setIsPlaying(nextPlaying)
    controlPlayback(nextPlaying ? 'play' : 'pause', currentTime, nextPlaying)
  }

  const handleSeekMouseDown = () => {
    if (!isHost) return
    setIsSeeking(true)
  }

  const handleSeekChange = (e) => {
    if (!isHost) return
    setCurrentTime(parseFloat(e.target.value))
  }

  const handleSeekMouseUp = (e) => {
    if (!isHost) return
    setIsSeeking(false)
    const seekTime = parseFloat(e.target.value)
    seekMediaTo(playerRef.current, seekTime)
    controlPlayback('seek', seekTime, isPlaying)
  }

  const handleTimeUpdate = (event) => {
    const nextTime = Number(event.currentTarget?.currentTime)
    if (isSeeking || !Number.isFinite(nextTime)) return

    setCurrentTime(nextTime)

    // Automatic segment rotation (calculated by Host only)
    if (isHost && duration > 0) {
      const segmentDuration = duration / 4
      for (let i = 1; i <= 3; i++) {
        const boundaryTime = segmentDuration * i
        if (nextTime >= boundaryTime) {
          if (!triggeredSegmentsRef.current.has(i)) {
            triggeredSegmentsRef.current.add(i)
            console.log(`Automatic segment boundary ${i} reached at ${boundaryTime}s. Advancing singer.`)
            advanceRotation('segment-ended')
          }
        } else {
          // Reset if seeked back
          triggeredSegmentsRef.current.delete(i)
        }
      }
    }
  }

  const handleDurationChange = (event) => {
    const nextDuration =
      Number(event.currentTarget?.duration) ||
      readMediaDuration(playerRef.current) ||
      0
    setDuration(nextDuration)
  }

  const handleEnded = () => {
    if (isHost) {
      console.log('Song ended. Advancing singer and playing next song.')
      advanceRotation('song-ended')
      playNext()
    }
  }

  const lyricsOffsetSec = currentSong?.lyricsOffsetSec ?? 0

  const adjustLyricsOffset = (deltaSec) => {
    if (!isHost || !currentSong) return
    setLyricsOffset(lyricsOffsetSec + deltaSec)
  }

  const usersMap = new Map(room.users.map((u) => [u.id, u]))
  const singer = usersMap.get(room.currentSingerId)

  return (
    <div className="karaoke-player-container">
      {/* Player Header */}
      <div className="player-header">
        <div className="singer-info">
          {currentSong ? (
            <>
              <span className="singer-tag">MIC 1</span>
              <span className="singer-name-display">
                Singer: <strong>{singer?.displayName || 'Singer'}</strong>
              </span>
            </>
          ) : (
            <span className="no-song-msg">Awaiting songs to start the party...</span>
          )}
        </div>
        <div className="status-badges">
          <span className={`badge role-badge ${isHost ? 'host' : 'guest'}`}>
            {isHost ? '👑 HOST' : '🎤 SINGER'}
          </span>
          <span className="badge sync-badge">
            <span className="sync-dot"></span> LIVE SYNCED
          </span>
        </div>
      </div>

      {/* Video Screen */}
      <div className="video-screen-wrapper">
        {currentSong ? (
          <div className="player-wrapper">
            <ReactPlayer
              ref={playerRef}
              src={currentSong.url}
              playing={isPlaying}
              controls={false} // Custom controls only
              volume={volume}
              muted={muted}
              playsInline
              width="100%"
              height="100%"
              style={{ position: 'absolute', top: 0, left: 0 }}
              onTimeUpdate={handleTimeUpdate}
              onDurationChange={handleDurationChange}
              onEnded={handleEnded}
              onError={(error) => console.error('Player failed to load:', error)}
              config={{
                youtube: {
                  disablekb: 1,
                  fs: 0,
                  rel: 0,
                },
              }}
            />
            {(hasSyncedLyrics || hasPlainLyrics || currentSong.instrumental) && (
              <div className="lyrics-overlay" aria-live="polite">
                {hasSyncedLyrics && (
                  <>
                    <p className="lyric-line lyric-current">
                      {lyricWindow.current?.text || '...'}
                    </p>
                    {lyricWindow.next?.text && (
                      <p className="lyric-line lyric-next">{lyricWindow.next.text}</p>
                    )}
                    <div className="lyric-progress">
                      <span style={{ width: `${lyricWindow.progress * 100}%` }} />
                    </div>
                  </>
                )}
                {hasPlainLyrics && (
                  <>
                    <p className="lyric-line lyric-current">{plainLyricLines[0]}</p>
                    {plainLyricLines[1] && (
                      <p className="lyric-line lyric-next">{plainLyricLines[1]}</p>
                    )}
                  </>
                )}
                {!hasSyncedLyrics && !hasPlainLyrics && currentSong.instrumental && (
                  <p className="lyric-line lyric-current">Instrumental</p>
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="placeholder-screen">
            <div className="placeholder-content">
              <span className="music-icon">🎵</span>
              <h3>No Song Active</h3>
              <p>Add a YouTube video link below to start singing.</p>
            </div>
          </div>
        )}
      </div>

      {/* Custom Control Bar */}
      <div className="player-controls">
        <div className="control-row-top">
          {/* Play/Pause Button */}
          <button
            type="button"
            className={`control-btn play-pause-btn ${!isHost ? 'disabled' : ''}`}
            onClick={handlePlayPause}
            disabled={!isHost}
            title={isHost ? (isPlaying ? 'Pause' : 'Play') : 'Only host can control playback'}
          >
            {isPlaying ? '⏸️' : '▶️'}
          </button>

          {/* Progress Slider */}
          <div className="progress-slider-container">
            <span className="time-display">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              step="any"
              value={currentTime}
              onMouseDown={handleSeekMouseDown}
              onChange={handleSeekChange}
              onMouseUp={handleSeekMouseUp}
              disabled={!isHost || !currentSong}
              className={`timeline-slider ${!isHost ? 'guest-timeline' : ''}`}
            />
            <span className="time-display">{formatTime(duration)}</span>
          </div>
        </div>

        <div className="control-row-bottom">
          {/* Volume Control */}
          <div className="volume-container">
            <button
              type="button"
              className="control-btn volume-btn"
              onClick={() => setMuted(!muted)}
            >
              {muted || volume === 0 ? '🔇' : volume < 0.5 ? '🔉' : '🔊'}
            </button>
            <input
              type="range"
              min={0}
              max={1}
              step="any"
              value={muted ? 0 : volume}
              onChange={(e) => {
                setVolume(parseFloat(e.target.value))
                setMuted(false)
              }}
              className="volume-slider"
            />
          </div>

          {!isHost && currentSong && (
            <div className="guest-notice">
              <span>Syncing with Host ({usersMap.get(room.hostId)?.displayName || 'Host'})</span>
            </div>
          )}

          {isHost && hasSyncedLyrics && currentSong && (
            <div className="lyrics-offset-controls" title="Adjust if lyrics are early or late vs. the karaoke track">
              <span className="lyrics-offset-label">Lyrics sync</span>
              <button
                type="button"
                className="control-btn lyrics-offset-btn"
                onClick={() => adjustLyricsOffset(-1)}
                aria-label="Delay lyrics by 1 second"
              >
                −1s
              </button>
              <span className="lyrics-offset-value">
                {lyricsOffsetSec > 0 ? '+' : ''}
                {lyricsOffsetSec}s
              </span>
              <button
                type="button"
                className="control-btn lyrics-offset-btn"
                onClick={() => adjustLyricsOffset(1)}
                aria-label="Advance lyrics by 1 second"
              >
                +1s
              </button>
              {lyricsOffsetSec !== 0 && (
                <button
                  type="button"
                  className="lyrics-offset-reset"
                  onClick={() => setLyricsOffset(0)}
                >
                  Reset
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
