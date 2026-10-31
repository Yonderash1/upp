import { useState, useEffect, useRef } from 'react'
import { addYears, format } from 'date-fns'
import { supabase } from '../lib/supabase'
import LabelPicker from './LabelPicker'
import LocationMapPicker from './LocationMapPicker'
import EventPermissions from './EventPermissions'
import { reverseGeocode } from '../lib/geocode'
import { prepareEventImage, uploadEventImage } from '../lib/eventImage'
import { audienceFromEvent, audienceToStored, audienceShort } from '../lib/eventAccess'

const MAX_LABELS = 5
const TBC_NAME = 'Location to be confirmed'
const ONLINE_NAME = 'Online event'

const LOCATION_TYPES = [
  { key: 'physical', icon: '📍', title: 'Add event location', desc: 'Pin the spot on the map' },
  { key: 'tbc', icon: '⏳', title: 'Location to be confirmed', desc: 'You can add it later by editing the event' },
  { key: 'online', icon: '💻', title: 'Online event', desc: 'Held over a call, stream or chat' },
  { key: 'other', icon: '📌', title: 'Other location', desc: 'Describe the place in your own words' }
]

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
  const [origLabelIds, setOrigLabelIds] = useState(null)   // labels the event had when the form opened (null = still loading)
  const [perm, setPerm] = useState(() => ({
    maxMode: editEvent?.max_attendees ? 'limit' : 'none',
    maxAttendees: editEvent?.max_attendees ? String(editEvent.max_attendees) : '',
    join: audienceFromEvent(editEvent?.join_access, editEvent?.join_min_role),
    visibility: audienceFromEvent(editEvent?.visibility_access, editEvent?.visibility_min_role),
  }))
  const [groupRoles, setGroupRoles] = useState([])
  // Thumbnail: the saved one (when editing), plus a newly chosen picture waiting to upload
  const [imageUrl, setImageUrl] = useState(editEvent?.image_url || null)
  const [newImage, setNewImage] = useState(null)       // { blob, preview } once a picture has been chosen
  const [imageBusy, setImageBusy] = useState(false)
  const [showPerms, setShowPerms] = useState(false)
  const [lookingUp, setLookingUp] = useState(false)
  const [lookupFailed, setLookupFailed] = useState(false)
  const [autoFilled, setAutoFilled] = useState(false)
  // True once the person has typed their own name (so map clicks won't overwrite it).
  // A saved event's name counts as typed.
  const nameEdited = useRef(!!editEvent)
  const lookupId = useRef(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // When editing, load the event's existing labels
  useEffect(() => {
    if (!editEvent) return
    supabase
      .from('event_label_assignments')
      .select('group_labels(id, name)')
      .eq('event_id', editEvent.id)
      .then(({ data }) => {
        const loaded = (data || []).map(r => r.group_labels).filter(Boolean)
        setLabels(loaded)
        setOrigLabelIds(loaded.map(l => l.id))
      })
  }, [editEvent?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // The group's roles, for the "open to / visible to" role pickers
  useEffect(() => {
    if (!groupId) return
    supabase.from('group_roles').select('*').eq('group_id', groupId).order('rank', { ascending: true })
      .then(({ data }) => setGroupRoles(data || []))
  }, [groupId])

  function updatePerm(partial) { setPerm(p => ({ ...p, ...partial })) }

  function handleNameChange(value) {
    setLocationName(value)
    nameEdited.current = value.trim() !== ''   // clearing the box lets the map fill it in again
    setAutoFilled(false)
  }

  // Dropping a pin fills in the location name (unless they've typed their own).
  // `label` is the address text when the pin came from the search box, so no extra lookup is needed.
  async function handlePick(point, label) {
    setLatlng({ lat: point.lat, lng: point.lng })
    setLookupFailed(false)
    const myLookup = ++lookupId.current
    if (label) {
      setLookingUp(false)
      if (!nameEdited.current) { setLocationName(label); setAutoFilled(true) }
      return
    }
    setLookingUp(true)
    try {
      const name = await reverseGeocode(point.lat, point.lng)
      if (myLookup !== lookupId.current) return   // a newer click has taken over
      if (!name) setLookupFailed(true)
      else if (!nameEdited.current) { setLocationName(name); setAutoFilled(true) }
    } catch (err) {
      if (myLookup === lookupId.current) setLookupFailed(true)
    } finally {
      if (myLookup === lookupId.current) setLookingUp(false)
    }
  }

  function handleResetMap() {
    lookupId.current++            // ignore any lookup still in flight
    setLatlng(null)
    setLocationName('')
    nameEdited.current = false
    setAutoFilled(false); setLookingUp(false); setLookupFailed(false)
  }

  async function handleImageChosen(e) {
    const file = e.target.files?.[0]
    e.target.value = ''           // lets the same file be chosen again later
    if (!file) return
    setError(''); setImageBusy(true)
    try {
      const blob = await prepareEventImage(file)
      setNewImage(prev => { if (prev) URL.revokeObjectURL(prev.preview); return { blob, preview: URL.createObjectURL(blob) } })
    } catch (err) {
      setError(err.message)
    } finally {
      setImageBusy(false)
    }
  }

  function removeImage() {
    setNewImage(prev => { if (prev) URL.revokeObjectURL(prev.preview); return null })
    setImageUrl(null)
  }

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
      if (!latlng) { setError('Please pin the location — click the map or search for an address'); return }
    }
    if (locationType === 'other' && !locationName.trim()) {
      setError('Please enter the location name'); return
    }
    let maxAttendees = null
    if (perm.maxMode === 'limit') {
      maxAttendees = parseInt(perm.maxAttendees, 10)
      if (!maxAttendees || maxAttendees < 1 || maxAttendees > 100000) {
        setError('Event permissions: enter a maximum attendee number between 1 and 100,000'); return
      }
    }
    if ((perm.join.mode === 'role' && !perm.join.roleId) ||
        (perm.visibility.mode === 'role' && !perm.visibility.roleId)) {
      setError('Event permissions: choose a role'); return
    }

    setLoading(true)
    if (editEvent && maxAttendees) {
      const { count } = await supabase.from('attendees').select('*', { count: 'exact', head: true }).eq('event_id', editEvent.id)
      if (count > maxAttendees) {
        setError(`${count} people are already going, so the limit can't be lower than ${count}`)
        setLoading(false); return
      }
    }
    let finalImageUrl = imageUrl
    if (newImage) {
      try {
        finalImageUrl = await uploadEventImage(groupId, newImage.blob)
      } catch (err) {
        setError('Could not upload the thumbnail: ' + (err.message || 'unknown error'))
        setLoading(false); return
      }
    }
    const joinStored = audienceToStored(perm.join)
    const visStored = audienceToStored(perm.visibility)
    const hasPlaceName = locationType === 'physical' || locationType === 'other'
    const payload = {
      title: title.trim(),
      description: description.trim() || null,
      image_url: finalImageUrl || null,
      event_date: startAt.toISOString(),
      event_end: endAt.toISOString(),
      location_type: locationType,
      location_name: hasPlaceName ? locationName.trim() : locationType === 'online' ? ONLINE_NAME : TBC_NAME,
      location_details: (locationType === 'online' || locationType === 'other') ? (locationDetails.trim() || null) : null,
      lat: locationType === 'physical' ? latlng.lat : null,
      lng: locationType === 'physical' ? latlng.lng : null,
      group_id: groupId,
      max_attendees: maxAttendees,
      join_access: joinStored.access,
      join_min_role: joinStored.minRole,
      visibility_access: visStored.access,
      visibility_min_role: visStored.minRole,
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

    // Save labels (replace the old set) — when editing, only if they actually changed
    const sameIds = ids => ids.map(String).sort().join(',')
    const labelsChanged = !editEvent || (origLabelIds !== null && sameIds(origLabelIds) !== sameIds(labels.map(l => l.id)))
    let labelError = null
    if (editEvent && labelsChanged) {
      const { error: delErr } = await supabase.from('event_label_assignments').delete().eq('event_id', eventId)
      if (delErr) labelError = delErr
    }
    if (!labelError && labelsChanged && labels.length > 0) {
      const { error: insErr } = await supabase
        .from('event_label_assignments')
        .insert(labels.map(l => ({ event_id: eventId, label_id: l.id })))
      if (insErr) labelError = insErr
    }
    if (editEvent && labelsChanged && !labelError) {
      // adds "Labels changed" to the same notification the rest of this save sent to people who are going
      const { error: notifyErr } = await supabase.rpc('notify_event_labels_changed', { p_event: eventId })
      if (notifyErr) console.error('Label change notification failed:', notifyErr)
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
    <>
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

      <div className="field">
        <label>Thumbnail image (optional)</label>
        <div className="thumb-upload">
          <div className="thumb-preview">
            {(newImage?.preview || imageUrl)
              ? <img src={newImage?.preview || imageUrl} alt="Event thumbnail preview" />
              : <span>{imageBusy ? 'Preparing…' : '🖼 No image yet'}</span>}
          </div>
          <div className="thumb-actions">
            <label className="btn btn-ghost thumb-pick">
              {newImage || imageUrl ? 'Change image' : 'Choose image'}
              <input type="file" accept="image/*" onChange={handleImageChosen} hidden />
            </label>
            {(newImage || imageUrl) && (
              <button type="button" className="btn btn-ghost" onClick={removeImage}>Remove</button>
            )}
          </div>
        </div>
        <div className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>
          Shown on the event card. Pictures are cropped to a 16:9 shape so every event looks the same.
        </div>
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
              value={locationName} onChange={e => handleNameChange(e.target.value)}
              placeholder="e.g. The Sports Centre, Bristol"
            />
            {autoFilled && <div className="field-hint" style={{ marginTop: 6, marginBottom: 0 }}>Filled in from the map — you can edit it.</div>}
          </div>
          <div className="field">
            <label>Pin on the map</label>
            <LocationMapPicker
              latlng={latlng}
              onPick={handlePick}
              onReset={handleResetMap}
              hint={
                lookingUp ? 'Looking up place name…'
                : lookupFailed ? "Couldn't find a name for this spot — type one in above"
                : latlng ? `📍 ${locationName || `${latlng.lat.toFixed(4)}, ${latlng.lng.toFixed(4)}`} — press Reset to move the pin`
                : 'Click the map to drop a pin, or search for an address below'
              }
            />
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
        <LabelPicker selected={labels} onChange={setLabels} min={0} max={MAX_LABELS} usage="events" />
      </div>

      <h4 className="form-section-title">Permissions</h4>
      <div className="permissions-row">
        <button type="button" className="btn btn-ghost" style={{ width: 'auto' }} onClick={() => setShowPerms(true)}>
          🔐 Event permissions
        </button>
        <span className="permissions-summary">
          {perm.maxMode === 'limit' && perm.maxAttendees ? `Max ${perm.maxAttendees} attendees` : 'No attendee limit'}
          {' · '}Open to: {audienceShort(perm.join, groupRoles)}
          {' · '}Visible to: {audienceShort(perm.visibility, groupRoles)}
        </span>
      </div>

      {error && <div className="error-msg" style={{ marginTop: 12 }}>{error}</div>}
      <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
        <button className="btn btn-primary" type="submit" disabled={loading}>
          {loading ? 'Saving...' : editEvent ? 'Save changes' : 'Post event'}
        </button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>

    {/* Outside the <form> so pressing Enter in the permissions box can't post the event */}
    {showPerms && <EventPermissions value={perm} onChange={updatePerm} onClose={() => setShowPerms(false)} roles={groupRoles} />}
    </>
  )
}
