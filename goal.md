I want to build a real-time collaborative karaoke web application called SakiKaraoke. Please provide a technical roadmap and the core implementation logic for a Node.js/Socket.io application with the following features:

1. Core Architecture
Stack: React (Frontend), Node.js + Express (Backend), Socket.io (Real-time sync).

Room System: Users must be able to create a room (generating a unique 6-character room code) or join an existing room via a code.

2. Audio/Video Sync (The Most Important Part)
I need a synchronization strategy using Socket.io. When the host plays, pauses, or seeks a YouTube video (via react-player or youtube-iframe-api), all clients in the room must trigger the same action within milliseconds.

How should I handle "drift"? Please provide a logic snippet for checking the currentTime of the video across clients and auto-correcting if they are off by more than 1 second.

3. Turn-Based Logic
Implement a queue system where users are added to a "rotation."

If there are 2 players, they should alternate turns after each section of the song. If there are 3+ players, they alternate after the full song or specific segments. Please suggest a flexible state-management approach (Redux or Context API) to handle the currentSinger index.

4. Features
URL Input: An input field where any user can paste a YouTube URL. This should validate the URL, fetch metadata (Title, Thumbnail, Duration) using a library like ytdl-core or a similar API, and add it to the global room queue.

Queue UI: A sidebar showing the list of upcoming songs, with the currently playing song highlighted.

Deliverables Requested:
A suggested folder structure.

The Socket.io event schema (e.g., join-room, play-video, queue-update, sync-time).

A code snippet for the Backend server.js handling the room state and the Frontend hook for synchronization.

Tips for your development:
The "Host" Problem: Always keep the "Host" as the source of truth for the timestamp, but have clients ping the server to check their sync status every 5 seconds.

YouTube Player API: Use the react-player library. It acts as a wrapper for YouTube and makes controlling playback via code much easier than using the raw iframe API.

Handling Latency: Since Socket.io is fast, the latency will likely come from the YouTube player itself. You may want to implement a "Buffer" where the video loads silently before playing to ensure everyone starts at the exact same time.