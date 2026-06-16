import { useRoom } from '../context/RoomContext.jsx'
import { IoMicSharp, IoDiscSharp, IoListSharp, IoPlayForwardSharp } from 'react-icons/io5'

export default function QueueSidebar() {
  const { room, user, playNext, changeRotationMode, advanceRotation, leaveRoom } = useRoom()

  if (!room) return null

  const isHost = user?.isHost
  const usersMap = new Map(room.users.map((u) => [u.id, u]))
  const currentSinger = usersMap.get(room.currentSingerId)

  // Helper to format duration
  const formatDuration = (sec) => {
    if (!sec && sec !== 0) return 'Unknown'
    const m = Math.floor(sec / 60)
    const s = Math.floor(sec % 60)
    return `${m}:${s.toString().padStart(2, '0')}`
  }

  // Copy room code to clipboard
  const handleCopyCode = () => {
    navigator.clipboard.writeText(room.code)
    alert('Room code copied to clipboard!')
  }

  return (
    <aside className="queue-sidebar">
      {/* Room Header Info */}
      <div className="sidebar-section room-info-header">
        <div className="room-code-badge" onClick={handleCopyCode} title="Click to copy">
          <span className="label">ROOM CODE</span>
          <span className="code">{room.code}</span>
        </div>
        <button type="button" className="btn btn-danger btn-leave" onClick={leaveRoom}>
          Leave Room
        </button>
      </div>

      {/* Singer Rotation & Users List */}
      <div className="sidebar-section rotation-section">
        <h3><IoMicSharp className="sidebar-icon" /> Singer Rotation</h3>
        <div className="singers-list">
          {room.rotation.singerIds.map((id, index) => {
            const u = usersMap.get(id)
            if (!u) return null
            const isCurrentSinging = id === room.currentSingerId
            return (
              <div
                key={id}
                className={`singer-row ${isCurrentSinging ? 'active-singer' : ''}`}
              >
                <span className="singer-order">#{index + 1}</span>
                <span className="singer-name">
                  {u.displayName} {u.isHost && <span className="host-badge">Host</span>}
                </span>
                {isCurrentSinging && <span className="singing-now-label">SINGING</span>}
              </div>
            )
          })}
        </div>

        {/* Singer Manual Advance (Host/Anyone) */}
        <div className="singer-rotation-controls">
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => advanceRotation('segment-ended')}
          >
            Next Segment Turn
          </button>
          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => advanceRotation('song-ended')}
          >
            Next Song Turn
          </button>
        </div>

        {/* Host Rotation Mode Controls */}
        {isHost && (
          <div className="rotation-mode-select">
            <label htmlFor="rotationMode">Rotation Mode:</label>
            <select
              id="rotationMode"
              value={room.rotation.mode}
              onChange={(e) => changeRotationMode(e.target.value)}
            >
              <option value="auto">Auto (2 users: segment, 3+: song)</option>
              <option value="segment">Segment (advance every segment)</option>
              <option value="song">Song (advance every song)</option>
            </select>
          </div>
        )}
      </div>

      {/* Now Playing */}
      <div className="sidebar-section now-playing-section">
        <h3><IoDiscSharp className="sidebar-icon" /> Now Playing</h3>
        {room.currentSong ? (
          <div className="now-playing-card">
            <div className="thumbnail-wrapper">
              <img src={room.currentSong.thumbnail} alt={room.currentSong.title} />
              <span className="duration-tag">{formatDuration(room.currentSong.durationSec)}</span>
            </div>
            <div className="song-details">
              <h4 className="song-title">{room.currentSong.title}</h4>
              <p className="song-submitter">
                Added by: {usersMap.get(room.currentSong.addedBy)?.displayName || 'Singer'}
              </p>
              {currentSinger && (
                <p className="song-singer">
                  <IoMicSharp className="inline-icon" /> Singer: <strong className="glow-text">{currentSinger.displayName}</strong>
                </p>
              )}
            </div>
            {isHost && (
              <button type="button" className="btn btn-primary btn-skip" onClick={playNext}>
                Skip Song <IoPlayForwardSharp className="btn-icon-right" />
              </button>
            )}
          </div>
        ) : (
          <div className="empty-now-playing">
            <p>No song active. Add a YouTube URL to get started!</p>
            {isHost && room.queue.length > 0 && (
              <button type="button" className="btn btn-primary" onClick={playNext}>
                Play Next Song <IoPlayForwardSharp className="btn-icon-right" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Upcoming Queue */}
      <div className="sidebar-section queue-section">
        <h3><IoListSharp className="sidebar-icon" /> Upcoming Queue ({room.queue.length})</h3>
        <div className="queue-list">
          {room.queue.length > 0 ? (
            room.queue.map((song, index) => (
              <div key={song.id} className="queue-item">
                <span className="queue-index">{index + 1}</span>
                <img className="queue-thumb" src={song.thumbnail} alt="" />
                <div className="queue-item-details">
                  <span className="queue-item-title" title={song.title}>
                    {song.title}
                  </span>
                  <span className="queue-item-meta">
                    {formatDuration(song.durationSec)} | Added by:{' '}
                    {usersMap.get(song.addedBy)?.displayName || 'Singer'}
                  </span>
                </div>
              </div>
            ))
          ) : (
            <p className="empty-queue-text">Queue is empty</p>
          )}
        </div>
      </div>
    </aside>
  )
}
