import { useEffect } from 'react'
import { createPortal } from 'react-dom'
import { IoClose, IoTvOutline } from 'react-icons/io5'

/** Full-screen "TV menu" shown when the player holds E at the in-room TV. */
export default function TVModal({ open, onClose, children }) {
  useEffect(() => {
    if (!open) return undefined
    const onKey = (e) => {
      if (e.key === 'Escape') onClose?.()
    }
    window.addEventListener('keydown', onKey)
    const focusTimer = setTimeout(() => {
      document.querySelector('.tv-modal .search-input')?.focus()
    }, 60)
    return () => {
      window.removeEventListener('keydown', onKey)
      clearTimeout(focusTimer)
    }
  }, [open, onClose])

  if (!open) return null

  return createPortal(
    <div
      className="tv-modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose?.()
      }}
    >
      <div className="tv-modal" role="dialog" aria-modal="true" aria-label="TV song menu">
        <header className="tv-modal-header">
          <span className="tv-modal-title">
            <IoTvOutline /> Karaoke TV
          </span>
          <span className="tv-modal-hint">Esc to return to the room</span>
          <button type="button" className="tv-modal-close" onClick={onClose} aria-label="Close TV menu">
            <IoClose />
          </button>
        </header>
        <div className="tv-modal-body">{children}</div>
      </div>
    </div>,
    document.body,
  )
}
