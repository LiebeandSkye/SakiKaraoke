import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useRoom } from '../context/RoomContext.jsx'
import { searchSongs, formatDuration } from '../api/lrclib.js'
import { isValidYoutubeUrl } from '../shared/youtubeUrl.js'
import { parseSyncedLyrics } from '../shared/lyrics.js'

const TABS = { SEARCH: 'search', URL: 'url' }

export default function SongSearch() {
  const { addSong, error: roomError } = useRoom()
  const [activeTab, setActiveTab] = useState(TABS.SEARCH)
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [isSearching, setIsSearching] = useState(false)
  const [searchError, setSearchError] = useState(null)
  const [addingId, setAddingId] = useState(null)
  const [url, setUrl] = useState('')
  const [urlError, setUrlError] = useState(null)
  const [viewingLyrics, setViewingLyrics] = useState(null)
  const debounceRef = useRef(null)

  const handleQueryChange = useCallback((event) => {
    const nextQuery = event.target.value
    setQuery(nextQuery)
    setSearchError(null)
    clearTimeout(debounceRef.current)

    if (!nextQuery.trim()) {
      setResults([])
      setIsSearching(false)
      return
    }

    debounceRef.current = setTimeout(async () => {
      setIsSearching(true)
      try {
        const data = await searchSongs(nextQuery.trim())
        setResults(data)
      } catch {
        setSearchError('Search failed. Make sure the backend server is running.')
        setResults([])
      } finally {
        setIsSearching(false)
      }
    }, 500)
  }, [])

  useEffect(() => () => clearTimeout(debounceRef.current), [])

  useEffect(() => {
    if (viewingLyrics) {
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [viewingLyrics])

  const handleAddFromSearch = (song) => {
    if (addingId === song.id) return
    setAddingId(song.id)
    addSong(song)
    setTimeout(() => setAddingId(null), 1500)
  }

  const handleUrlSubmit = (event) => {
    event.preventDefault()
    setUrlError(null)

    const trimmedUrl = url.trim()
    if (!trimmedUrl) return

    if (!isValidYoutubeUrl(trimmedUrl)) {
      setUrlError('Invalid YouTube URL. Please copy a link from youtube.com.')
      return
    }

    addSong(trimmedUrl)
    setUrl('')
  }

  /** Build lyrics lines for the modal display */
  const getLyricsContent = (song) => {
    if (song.syncedLyrics) {
      const parsed = parseSyncedLyrics(song.syncedLyrics)
      return parsed.map((line) => line.text).filter(Boolean)
    }
    if (song.plainLyrics) {
      return song.plainLyrics.split(/\r?\n/).map((l) => l.trim())
    }
    return null
  }

  return (
    <div className="song-search-container">
      <div className="search-tabs">
        <button
          type="button"
          className={`search-tab ${activeTab === TABS.SEARCH ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.SEARCH)}
        >
          Search Songs
        </button>
        <button
          type="button"
          className={`search-tab ${activeTab === TABS.URL ? 'active' : ''}`}
          onClick={() => setActiveTab(TABS.URL)}
        >
          Paste YouTube URL
        </button>
      </div>

      {activeTab === TABS.SEARCH && (
        <div className="search-tab-body animated-fade-in">
          <div className="search-input-row">
            <input
              type="text"
              className="search-input"
              placeholder="Search by song title or artist..."
              value={query}
              onChange={handleQueryChange}
              autoFocus
            />
            {isSearching && <span className="search-spinner">Searching</span>}
          </div>

          {searchError && <p className="error-text animated-fade-in">{searchError}</p>}
          {roomError && <p className="error-text animated-fade-in">{roomError}</p>}

          {results.length > 0 && (
            <div className="search-results">
              {results.map((song) => (
                <div
                  key={song.id}
                  className="search-result-item"
                >
                  <div className="search-result-info">
                    <span className="search-result-title">{song.trackName}</span>
                    <span className="search-result-meta">
                      {song.artistName}
                      {song.albumName ? ` — ${song.albumName}` : ''}
                      {' · '}
                      {formatDuration(song.duration)}
                    </span>
                    <span className="search-result-badges">
                      {song.hasSyncedLyrics && (
                        <span className="lyric-badge synced">Synced Lyrics</span>
                      )}
                      {song.plainLyrics && !song.hasSyncedLyrics && (
                        <span className="lyric-badge plain">Lyrics</span>
                      )}
                      {song.instrumental && (
                        <span className="lyric-badge instrumental">Instrumental</span>
                      )}
                    </span>
                  </div>
                  <div className="search-result-actions">
                    {(song.hasSyncedLyrics || song.plainLyrics) && (
                      <button
                        type="button"
                        className="btn btn-secondary btn-sm"
                        onClick={() => setViewingLyrics(song)}
                      >
                        View Lyrics
                      </button>
                    )}
                    <button
                      type="button"
                      className={`btn btn-primary btn-sm btn-add-search ${addingId === song.id ? 'adding' : ''}`}
                      onClick={() => handleAddFromSearch(song)}
                      disabled={addingId === song.id}
                    >
                      {addingId === song.id ? 'Adding...' : 'Add'}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {!isSearching && query.trim() && results.length === 0 && !searchError && (
            <p className="empty-search-text">No results found for "{query}"</p>
          )}

          {!query.trim() && (
            <p className="search-hint">Search LRCLIB songs with synced karaoke lyrics.</p>
          )}
        </div>
      )}

      {activeTab === TABS.URL && (
        <div className="search-tab-body animated-fade-in">
          <form onSubmit={handleUrlSubmit} className="url-input-form">
            <input
              type="text"
              placeholder="Paste a YouTube URL (e.g. https://www.youtube.com/watch?v=...)"
              value={url}
              onChange={(event) => {
                setUrl(event.target.value)
                if (urlError) setUrlError(null)
              }}
              className={urlError ? 'input-error' : ''}
            />
            <button type="submit" className="btn btn-primary btn-add-song">
              Add Song
            </button>
          </form>
          {urlError && <p className="error-text animated-fade-in">{urlError}</p>}
          {roomError && <p className="error-text animated-fade-in">{roomError}</p>}
        </div>
      )}

      {/* Lyrics Modal Viewer */}
      {viewingLyrics && createPortal(
        <div
          className="lyrics-modal-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setViewingLyrics(null)
          }}
        >
          <div className="lyrics-modal-content">
            <div className="lyrics-modal-header">
              <div className="lyrics-modal-header-info">
                <h3 className="lyrics-modal-title">{viewingLyrics.trackName}</h3>
                <p className="lyrics-modal-artist">
                  {viewingLyrics.artistName}
                  {viewingLyrics.albumName ? ` — ${viewingLyrics.albumName}` : ''}
                </p>
              </div>
              <button
                type="button"
                className="lyrics-modal-close"
                onClick={() => setViewingLyrics(null)}
              >
                ✕
              </button>
            </div>
            <div className="lyrics-modal-body">
              {(() => {
                const lines = getLyricsContent(viewingLyrics)
                if (!lines || lines.length === 0) {
                  return (
                    <p className="lyrics-modal-no-lyrics">
                      {viewingLyrics.instrumental
                        ? 'This is an instrumental track.'
                        : 'No lyrics available for this song.'}
                    </p>
                  )
                }
                return lines.map((line, i) => (
                  <p key={i} className="lyrics-modal-line">
                    {line || '\u00A0'}
                  </p>
                ))
              })()}
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
