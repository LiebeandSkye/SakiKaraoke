import { io } from 'socket.io-client'

const SOCKET_URL = import.meta.env.VITE_BACKEND_URL || (import.meta.env.PROD ? window.location.origin : 'http://localhost:3001')

// Connect automatically, but let it fail or reconnect gracefully.
export const socket = io(SOCKET_URL, {
  autoConnect: true,
  transports: ['polling', 'websocket'],
})
