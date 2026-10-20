// Turns map coordinates into a readable place name using OpenStreetMap's Nominatim service.
// (Free, but limited to light use — we only call it when someone clicks the map.)
function buildPlaceName(data) {
  const a = data.address || {}
  const road = [a.house_number, a.road].filter(Boolean).join(' ')
  const poi = data.name && data.name !== a.road ? data.name : ''
  const town = a.city || a.town || a.village || a.hamlet || a.suburb || ''

  const seen = new Set()
  const parts = [poi, road, town].filter(p => {
    const key = p.toLowerCase()
    if (!p || seen.has(key)) return false
    seen.add(key)
    return true
  })
  if (parts.length > 0) return parts.join(', ')
  return (data.display_name || '').split(',').slice(0, 3).join(',').trim()
}

export async function reverseGeocode(lat, lng) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 8000)
  try {
    const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&lat=${lat}&lon=${lng}`
    const res = await fetch(url, { signal: controller.signal, headers: { Accept: 'application/json' } })
    if (!res.ok) throw new Error('Place lookup failed')
    const data = await res.json()
    return buildPlaceName(data) || null
  } finally {
    clearTimeout(timer)
  }
}
