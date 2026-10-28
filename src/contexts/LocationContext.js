import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from './AuthContext'

// Shares the things needed to show "how far is this event?":
//   unit  – 'km' (default) or 'mi', chosen in the profile settings
//   home  – the saved home town's coordinates
//   here  – the device's current position (only asked for once something needs it)
const LocationContext = createContext({
  unit: 'km', home: null, here: null,
  requestHere: () => {}, refreshPrefs: () => {},
})

export function LocationProvider({ children }) {
  const { user } = useAuth()
  const userId = user?.id
  const [prefs, setPrefs] = useState({ unit: 'km', home: null })
  const [here, setHere] = useState(null)
  const asked = useRef(false)

  const refreshPrefs = useCallback(async () => {
    if (!userId) return
    const { data } = await supabase
      .from('profiles').select('distance_unit, city_lat, city_lng').eq('id', userId).maybeSingle()
    if (!data) return
    setPrefs({
      unit: data.distance_unit === 'mi' ? 'mi' : 'km',
      home: data.city_lat != null && data.city_lng != null ? { lat: data.city_lat, lng: data.city_lng } : null,
    })
  }, [userId])

  useEffect(() => { refreshPrefs() }, [refreshPrefs])

  // Browser location is only requested the first time a card wants a distance
  const requestHere = useCallback(() => {
    if (asked.current || !navigator.geolocation) return
    asked.current = true
    navigator.geolocation.getCurrentPosition(
      pos => setHere({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => {},
      { timeout: 8000, maximumAge: 5 * 60 * 1000 }
    )
  }, [])

  return (
    <LocationContext.Provider value={{ ...prefs, here, requestHere, refreshPrefs }}>
      {children}
    </LocationContext.Provider>
  )
}

export function useLocationPrefs() {
  return useContext(LocationContext)
}

// Same as above, but also asks the browser for the current position
export function useGeo() {
  const ctx = useContext(LocationContext)
  useEffect(() => { ctx.requestHere() }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return ctx
}
