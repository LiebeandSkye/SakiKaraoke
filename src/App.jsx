import { RoomProvider, useRoom } from './context/RoomContext.jsx'
import RoomLobby from './components/RoomLobby.jsx'
import KaraokePlayer from './components/KaraokePlayer.jsx'
import QueueSidebar from './components/QueueSidebar.jsx'
import SongSearch from './components/SongSearch.jsx'
import { IoMicSharp } from 'react-icons/io5'
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
          <IoMicSharp className="logo-icon" />
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
      {/* ── Global Liquid Glass SVG Filters ── */}
      <svg aria-hidden="true" style={{ position: 'absolute', width: 0, height: 0, overflow: 'hidden', pointerEvents: 'none' }}>
        <defs>
          {/* Premium glass-distortion: refractive lens effect on panels/cards */}
          <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%" filterUnits="objectBoundingBox" colorInterpolationFilters="sRGB">
            <feTurbulence type="fractalNoise" baseFrequency="0.002 0.008" numOctaves="1" seed="17" result="noise" />
            <feGaussianBlur in="noise" stdDeviation="2" result="softNoise" />
            <feDisplacementMap in="SourceGraphic" in2="softNoise" scale="60" xChannelSelector="R" yChannelSelector="G" />
          </filter>

          {/* Mini-liquid-lens: refractive glass capsule for slider thumbs */}
          <filter id="mini-liquid-lens" x="-50%" y="-50%" width="200%" height="200%" colorInterpolationFilters="sRGB">
            <feImage
              x="0" y="0" width="100%" height="100%"
              result="normalMap"
              href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='300' height='300'%3E%3CradialGradient id='invmap' cx='50%25' cy='50%25' r='75%25'%3E%3Cstop offset='0%25' stop-color='rgb(128,128,255)'/%3E%3Cstop offset='90%25' stop-color='rgb(255,255,255)'/%3E%3C/radialGradient%3E%3Crect width='100%25' height='100%25' fill='url(%23invmap)'/%3E%3C/svg%3E"
              preserveAspectRatio="none"
            />
            <feDisplacementMap in="SourceGraphic" in2="normalMap" scale="-252" xChannelSelector="R" yChannelSelector="G" result="displaced" />
            <feMerge><feMergeNode in="displaced" /></feMerge>
          </filter>
        </defs>
      </svg>
      <div className="liquid-glass-background">
        <div className="bg-blob blob-1"></div>
        <div className="bg-blob blob-2"></div>
        <div className="bg-blob blob-3"></div>
      </div>
      <MainApp />
    </RoomProvider>
  )
}

export default App
