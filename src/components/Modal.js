import { useEffect } from 'react'

// Centred pop-up. It deliberately does NOT close when you click the dark area
// (so a half-written post can't be lost by accident) — use ✕ or Cancel.
export default function Modal({ title, onClose, width = 720, children }) {
  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  return (
    <div className="modal-overlay">
      <div className="modal-card" role="dialog" aria-modal="true" aria-label={title} style={{ maxWidth: width }}>
        <div className="modal-header">
          <h3>{title}</h3>
          <button onClick={onClose} aria-label="Close">✕</button>
        </div>
        <div className="modal-body">{children}</div>
      </div>
    </div>
  )
}
