import { useState, lazy, Suspense } from 'react'
import { useRoom } from '../context/RoomContext.jsx'
import { IoMicSharp } from 'react-icons/io5'

const CharacterSelectModal = lazy(() => import('./CharacterSelectModal.jsx'))

export default function RoomLobby() {
  const { createRoom, joinRoom, selectedCharacter, setSelectedCharacter, error, clearError } = useRoom()
  const [displayName, setDisplayName] = useState('')
  const [roomCode, setRoomCode] = useState('')
  const [isJoining, setIsJoining] = useState(false)
  const [step, setStep] = useState('details') // 'details' | 'character'

  const handleProceedToCharacterSelect = (e) => {
    e.preventDefault()
    clearError()
    if (!displayName.trim()) {
      return
    }
    if (isJoining && !roomCode.trim()) {
      return
    }
    setStep('character')
  }

  const handleConfirmCharacter = (characterChoice) => {
    const chosen = characterChoice || selectedCharacter || 'miku'
    if (isJoining) {
      joinRoom(roomCode, displayName, chosen)
    } else {
      createRoom(displayName, chosen)
    }
  }

  return (
    <div className="lobby-container">
      <div className="lobby-bg-wrapper" aria-hidden="true">
        <div className="lobby-bg-image lobby-bg-clear" />
        <div className="lobby-bg-image lobby-bg-blur" />
        <div className="lobby-bg-vignette" />
      </div>

      <div className={`lobby-card ${step === 'character' ? 'lobby-card-wide' : ''}`}>
        <h1 className="lobby-title">
          <IoMicSharp className="lobby-title-icon" /> SakiKaraoke
        </h1>
        <p className="lobby-subtitle">Sing and sync with your friends in real-time 3D</p>

        {error && (
          <div className="error-alert">
            <span>{error}</span>
            <button type="button" className="close-btn" onClick={clearError}>
              &times;
            </button>
          </div>
        )}

        {step === 'character' ? (
          <Suspense fallback={<div className="character-loading-state">Loading 3D Avatar Preview...</div>}>
            <CharacterSelectModal
              displayName={displayName.trim()}
              roomCode={roomCode.trim()}
              isJoining={isJoining}
              selectedCharacter={selectedCharacter}
              onSelectCharacter={setSelectedCharacter}
              onConfirm={handleConfirmCharacter}
              onBack={() => setStep('details')}
            />
          </Suspense>
        ) : (
          <form onSubmit={handleProceedToCharacterSelect} className="lobby-form">
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
                    Next: Choose 3D Avatar
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
                    Next: Choose 3D Avatar
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
        )}
      </div>
    </div>
  )
}
