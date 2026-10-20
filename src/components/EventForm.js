import { useState, useEffect } from 'react'
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'
import { addYears, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import LabelPicker from './LabelPicker'

delete L.Icon.Default.prototype._getIconUrl
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
})

const MAX_LABELS = 5
const TBC_NAME = 'Location to be confirmed'
const ONLINE_NAME = 'Online event'

const LOCATION_TYPES = [
  { key: 'physical', icon: '📍', title: 'Add event location', desc: 'Pin the spot on the map' },
  { key: 'tbc', icon: '⏳', title: 'Location to be confirmed', desc: 'You can add it later by editing the event' },
  { key: 'online', icon: '💻', title: 'Online event', desc: 'Held over a call, stream or chat' },
  { key: 'other', icon: '📌', title: 'Other location', desc: 'Describe the place in your own words' }
]

function LocationPicker({ onSelect }) {
  useMapEvents({ click(e) { onSelect(e.latlng) } })
  return null
}

const dateStr = d => format(d, 'yyyy-MM-dd')
const timeStr = d => format(d, 'HH:mm')

// Used for creating and editing events, both on the group page and the Post an Event page.
export default function EventForm({ groupId, userId, editEvent, onSuccess, onCancel }) {
  const start = editEvent ? new Date(editEvent.event_date) : null
  const end = editEvent?.event_end ? new Date(editEvent.event_end) : null
  const editType = editEvent?.location_type || null

  const [title, setTitle] = useState(editEvent?.title || '')
  const [description, setDescription] = useState(editEvent?.description || '')
  const [startDate, setStartDate] = useState(start ? dateStr(start) : '')
  const [startTime, setStartTime] = useState(start ? timeStr(start) : '')
  const [endDate, setEndDate] = useState(end ? dateStr(end) : '')
  const [endTime, setEndTime] = useState(end ? timeStr(end) : '')
  const [locationType, setLocationType] = useState(editType)
  const [locationName, setLocationName] = useState(
    editType === 'physical' || editType === 'other' ? editEvent.location_name : ''
  )
  const [locationDetails, setLocationDetails] = useState(editEvent?.location_details || '')
  const [latlng, setLatlng] = useState(editEvent?.lat ? { lat: editEvent.lat, lng: editEvent.lng } : null)
  const [labels, setLabels] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When editing, load the event's existing labels
  useEffect(() => {
    if (!editEvent) return
    supabase
      .from('event_label_assignments')
      .select('group_labels(id, name)')
      .eq('event_id', editEvent.id)
      .then(({ data }) => setLabels((data || []).map(r => r.group_labels).filter(Boolean)))
  }, [editEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  function handleStartDate(value) {
    setStartDate(value)
    // Saves a click: finish date follows the start date unless it's already later
    if (!endDate || endDate < value) setEndDate(value)
  }

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')

    if (!groupId) { setError('Please select a group to post this event under'); return }
    if (!title.trim()) { setError('Please give your event a name'); return }
    if (!startDate || !startTime || !endDate || !endTime) {
      setError('Please set the start and finish date and time'); return
    }
    const startAt = new Date(`${startDate}T${startTime}`)
    const endAt = new Date(`${endDate}T${endTime}`)
    if (isNaN(startAt) || isNaN(endAt)) { setError('Please check your dates and times'); return }
    if (!editEvent && startAt < new Date()) { setError('The start time needs to be in the future'); return }
    if (endAt <= startAt) { setError('The event needs to finish after it starts'); return }
    if (endAt > addYears(startAt, 1)) { setError('An event can run for a maximum of one year'); return }
    if (!locationType) { setError('Please choose where your event is happening'); return }
    if (locationType === 'physical') {
      if (!locationName.trim()) { setError('Please add a name for the location'); return }
      if (!latlng) { setError('Please click the map to pin the location'); return }
    }
    if (locationType === 'other' && !locationName.trim()) {
      setError('Please enter the location name'); return
    }

    setLoading(true)
    const hasPlaceName = locationType === 'physical' || locationType === 'other'
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      event_date: startAt.toISOString(),
      event_end: endAt.toISOString(),
      location_type: locationType,
      location_name: hasPlaceName ? locationName.trim() : locationType === 'online' ? ONLINE_NAME : TBC_NAME,
      location_details: (locationType === 'online' || locationType === 'other') ? (locationDetails.trim() || null) : null,
      lat: locationType === 'physical' ? latlng.lat : null,
      lng: locationType === 'physical' ? latlng.lng : null,
      group_id: groupId,
    }

    let eventId = editEvent?.id
    if (editEvent) {
      const { data, error: err } = await supabase.from('events').update(payload).eq('id', editEvent.id).select('id')
      if (err) { setError(err.message); setLoading(false); return }
      if (!data || data.length === 0) {
        setError("You don't have permission to edit this event"); setLoading(false); return
      }
    } else {
      const { data, error: err } = await supabase
        .from('events')
        .insert({ ...payload, user_id: userId, category: null })
        .select('id')
        .single()
      if (err) { setError(err.message); setLoading(false); return }
      eventId = data.id
    }

    // Save labels (replace the old set)
    let labelError = null
    if (editEvent) {
      const { error: delErr } = await supabase.from('event_label_assignments').delete().eq('event_id', eventId)
      if (delErr) labelError = delErr
    }
    if (!labelError && labels.length > 0) {
      const { error: insErr } = await supabase
        .from('event_label_assignments')
        .insert(labels.map(l => ({ event_id: eventId, label_id: l.id })))
      if (insErr) labelError = insErr
    }
    if (labelError) {
      console.error('Saving event labels failed:', labelError)
      alert('Your event was saved, but its labels could not be: ' + labelError.message)
    }

    setLoading(false)
    onSuccess()
  }

  const endMax = startDate ? dateStr(addYears(new Date(`${startDate}T00:00`), 1)) : undefined

  return (
    <form onSubmit={handleSubmit}>
      <div className="field">
        <label>Event name</label>
        <input
          value={title} onChange={e => setTitle(e.target.value)}
          placeholder="Give your event a name" maxLength={100} required autoFocus={!editEvent}
        />
      </div>

      <div className="field">
        <label>Description (optional)</label>
        <textarea
          value={description} onChange={e => setDescription(e.target.value)} rows={5}
          placeholder="Add further details on where to join the event, directions, links, points of contact, and any useful tips for new joiners"
        />
      </div>

      <h4 className="form-section-title">When</h4>
      <div className="form-grid">
        <div className="field">
          <label>Start date</label>
          <input type="date" value={startDate} min={!editEvent ? dateStr(new Date()) : undefined}
            onChange={e => handleStartDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>Start time</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} required />
        </div>
        <div className="field">
          <label>Finish date</label>
          <input type="date" value={endDate} min={startDate || undefined} max={endMax}
            onChange={e => setEndDate(e.target.value)} required />
        </div>
        <div className="field">
          <label>Finish time</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} required />
        </div>
      </div>
      <div className="field-hint">Events can run for up to a year.</div>

      <h4 className="form-section-title">Where</h4>
      <div className="field">
        <label>Is this a physical event?</label>
        <div className="option-grid">
          {LOCATION_TYPES.map(t => (
            <button
              type="button" key={t.key}
              className={`option-tile ${locationType === t.key ? 'selected' : ''}`}
              aria-pressed={locationType === t.key}
              onClick={() => setLocationType(t.key)}
            >
              <span className="option-icon">{t.icon}</span>
              <strong>{t.title}</strong>
              <span className="option-desc">{t.desc}</span>
            </button>
          ))}
        </div>
      </div>

      {locationType === 'physical' && (
        <>
          <div className="field">
            <label>Location name</label>
            <input
              value={locationName} onChange={e => setLocationName(e.target.value)}
              placeholder="e.g. The Sports Centre, Bristol"
            />
          </div>
          <div className="field">
            <label>Pin on the map</label>
            <div className="location-picker">
              <MapContainer
                center={latlng ? [latlng.lat, latlng.lng] : [54.5, -3]}
                zoom={latlng ? 13 : 5} style={{ height: 240 }} scrollWheelZoom={false}
              >
                <TileLayer attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                <LocationPicker onSelect={setLatlng} />
                {latlng && <Marker position={latlng} />}
              </MapContainer>
              <div className="location-hint">
                {latlng ? `📍 ${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}` : 'Click the map to drop a pin'}
              </div>
            </div>
          </div>
        </>
      )}

      {locationType === 'online' && (
        <div className="field">
          <label>Further details for online event (optional)</label>
          <textarea
            value={locationDetails} onChange={e => setLocationDetails(e.target.value)} rows={4}
            placeholder="Add the software name or requirements, links to sites, and any additional information for attendees"
          />
        </div>
      )}

      {locationType === 'other' && (
        <>
          <div className="field">
            <label>Location name</label>
            <input
              value={locationName} onChange={e => setLocationName(e.target.value)}
              placeholder="Where is it happening?"
            />
          </div>
          <div className="field">
            <label>Further details (optional)</label>
            <textarea
              value={locationDetails} onChange={e => setLocationDetails(e.target.value)} rows={4}
              placeholder="Add anything that helps people find or join the event"
            />
          </div>
        </>
      )}

      <h4 className="form-section-title">Labels</h4>
      <div className="field">
        <label>Help people find your event (optional, up to {MAX_LABELS})</label>
        <LabelPicker selected={labels} onChange={setLabels} min={0} max={MAX_LABELS} />
      </div>

      {error && <div className="error-msg" style={{ marginTop: 8 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 8 }}>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : editEvent ? 'Save changes' : 'Post event'}
        </button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  )
}
