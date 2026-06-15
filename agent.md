SakiKaraoke MVP Implementation Plan
For agentic workers: REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (- [ ]) syntax for tracking.

Goal: Build a working React, Express, and Socket.io collaborative karaoke MVP with rooms, synchronized YouTube playback, queueing, and singer rotation.
Architecture: Shared pure helpers own YouTube URL parsing, playback timestamp math, and rotation rules so backend and tests can verify the most fragile behavior. The backend keeps room state authoritative in memory and broadcasts public state through Socket.io. The frontend uses React Context plus a dedicated sync hook to apply host controls and drift correction to ReactPlayer.
Tech Stack: React, Vite, Node.js ESM, Express, Socket.io, ReactPlayer, Node test runner.
Task 1: Shared Logic Tests
Files:
Create: tests/youtubeUrl.test.js

Create: tests/playbackSync.test.js

Create: tests/rotation.test.js

Create: tests/roomStore.test.js


Write failing tests for YouTube URL parsing, ISO duration parsing, playback expected-time math, drift correction, scheduled controls, room creation, queue mutation, host-only controls, sync state, and singer rotation.

Task 2: Shared Logic Implementation
Files:
Create: src/shared/youtubeUrl.js

Create: src/shared/playbackSync.js

Create: src/shared/rotation.js

Create: server/roomStore.js


Implement only the functions required by Task 1 tests, then run npm test until those tests pass.

Task 3: Backend Socket Server
Files:
Create: server/server.js

Create: server/youtube.js

Modify: package.json


Add Express and Socket.io server using roomStore.


Add room, queue, playback, heartbeat, sync, and rotation events.


Add YouTube metadata lookup using YouTube Data API when YOUTUBE_API_KEY is set, with a safe thumbnail/title fallback.

Task 4: Frontend Realtime App
Files:
Create: src/api/socket.js

Create: src/context/RoomContext.jsx

Create: src/hooks/useVideoSync.js

Create: src/components/RoomLobby.jsx

Create: src/components/KaraokePlayer.jsx

Create: src/components/QueueSidebar.jsx

Create: src/components/UrlInput.jsx

Modify: src/App.jsx

Modify: src/App.css

Modify: src/index.css


Replace starter Vite UI with room creation/joining, player, queue sidebar, URL input, host controls, sync status, and rotation display.

Task 5: Verification
Files:
Modify code as needed based on test, lint, build, and browser feedback.


Run npm test.


Run npm run lint.


Run npm run build.


Start the app and inspect it in the browser.