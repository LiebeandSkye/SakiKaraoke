## SakiKaraoke

A real-time collaborative karaoke web app. Create a room, share the code, and sing together — everyone stays in sync while you take turns on the mic.

![Stack](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white) ![Node](https://img.shields.io/badge/Node.js-Express-339933?logo=node.js&logoColor=white) ![Socket.io](https://img.shields.io/badge/Socket.io-4.x-010101?logo=socket.io&logoColor=white) ![Vite](https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white)

---

## Features

- **Room system** — Create a room with a 6-character code, share it with friends, and join from any browser
- **YouTube sync** — Paste any YouTube URL; everyone watches the same video at the same time
- **Song search** — Search by artist or track name via LRCLIB and auto-match to a karaoke YouTube video
- **Synced lyrics** — Timestamped LRC lyrics scroll in real time with the video
- **Turn-based rotation** — Automatic singer rotation per segment or per song, configurable by the host
- **Lyrics offset** — Host can nudge lyrics timing forward or backward to fix sync with any karaoke track
- **Queue system** — Add songs to the room queue; they auto-advance when the current song ends
- **Host controls** — Play, pause, seek, skip — all broadcast instantly to guests
- **Drift correction** — Guests are checked every 2 seconds and re-synced if they drift more than 300ms

---

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite 8, react-player |
| Backend | Node.js, Express 5 |
| Real-time | Socket.io 4 |
| Lyrics | LRCLIB API (proxied via server) |
| Video | YouTube (via react-player / YouTube IFrame API) |

---

## Getting Started

### Prerequisites

- Node.js 18+
- npm

### Installation

```bash
git clone https://github.com/LiebeandSkye/SakiKaraoke.git
cd SakiKaraoke
npm install
```

### Development

Run the frontend and backend in separate terminals:

```bash
# Terminal 1 — Vite dev server (frontend)
npm run dev

# Terminal 2 — Express + Socket.io server (backend)
npm run dev:server
```

The frontend runs on `http://localhost:5173` and proxies API + socket requests to the backend on port `3001`.

### Production Build

```bash
npm run build
npm run server
```

The built frontend is served statically by the Express server at the same port (`3001` by default, or `PORT` env variable).

---

## How It Works

### Room & Sync Architecture

Every room has a **host** (the creator) and any number of **guests**. The host is the single source of truth for playback state.

- When the host plays, pauses, or seeks, a `host-control` event is sent to the server with a 250ms scheduled delay. The server timestamps the event and broadcasts it to guests, who apply it at the correct future timestamp — accounting for network transit time.
- Every 2 seconds, the host sends a `host-heartbeat` with its current video position. Guests send a `sync-ping` to the server; if their local time differs from the server's expected time by more than **300ms**, they seek to the correct position.

```
Host → host-control (play/pause/seek) → Server → playback-control → All Guests
Host → host-heartbeat (every 2s)      → Server (stores authoritative time)
Guest → sync-ping (every 2s)          → Server → drift correction if > 300ms
```

### Singer Rotation

The rotation system supports three modes (set by the host):

| Mode | Rotation triggers when... |
|---|---|
| `auto` | Song ends (3+ singers), or segment ends (2 singers) |
| `segment` | Each song segment ends |
| `song` | Each full song ends |

With **2 singers**, the app automatically switches to per-segment rotation so you alternate every section of the song.

### Lyrics

When a song is added, the server attempts to fetch synced LRC lyrics from LRCLIB, matched by title and artist. If synced lyrics are found, they scroll in real time with the video. Plain lyrics are shown as a fallback. The host can adjust the lyrics offset (±30s) to compensate for any timing difference between the karaoke video and the studio version used to time the lyrics.

---

## Project Structure

```
SakiKaraoke/
├── server/
│   ├── server.js          # Express + Socket.io server, event handlers
│   ├── roomStore.js       # In-memory room state (users, queue, playback, rotation)
│   ├── lrclib.js          # Lyrics fetching from LRCLIB API
│   └── youtube.js         # YouTube metadata & search
├── src/
│   ├── api/
│   │   └── socket.js      # Socket.io client singleton
│   ├── components/
│   │   ├── KaraokePlayer.jsx   # Video player, lyrics, controls
│   │   ├── QueueSidebar.jsx    # Song queue + rotation display
│   │   ├── RoomLobby.jsx       # Pre-game lobby, singer list
│   │   ├── SongSearch.jsx      # LRCLIB search UI
│   │   └── UrlInput.jsx        # YouTube URL input
│   ├── context/
│   │   └── RoomContext.jsx     # Global room state via React Context
│   ├── hooks/
│   │   └── useVideoSync.js     # Host heartbeat + guest drift correction loop
│   └── shared/
│       ├── lyrics.js           # LRC parsing, lyric window calculation
│       ├── mediaElement.js     # Abstraction over react-player internals
│       ├── playbackSync.js     # Sync math (drift, scheduling, expected time)
│       ├── rotation.js         # Singer rotation state machine
│       └── youtubeUrl.js       # YouTube URL validation & video ID extraction
├── tests/                      # Node test runner test suite
├── vite.config.js
└── package.json
```

---

## Socket Event Reference

| Event | Direction | Description |
|---|---|---|
| `create-room` | Client → Server | Create a new room, become host |
| `join-room` | Client → Server | Join an existing room by code |
| `add-song` | Client → Server | Add a YouTube URL or LRCLIB song to the queue |
| `host-control` | Client → Server | Play / pause / seek (host only) |
| `host-heartbeat` | Client → Server | Host sends current time every 2s |
| `sync-ping` | Client → Server | Guest checks drift against server |
| `next-song` | Client → Server | Skip to next song in queue (host only) |
| `advance-singer` | Client → Server | Advance rotation to next singer |
| `set-rotation-mode` | Client → Server | Change rotation mode (host only) |
| `set-lyrics-offset` | Client → Server | Adjust lyrics timing offset (host only) |
| `room-update` | Server → All | Broadcast full room state after any change |
| `playback-control` | Server → Guests | Immediate play/pause/seek command to guests |

---

## Running Tests

```bash
npm test
```

Tests are written with Node's built-in test runner (`node --test`). Coverage includes lyrics parsing, room store logic, playback sync math, rotation state, and YouTube URL validation.

---

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `PORT` | `3001` | Port the backend server listens on |

No other environment variables are required for local development.

---

## Known Limitations

- **YouTube buffering** — Sync precision depends on YouTube's player buffering. Users on slow connections may be slightly behind regardless of sync corrections.
- **Host dependency** — If the host disconnects, the next user in the room becomes host automatically, but playback state is preserved from the last heartbeat.
- **Room persistence** — Room state is in-memory. Restarting the server clears all rooms.
- **Mobile YouTube** — YouTube's IFrame API has restrictions on mobile browsers that may prevent autoplay. Works best on desktop.

---

## License

MIT