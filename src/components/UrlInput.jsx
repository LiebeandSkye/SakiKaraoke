import { useState } from 'react'
import { useRoom } from '../context/RoomContext.jsx'
import { isValidYoutubeUrl } from '../shared/youtubeUrl.js'

export default function UrlInput() {
  const { addSong } = useRoom()
  const [url, setUrl] = useState('')
  const [localError, setLocalError] = useState(null)

  const handleSubmit = (e) => {
    e.preventDefault()
    setLocalError(null)

    if (!url.trim()) {
      return
    }

    if (!isValidYoutubeUrl(url)) {
      setLocalError('Invalid YouTube URL. Please copy a link from YouTube.')
      return
    }

    addSong(url.trim())
    setUrl('')
  }

  return (
    <div className="url-input-container">
      <form onSubmit={handleSubmit} className="url-input-form">
        <input
          type="text"
          placeholder="Paste a YouTube URL (e.g. https://www.youtube.com/...) to add a song"
          value={url}
          onChange={(e) => {
            setUrl(e.target.value)
            if (localError) setLocalError(null)
          }}
          className={localError ? 'input-error' : ''}
        />
        <button type="submit" className="btn btn-primary btn-add-song">
          Add Song
        </button>
      </form>
      {localError && <p className="error-text animated-fade-in">{localError}</p>}
    </div>
  )
}
