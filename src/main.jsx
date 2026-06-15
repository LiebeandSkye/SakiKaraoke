import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'

// Suppress React 19 / react-player console warnings
const originalError = console.error
console.error = (...args) => {
  if (
    typeof args[0] === 'string' &&
    (args[0].includes('Unknown event handler property') ||
      args[0].includes('React does not recognize the'))
  ) {
    return
  }
  originalError(...args)
}

// Suppress unhandled play() promise rejection (AbortError)
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    if (
      event.reason &&
      (event.reason.name === 'AbortError' ||
        (event.reason.message && event.reason.message.includes('play() request was interrupted')))
    ) {
      event.preventDefault()
    }
  })
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
