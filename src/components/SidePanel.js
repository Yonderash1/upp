// A collapsible panel that sits at the right of a flex layout.
// Open: it takes `width` px and the sibling content squeezes to fit.
// Closed: it collapses to nothing and only the arrow tab stays visible.
// Below 900px it floats over the page instead of squeezing it (see App.css).
export default function SidePanel({ open, onToggle, label = 'panel', width = 260, children }) {
  return (
    <div className={`side-dock ${open ? 'open' : 'closed'}`} style={{ '--panel-w': `${width}px` }}>
      <button
        className="side-toggle"
        onClick={onToggle}
        aria-label={open ? `Hide ${label}` : `Show ${label}`}
        aria-expanded={open}
        title={open ? `Hide ${label}` : `Show ${label}`}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
          style={{ transform: open ? 'none' : 'rotate(180deg)', transition: 'transform 0.3s ease' }}>
          <polyline points="9 6 15 12 9 18" />
        </svg>
      </button>
      <aside className="side-panel" aria-hidden={!open}>
        <div className="side-scroll">{children}</div>
      </aside>
    </div>
  )
}
