// Shows text with line breaks kept and web links made clickable.
const URL_RE = /(https?:\/\/[^\s]+)/g

export default function Linkify({ text }) {
  if (!text) return null
  const parts = text.split(URL_RE)
  return (
    <span style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>
      {parts.map((part, i) =>
        /^https?:\/\//.test(part)
          ? <a key={i} href={part} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)' }}>{part}</a>
          : part
      )}
    </span>
  )
}
