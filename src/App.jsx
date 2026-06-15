import { RoomProvider, useRoom } from './context/RoomContext.jsx'
import RoomLobby from './components/RoomLobby.jsx'
import KaraokePlayer from './components/KaraokePlayer.jsx'
import QueueSidebar from './components/QueueSidebar.jsx'
import SongSearch from './components/SongSearch.jsx'
import './App.css'

function MainApp() {
  const { room, isConnected } = useRoom()

  if (!room) {
    return <RoomLobby />
  }

  return (
    <div className="karaoke-app-layout animated-fade-in">
      <header className="app-header">
        <div className="logo-section">
          <span className="logo-emoji">🎤</span>
          <h2>SakiKaraoke</h2>
        </div>
        <div className="connection-status">
          <span className={`status-dot ${isConnected ? 'connected' : 'disconnected'}`}></span>
          <span>{isConnected ? 'Realtime Connected' : 'Disconnected / Reconnecting...'}</span>
        </div>
      </header>

      <div className="app-main-body">
        <main className="player-column">
          <KaraokePlayer />
          <SongSearch />
        </main>
        <QueueSidebar />
      </div>
    </div>
  )
}

function App() {
  return (
    <RoomProvider>
      <MainApp />
    </RoomProvider>
  )
}

export default App
