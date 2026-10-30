import { useState, useCallback, lazy, Suspense } from 'react'
import { RoomProvider, useRoom } from './context/RoomContext.jsx'
import RoomLobby from './components/RoomLobby.jsx'
import KaraokePlayer from './components/KaraokePlayer.jsx'
import './App.css'
import './room3d.css'

// Three.js + VRM are only needed once a room is joined
const KaraokeRoom3D = lazy(() => import('./components/KaraokeRoom3D.jsx'))

function MainApp() {
  const { room } = useRoom()
  const [tvElement, setTvElement] = useState(null)
  const [tvOpen, setTvOpen] = useState(false)
  const openTv = useCallback(() => setTvOpen(true), [])
  const closeTv = useCallback(() => setTvOpen(false), [])

  if (!room) {
    return <RoomLobby />
  }

  return (
    <div className="karaoke-room-app animated-fade-in">
      <Suspense fallback={<div className="room-loader room-loader-plain">Loading 3D room…</div>}>
        <KaraokeRoom3D onTvElement={setTvElement} onOpenTv={openTv} tvOpen={tvOpen} />
      </Suspense>
      <KaraokePlayer tvElement={tvElement} panelOpen={tvOpen} onClosePanel={closeTv} />
    </div>
  )
}

function App() {
  return (
    <RoomProvider>
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
