// Round profile picture, or the first letter of their username when they have none
export default function UserAvatar({ profile, size = 44 }) {
  if (profile?.avatar_url) {
    return (
      <img
        src={profile.avatar_url}
        alt=""
        style={{ width: size, height: size, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
      />
    )
  }
  return (
    <div
      className="avatar-sm"
      style={{ width: size, height: size, fontSize: size * 0.4, flexShrink: 0, cursor: 'inherit' }}
    >
      {profile?.username?.[0]?.toUpperCase() || '?'}
    </div>
  )
}
