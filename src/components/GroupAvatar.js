// Circular group image, falling back to the first letter of the group name
export default function GroupAvatar({ group, size = 48, style }) {
  const base = {
    width: size, height: size, borderRadius: '50%', flexShrink: 0,
    ...style
  }
  if (group.image_url) {
    return (
      <img
        src={group.image_url}
        alt={group.name}
        style={{ ...base, objectFit: 'cover', display: 'block', border: '2px solid var(--border)' }}
      />
    )
  }
  return (
    <div style={{
      ...base, background: 'var(--accent)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: 'Syne, sans-serif', fontWeight: 800, fontSize: size * 0.43
    }}>
      {group.name[0].toUpperCase()}
    </div>
  )
}
