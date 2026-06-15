import { useState } from 'react'
import { useRoom } from '../context/RoomContext.jsx'

export default function RoomLobby() {
  const { createRoom, joinRoom, error, clearError } = useRoom()
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)

  const handleCreate = (e) => {
    e.preventDefault()
    if (!displayName.trim()) {
      return
    }
    createRoom(displayName)
  }

  const handleJoin = (e) => {
    e.preventDefault()
    if (!displayName.trim() || !roomCode.trim()) {
      return
    }
    joinRoom(roomCode, displayName)
  }

  return (
    <div className="lobby-container">
      <div className="lobby-card">
        <h1 className="lobby-title">🎤 SakiKaraoke</h1>
        <p className="lobby-subtitle">Sing and sync with your friends in real-time</p>

        {error && (
          <div className="error-alert">
            <span>{error}</span>
            <button type="button" className="close-btn" onClick={clearError}>
              &times;
            </button>
          </div>
        )}

        <form onSubmit={isJoining ? handleJoin : handleCreate} className="lobby-form">
          <div className="input-group">
            <label htmlFor="displayName">Your Display Name</label>
            <input
              id="displayName"
              type="text"
              placeholder="e.g. Saki"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              maxLength={40}
              required
            />
          </div>

          {isJoining && (
            <div className="input-group animated-fade-in">
              <label htmlFor="roomCode">Room Code (6 Characters)</label>
              <input
                id="roomCode"
                type="text"
                placeholder="e.g. ABC123"
                value={roomCode}
                onChange={(e) => setRoomCode(e.target.value)}
                maxLength={6}
                required
              />
            </div>
          )}

          <div className="button-group">
            {!isJoining ? (
              <>
                <button type="submit" className="btn btn-primary btn-glow">
                  Create Room
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    clearError()
                    setIsJoining(true)
                  }}
                >
                  Have a room code? Join
                </button>
              </>
            ) : (
              <>
                <button type="submit" className="btn btn-primary btn-glow">
                  Join Room
                </button>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => {
                    clearError()
                    setIsJoining(false)
                  }}
                >
                  Back to Create Room
                </button>
              </>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}
