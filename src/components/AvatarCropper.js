import { useState, useRef, useCallback } from 'react'

export default function AvatarCropper({ imageSrc, onSave, onCancel }) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [dragging, setDragging] = useState(false)
  const dragStart = useRef(null)
  const canvasRef = useRef(null)
  const imgRef = useRef(null)

  const SIZE = 280 // canvas/preview size

  const handleMouseDown = useCallback((e) => {
    e.preventDefault()
    setDragging(true)
    dragStart.current = {
      mx: e.clientX ?? e.touches?.[0]?.clientX,
      my: e.clientY ?? e.touches?.[0]?.clientY,
      ox: offset.x,
      oy: offset.y
    }
  }, [offset])

  const handleMouseMove = useCallback((e) => {
    if (!dragging || !dragStart.current) return
    const mx = e.clientX ?? e.touches?.[0]?.clientX
    const my = e.clientY ?? e.touches?.[0]?.clientY
    setOffset({
      x: dragStart.current.ox + (mx - dragStart.current.mx),
      y: dragStart.current.oy + (my - dragStart.current.my)
    })
  }, [dragging])

  const handleMouseUp = useCallback(() => {
    setDragging(false)
    dragStart.current = null
  }, [])

  function getCroppedCanvas() {
    const canvas = document.createElement('canvas')
    canvas.width = SIZE
    canvas.height = SIZE
    const ctx = canvas.getContext('2d')
    const img = imgRef.current
    if (!img) return null

    const naturalW = img.naturalWidth
    const naturalH = img.naturalHeight
    const baseScale = SIZE / Math.min(naturalW, naturalH)
    const totalScale = baseScale * scale

    const drawW = naturalW * totalScale
    const drawH = naturalH * totalScale
    const drawX = (SIZE - drawW) / 2 + offset.x
    const drawY = (SIZE - drawH) / 2 + offset.y

    // Clip to circle
    ctx.beginPath()
    ctx.arc(SIZE / 2, SIZE / 2, SIZE / 2, 0, Math.PI * 2)
    ctx.clip()
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    return canvas
  }

  function handleSave() {
    const canvas = getCroppedCanvas()
    if (!canvas) return
    canvas.toBlob(blob => {
      if (blob) onSave(blob)
    }, 'image/jpeg', 0.92)
  }

  // Hidden img for natural dimensions
  const naturalW = imgRef.current?.naturalWidth || 1
  const naturalH = imgRef.current?.naturalHeight || 1
  const baseScale = SIZE / Math.min(naturalW, naturalH)
  const totalScale = baseScale * scale
  const drawW = naturalW * totalScale
  const drawH = naturalH * totalScale
  const drawX = (SIZE - drawW) / 2 + offset.x
  const drawY = (SIZE - drawH) / 2 + offset.y

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'rgba(0,0,0,0.88)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: 24
    }}>
      <div style={{
        background: 'var(--card)', borderRadius: 20,
        padding: 32, maxWidth: 380, width: '100%',
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20
      }}>
        <h3 style={{ fontFamily: 'Syne, sans-serif', fontSize: '1.1rem', margin: 0 }}>Adjust your photo</h3>
        <p style={{ color: 'var(--muted)', fontSize: 13, margin: 0, textAlign: 'center' }}>
          Drag to reposition · Scroll or use slider to zoom
        </p>

        {/* Hidden natural-size img for dimension reference */}
        <img
          ref={imgRef}
          src={imageSrc}
          alt=""
          style={{ display: 'none' }}
          onLoad={() => { /* trigger re-render */ }}
        />

        {/* Preview circle */}
        <div
          style={{
            width: SIZE, height: SIZE,
            borderRadius: '50%',
            overflow: 'hidden',
            border: '3px solid var(--accent)',
            cursor: dragging ? 'grabbing' : 'grab',
            position: 'relative',
            flexShrink: 0,
            background: 'var(--bg3)',
            userSelect: 'none'
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          onWheel={e => {
            e.preventDefault()
            setScale(s => Math.min(4, Math.max(0.5, s - e.deltaY * 0.001)))
          }}
        >
          <img
            src={imageSrc}
            alt="crop preview"
            draggable={false}
            style={{
              position: 'absolute',
              width: drawW, height: drawH,
              left: drawX, top: drawY,
              pointerEvents: 'none',
              userSelect: 'none'
            }}
          />
        </div>

        {/* Zoom slider */}
        <div style={{ width: '100%' }}>
          <label style={{ fontSize: 12, color: 'var(--muted)', display: 'block', marginBottom: 6 }}>
            Zoom
          </label>
          <input
            type="range" min="0.5" max="4" step="0.01"
            value={scale}
            onChange={e => setScale(Number(e.target.value))}
            style={{ width: '100%', accentColor: 'var(--accent)' }}
          />
        </div>

        <div style={{ display: 'flex', gap: 10, width: '100%' }}>
          <button className="btn btn-primary" onClick={handleSave} style={{ flex: 1 }}>
            Save Photo
          </button>
          <button className="btn btn-ghost" onClick={onCancel} style={{ flex: 1 }}>
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
