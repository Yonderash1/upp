import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

// A reusable "are you sure?" pop-up that matches the rest of the app (use instead of window.confirm).
//
//   <ConfirmDialog
//     title="Leave this group?"
//     confirmLabel="Leave group" danger
//     requireText="My Group"          // optional: the person must type this before Confirm unlocks
//     onConfirm={async () => { ... }} // may return a string to show as an error and stay open
//     onCancel={() => setDialog(null)}
//   >
//     Explain what will happen…
//   </ConfirmDialog>
//
// It closes itself (by calling onCancel) once onConfirm finishes without an error.
export default function ConfirmDialog({
  title, children, confirmLabel = 'Confirm', cancelLabel = 'Cancel',
  danger = false, requireText, onConfirm, onCancel
}) {
  const [typed, setTyped] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const inputRef = useRef(null)
  const cancelRef = useRef(null)
  const unlocked = !requireText || typed.trim() === requireText.trim()

  useEffect(() => {
    const previous = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = previous }
  }, [])

  // Destructive prompts start on Cancel (or the text box) so Enter can't confirm by accident
  useEffect(() => {
    if (requireText) inputRef.current?.focus()
    else cancelRef.current?.focus()
  }, [requireText])

  useEffect(() => {
    function onKey(e) { if (e.key === 'Escape' && !busy) onCancel() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [busy, onCancel])

  async function confirm() {
    if (!unlocked || busy) return
    setBusy(true); setError('')
    try {
      const result = await onConfirm()
      if (typeof result === 'string' && result) { setError(result); setBusy(false); return }
    } catch (err) {
      setError(err?.message || 'Something went wrong'); setBusy(false); return
    }
    onCancel()
  }

  // Rendered on <body> so side panels (which slide with transforms) can't clip or shift it
  return createPortal(
    <div className="modal-overlay confirm-overlay">
      <div className={`confirm-card ${danger ? 'danger' : ''}`} role="alertdialog" aria-modal="true" aria-label={title}>
        <div className="confirm-icon">{danger ? '⚠️' : '❔'}</div>
        <h3 className="confirm-title">{title}</h3>
        <div className="confirm-body">{children}</div>

        {requireText && (
          <div className="field" style={{ marginTop: 16, marginBottom: 0 }}>
            <label>Type <strong className="confirm-required">{requireText}</strong> to confirm</label>
            <input
              ref={inputRef} value={typed} onChange={e => setTyped(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); confirm() } }}
              placeholder={requireText} autoComplete="off" spellCheck={false}
            />
          </div>
        )}

        {error && <div className="error-msg" style={{ marginTop: 14, marginBottom: 0 }}>{error}</div>}

        <div className="confirm-actions">
          <button ref={cancelRef} type="button" className="btn btn-ghost" onClick={onCancel} disabled={busy}>{cancelLabel}</button>
          <button
            type="button" className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={confirm} disabled={!unlocked || busy}
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body
  )
}
