import { useEffect, useState } from 'react';
import { Save, Send, LogOut, RefreshCw, Check, X, LocateFixed } from 'lucide-react';
import LocationManager from './LocationManager.jsx';

export default function AccountPanel({ onExit }) {
  const [session, setSession] = useState(null);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [registering, setRegistering] = useState(false);
  const [profile, setProfile] = useState(null);
  const [dirty, setDirty] = useState(false);
  const [places, setPlaces] = useState([]);
  const [areaSearch, setAreaSearch] = useState('');
  const [queue, setQueue] = useState([]);
  const [moderating, setModerating] = useState(false);
  const [managingLocations, setManagingLocations] = useState(false);
  const [reasons, setReasons] = useState({});

  async function request(path, method = 'GET', body) {
    const response = await fetch(`/api${path}`, {
      method, headers: { 'Content-Type': 'application/json', ...(session?.csrfToken ? { 'X-CSRF-Token': session.csrfToken } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {})
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error || 'Unable to complete request');
    return result;
  }
  async function operation(work) {
    setBusy(true); setError(''); setNotice('');
    try { await work(); } catch (failure) { setError(failure.message); }
    finally { setBusy(false); }
  }
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/auth/session', { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Account access is unavailable. Try again.');
      return response.json();
    }).then(setSession).catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!session?.user) return;
    const controller = new AbortController();
    Promise.all(['/api/account/profile', '/api/locations'].map(path => fetch(path, { signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error('Unable to load your profile');
      return response.json();
    }))).then(([next, locations]) => { setProfile(next); setPlaces(locations); setDirty(false); })
      .catch(failure => { if (!controller.signal.aborted) setError(failure.message); });
    return () => controller.abort();
  }, [session?.user?.id]);

  function edit(field, value) { setProfile(current => ({ ...current, [field]: value })); setDirty(true); }
  async function useMyLocation() {
    await operation(async () => {
      if (!navigator.geolocation) throw new Error('Location is unavailable in this browser. Enter your office coordinates manually.');
      const position = await new Promise((resolve, reject) => navigator.geolocation.getCurrentPosition(resolve, failure => reject(new Error(
        failure.code === 1 ? 'Location permission was denied. Allow location access in your browser or enter coordinates manually.'
          : failure.code === 3 ? 'Finding your location timed out. Try again or enter coordinates manually.'
            : 'Unable to find your location. Try again or enter coordinates manually.'
      )), {
        enableHighAccuracy: true, timeout: 15000, maximumAge: 0
      }));
      setProfile(current => ({ ...current,
        latitude: Number(position.coords.latitude.toFixed(6)),
        longitude: Number(position.coords.longitude.toFixed(6))
      }));
      setDirty(true);
      setNotice('Location added to your draft. Confirm this is your office location before saving.');
    });
  }
  async function authenticate(event) {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.currentTarget));
    await operation(async () => setSession(await request(registering ? '/auth/register' : '/auth/login', 'POST', data)));
  }
  async function save(event) {
    event.preventDefault();
    await operation(async () => { setProfile(await request('/account/profile', 'PUT', profile)); setDirty(false); setNotice('Draft saved.'); });
  }
  async function submit() {
    await operation(async () => { setProfile(await request('/account/profile/submit', 'POST', { profile_version: profile.profile_version })); setNotice('Profile submitted for approval.'); });
  }
  async function loadQueue() {
    await operation(async () => { setQueue(await request('/moderation/profiles')); setModerating(true); });
  }
  async function decide(item, action) {
    await operation(async () => {
      await request(`/moderation/profiles/${item.id}`, 'POST', { action, profile_version: item.profile_version, reason: reasons[item.id] || '' });
      setQueue(await request('/moderation/profiles')); setNotice(action === 'approve' ? 'Profile published. Identity verification unchanged.' : 'Profile returned with feedback.');
    });
  }

  return <section className="account-panel" aria-labelledby="account-title">
    <div className="account-toolbar"><h2 id="account-title">{session?.user ? 'Agent account' : registering ? 'Create agent account' : 'Sign in'}</h2>
      <button className="secondary" onClick={onExit}>Browse agents</button>
      {session?.user && <button className="secondary" disabled={busy} onClick={() => operation(async () => {
        await request('/auth/logout', 'POST', {}); setSession(await request('/auth/session')); setProfile(null); setQueue([]); setModerating(false); setManagingLocations(false);
      })}><LogOut size={16} />Sign out</button>}
    </div>
    {error && <p role="alert" className="form-error">{error}</p>}
    {notice && <p role="status">{notice}</p>}
    {!session && !error && <p>Loading account...</p>}
    {session && !session.user && <>
      <div className="account-tabs" role="group" aria-label="Account access">
        <button className={registering ? 'secondary' : ''} onClick={() => { setRegistering(false); setError(''); }}>Sign in</button>
        <button className={registering ? '' : 'secondary'} onClick={() => { setRegistering(true); setError(''); }}>Register</button>
      </div>
      <form className="auth-form" onSubmit={authenticate} key={String(registering)}>
        {registering && <label>Public agent name<input name="name" required maxLength={160} autoComplete="name" /></label>}
        <label>Email<input name="email" type="email" required maxLength={254} autoComplete="email" /></label>
        <label>Password<input name="password" type="password" required minLength={12} maxLength={128} autoComplete={registering ? 'new-password' : 'current-password'} /></label>
        <button disabled={busy} type="submit">{busy ? 'Please wait...' : registering ? 'Create account' : 'Sign in'}</button>
      </form>
    </>}
    {session?.user && <>
      <p className="muted">{session.user.email}</p>
      {session.user.role === 'moderator' && <div className="account-tabs"><button className="secondary" onClick={() => { setModerating(false); setManagingLocations(false); }}>My profile</button><button className="secondary" disabled={busy} onClick={() => { setManagingLocations(false); loadQueue(); }}>Approval queue</button><button className="secondary" disabled={busy} onClick={() => { setModerating(false); setManagingLocations(true); }}>Locations</button></div>}
      {managingLocations && session.user.role === 'moderator' && <LocationManager places={places} request={request} operation={operation} busy={busy} onAdded={created => { setPlaces(current => [...current, created]); setNotice('Location added.'); }} />}
      {!moderating && !profile && !error && <p>Loading profile...</p>}
      {!moderating && !managingLocations && profile && <>
        <p><span className="tag">{profile.profile_status}</span> Identity: {profile.verification_status}</p>
        {profile.rejection_reason && <p role="status">Moderator feedback: {profile.rejection_reason}</p>}
        {profile.profile_status === 'approved' && <p>Saving changes removes this profile from discovery until it is approved again.</p>}
        <form className="profile-form" onSubmit={save}>
          <label>Public agent name<input value={profile.name} onChange={event => edit('name', event.target.value)} maxLength={160} required /></label>
          <label>Agency<input value={profile.agency_name || ''} onChange={event => edit('agency_name', event.target.value)} maxLength={160} /></label>
          <label>Public phone<input value={profile.phone || ''} onChange={event => edit('phone', event.target.value)} type="tel" maxLength={40} /></label>
          <label>WhatsApp<input value={profile.whatsapp || ''} onChange={event => edit('whatsapp', event.target.value)} type="tel" maxLength={40} /></label>
          <label className="full-width">Biography<textarea value={profile.bio || ''} onChange={event => edit('bio', event.target.value)} maxLength={4000} rows={4} /></label>
          <label>Office latitude<input value={profile.latitude ?? ''} onChange={event => edit('latitude', event.target.value)} type="number" step="any" min={-90} max={90} /></label>
          <label>Office longitude<input value={profile.longitude ?? ''} onChange={event => edit('longitude', event.target.value)} type="number" step="any" min={-180} max={180} /></label>
          <div className="full-width account-actions"><button type="button" className="secondary" disabled={busy} onClick={useMyLocation}><LocateFixed size={16} />Use My Location</button></div>
          <fieldset className="full-width"><legend>Service areas ({profile.service_area_ids.length})</legend>
            <input aria-label="Filter service areas" placeholder="Filter county or area" value={areaSearch} onChange={event => setAreaSearch(event.target.value)} />
            <div className="area-checklist">{places.filter(place => `${place.name} ${place.county}`.toLowerCase().includes(areaSearch.toLowerCase())).map(place => <label className="checkbox-label" key={place.id}>
              <input type="checkbox" checked={profile.service_area_ids.includes(place.id)} onChange={event => edit('service_area_ids', event.target.checked ? [...profile.service_area_ids, place.id] : profile.service_area_ids.filter(id => id !== place.id))} />
              {place.location_type === 'county' ? `${place.name} County` : `${place.name}, ${place.county}`}
            </label>)}</div>
          </fieldset>
          <div className="full-width account-actions"><button type="submit" disabled={busy || !dirty}><Save size={16} />Save draft</button>
            <button type="button" className="secondary" disabled={busy || dirty || !['draft', 'rejected'].includes(profile.profile_status)} onClick={submit}><Send size={16} />Submit for approval</button>
            <button type="button" className="secondary" disabled={busy} onClick={() => operation(async () => { setProfile(await request('/account/profile')); setDirty(false); })}><RefreshCw size={16} />Reload</button>
          </div>
        </form>
      </>}
      {moderating && <>
        <div className="account-toolbar"><h3>Pending profiles</h3><button className="secondary" disabled={busy} onClick={loadQueue}><RefreshCw size={16} />Refresh</button></div>
        {!queue.length && <p>No profiles awaiting approval.</p>}
        <div className="grid">{queue.map(item => <article className="card" key={item.id}>
          <h3>{item.name}</h3><p>{item.agency_name || 'Independent agent'}</p><p>{item.bio}</p><p>{item.phone} {item.whatsapp}</p>
          <p>{item.service_areas.map(area => `${area.name}, ${area.county}`).join('; ')}</p><p>Identity: {item.verification_status}</p>
          <label>Rejection feedback<textarea rows={3} maxLength={1000} value={reasons[item.id] || ''} onChange={event => setReasons(current => ({ ...current, [item.id]: event.target.value }))} /></label>
          <div className="account-actions"><button disabled={busy} onClick={() => decide(item, 'approve')}><Check size={16} />Approve profile</button><button className="secondary" disabled={busy || !reasons[item.id]?.trim()} onClick={() => decide(item, 'reject')}><X size={16} />Reject</button></div>
        </article>)}</div>
      </>}
    </>}
  </section>;
}
