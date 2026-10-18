// A collapsible panel for the left or right of a flex layout.
// Open:   it takes `width` px and the content beside it squeezes to fit.
// Closed: the panel collapses and only a slim rail with the arrow button is left.
// Below 900px it floats over the page instead of squeezing it (see App.css).
export default function SidePanel({ side = 'right', open, onToggle, label = 'panel', width = 260, children }) {
  // The arrow points the way the panel will slide when you click it
  const pointsRight = side === 'right' ? open : !open

  return (
    <div className={`side-dock ${side} ${open ? 'open' : 'closed'}`} style={{ '--panel-w': `${width}px` }}>
      <div className="side-rail">
        <button
          className="side-toggle"
          onClick={onToggle}
          aria-label={open ? `Hide ${label}` : `Show ${label}`}
          aria-expanded={open}
          title={open ? `Hide ${label}` : `Show ${label}`}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
            strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{ transform: pointsRight ? 'none' : 'rotate(180deg)', transition: 'transform 0.3s ease' }}>
            <polyline points="9 6 15 12 9 18" />
          </svg>
        </button>
      </div>
      <aside className="side-panel" aria-hidden={!open}>
        <div className="side-scroll">{children}</div>
      </aside>
    </div>
  )
}
