import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, LocateFixed, ChevronLeft, ChevronRight, X, Phone, MapPin, MessageCircle, UserRound } from 'lucide-react';
import './styles.css';
import PwaControls from './PwaControls.jsx';
import AccountPanel from './AccountPanel.jsx';

const safePhone = value => String(value || '').replace(/[^\d+]/g, '');
const initialQuery = { q: '', location: '', page: '1', page_size: '12' };

function ApprovedReviews({ id }) {
  const [reviews, setReviews] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/agents/${id}/reviews`, { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(rows => { if (!controller.signal.aborted) setReviews(rows); })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [id]);
  if (error) return <p role="status">Reviews are unavailable. Close and reopen to retry.</p>;
  if (!reviews) return <p role="status">Loading reviews...</p>;
  return reviews.length ? <ul className="reviews">{reviews.map((review, index) => <li key={index}>
    <strong>{review.rating} / 5</strong><p>{review.comment || 'No written comment'}</p>
    <time dateTime={review.created_at}>{new Date(review.created_at).toLocaleDateString('en-KE')}</time>
  </li>)}</ul> : <p>No approved reviews yet.</p>;
}

function AgentCard({ agent }) {
  const [showReviews, setShowReviews] = useState(false);
  return <article className="card">
    <div className="agent-heading"><h3>{agent.name}</h3><span className="tag">{agent.verification_status === 'verified' ? 'Identity verified' : 'Not verified'}</span></div>
    <p className="muted">{agent.agency_name || 'Independent agent'}</p>
    <p className="rating">{agent.review_count > 0 ? `${agent.average_rating} / 5 (${agent.review_count} reviews)` : 'No reviews yet'}</p>
    <p>{agent.bio || 'No biography available'}</p>
    <p className="service-areas"><MapPin size={16} aria-hidden="true" /><span>{agent.service_areas.length
      ? agent.service_areas.map(area => area.location_type === 'county' ? `${area.name} County` : `${area.name}, ${area.county}`).join('; ')
      : 'Service areas not listed'}</span></p>
    {agent.distance_km != null && <p className="muted">Office {Number(agent.distance_km).toFixed(1)} km away</p>}
    <div className="contacts">
      {agent.phone && <a href={`tel:${safePhone(agent.phone)}`}><Phone size={16} aria-hidden="true" />Call</a>}
      {agent.whatsapp && <a rel="noopener noreferrer" target="_blank" href={`https://wa.me/${safePhone(agent.whatsapp).replace(/\+/g, '')}`}><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
    </div>
    {agent.review_count > 0 && <details onToggle={event => setShowReviews(event.currentTarget.open)}>
      <summary>Read approved reviews</summary>{showReviews && <ApprovedReviews id={agent.id} />}
    </details>}
  </article>;
}

function App() {
  const [accountOpen, setAccountOpen] = useState(false);
  const [online, setOnline] = useState(navigator.onLine);
  useEffect(() => {
    const connected = () => setOnline(true);
    const disconnected = () => setOnline(false);
    window.addEventListener('online', connected);
    window.addEventListener('offline', disconnected);
    return () => { window.removeEventListener('online', connected); window.removeEventListener('offline', disconnected); };
  }, []);
  const [search, setSearch] = useState('');
  const [location, setLocation] = useState('');
  const [countyId, setCountyId] = useState('');
  const [areaId, setAreaId] = useState('');
  const [radius, setRadius] = useState('25');
  const [locations, setLocations] = useState([]);
  const [locationsError, setLocationsError] = useState(false);
  const [locationRetry, setLocationRetry] = useState(0);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState({ items: [], total: 0, total_pages: 0, page: 1 });
  const [ads, setAds] = useState([]);
  const [status, setStatus] = useState('Loading agents...');
  const [loading, setLoading] = useState(true);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);
  const locationRequest = useRef(0);

  useEffect(() => {
    const controller = new AbortController();
    setLocationsError(false);
    fetch('/api/locations', { signal: controller.signal })
      .then(response => { if (!response.ok) throw new Error(); return response.json(); })
      .then(rows => { if (!controller.signal.aborted) setLocations(rows); })
      .catch(() => { if (!controller.signal.aborted) setLocationsError(true); });
    return () => controller.abort();
  }, [locationRetry, online]);

  useEffect(() => {
    const controller = new AbortController();
    async function load() {
      setResult({ items: [], total: 0, total_pages: 0, page: 1 });
      setAds([]);
      setLoading(true);
      setFailed(false);
      setStatus('Loading agents...');
      try {
        const [agentResponse, nextAds] = await Promise.all([
          fetch(`/api/agents?${new URLSearchParams(query)}`, { signal: controller.signal }),
          fetch(`/api/ads?${new URLSearchParams(query)}`, { signal: controller.signal })
            .then(response => response.ok ? response.json() : null).catch(() => null)
        ]);
        if (!agentResponse.ok) throw new Error();
        const next = await agentResponse.json();
        if (controller.signal.aborted) return;
        setResult(next);
        setStatus(`${next.total} ${next.total === 1 ? 'agent' : 'agents'} found`);
        // Ads failing must not hide successful organic search results.
        setAds(nextAds);
      } catch {
        if (controller.signal.aborted) return;
        setResult({ items: [], total: 0, total_pages: 0, page: 1 });
        setAds([]);
        setFailed(true);
        setStatus('The directory is unavailable. Please try again.');
      } finally { if (!controller.signal.aborted) setLoading(false); }
    }
    load();
    return () => controller.abort();
  }, [query, online]);

  useEffect(() => () => { locationRequest.current += 1; }, []);
  const counties = locations.filter(item => item.location_type === 'county').sort((a, b) => a.name.localeCompare(b.name));
  const byId = new Map(locations.map(item => [String(item.id), item]));
  function inCounty(item) {
    const seen = new Set();
    let current = item;
    while (current && !seen.has(current.id)) {
      if (String(current.id) === countyId) return true;
      seen.add(current.id);
      current = byId.get(String(current.parent_id));
    }
    return false;
  }
  const areas = countyId ? locations.filter(item => item.location_type !== 'county' && inCounty(item)) : [];
  const areaLabel = item => {
    const parts = [item.name];
    const seen = new Set([item.id]);
    let parent = byId.get(String(item.parent_id));
    while (parent && parent.location_type !== 'county' && !seen.has(parent.id)) {
      parts.push(parent.name); seen.add(parent.id); parent = byId.get(String(parent.parent_id));
    }
    return `${parts.join(', ')} (${item.location_type.replace('_', '-')})`;
  };

  function find(event) {
    event?.preventDefault();
    locationRequest.current += 1;
    setLocating(false);
    setQuery({ ...initialQuery, q: search.trim(), location: location.trim(), ...(areaId || countyId ? { location_id: areaId || countyId } : {}) });
  }
  function nearby() {
    if (!navigator.geolocation) { setStatus('Location is unavailable. Choose a county or enter an area.'); return; }
    const request = ++locationRequest.current;
    setLocating(true);
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      setLocating(false); setLocation(''); setCountyId(''); setAreaId('');
      setQuery({ ...initialQuery, q: search.trim(), lat: String(position.coords.latitude), lng: String(position.coords.longitude), radius });
    }, () => {
      if (request !== locationRequest.current) return;
      setLocating(false); setStatus('Location unavailable. Choose a county or enter an area.');
    }, { enableHighAccuracy: false, timeout: 10000 });
  }
  function changeRadius(value) {
    setRadius(value);
    if (query.lat) setQuery(current => ({ ...current, radius: value, page: '1' }));
  }

  if (!online) return <>
    <header><div className="header-inner"><h1>AgentTrust</h1></div></header>
    <main className="offline-state"><h2>You're offline</h2><p>Reconnect to search agents and see current reviews and verification information.</p><button onClick={() => window.location.reload()}>Try again</button></main>
  </>;
  return <>
    <header><div className="header-inner"><div><h1>AgentTrust</h1><p>Property agents across Kenya</p></div><div className="account-toolbar"><PwaControls /><button className="secondary" onClick={() => setAccountOpen(true)}><UserRound size={18} />Agent account</button></div></div></header>
    <main>
      {accountOpen ? <AccountPanel onExit={() => { setAccountOpen(false); setQuery(current => ({ ...current })); }} /> : <>
      <form className="filters" onSubmit={find}>
        <label className="search-field">Agent or agency<input placeholder="Search by name" value={search} onChange={event => setSearch(event.target.value)} /></label>
        <label>County<select value={countyId} onChange={event => { setCountyId(event.target.value); setAreaId(''); }} disabled={!counties.length}>
          <option value="">All counties</option>{counties.map(county => <option key={county.id} value={county.id}>{county.name}</option>)}
        </select></label>
        <label>Town or area<select value={areaId} onChange={event => setAreaId(event.target.value)} disabled={!areas.length}>
          <option value="">All areas</option>{areas.map(area => <option key={area.id} value={area.id}>{areaLabel(area)}</option>)}
        </select></label>
        <label>Location name<input placeholder="Town or neighborhood" value={location} onChange={event => setLocation(event.target.value)} /></label>
        <button type="submit"><Search size={18} aria-hidden="true" />Search</button>
      </form>
      {locationsError && <p role="status">County filters are unavailable. <button className="text-button" onClick={() => setLocationRetry(value => value + 1)}>Retry</button></p>}
      <div className="nearby-controls">
        <button type="button" className="secondary" onClick={nearby} disabled={locating}><LocateFixed size={18} aria-hidden="true" />{locating ? 'Locating...' : 'Use my location'}</button>
        <label className="radius">Radius<select value={radius} onChange={event => changeRadius(event.target.value)}>{[5, 10, 25, 50, 100].map(km => <option value={km} key={km}>{km} km</option>)}</select></label>
        {query.lat && <span className="nearby-active">Nearby offices<button type="button" className="icon-button" title="Clear nearby filter" aria-label="Clear nearby filter" onClick={() => find()}><X size={16} /></button></span>}
      </div>
      <div className="results-heading"><h2>Property agents</h2><p role="status">{status}</p></div>
      {failed && <button className="secondary" onClick={() => setQuery(current => ({ ...current }))}>Try again</button>}
      <section aria-label="Property agents" aria-busy={loading}>
        <div className="grid">{result.items.map(agent => <AgentCard key={agent.id} agent={agent} />)}</div>
        {!loading && !failed && !result.items.length && <div className="empty-state"><h3>No agents found</h3><p>Try a different county, area, or search name.</p></div>}
      </section>
      {result.total_pages > 1 && <nav className="pagination" aria-label="Results pages">
        <button className="icon-button" title="Previous page" aria-label="Previous page" disabled={loading || result.page <= 1} onClick={() => setQuery(current => ({ ...current, page: String(result.page - 1) }))}><ChevronLeft size={20} /></button>
        <span>Page {result.page} of {result.total_pages}</span>
        <button className="icon-button" title="Next page" aria-label="Next page" disabled={loading || result.page >= result.total_pages} onClick={() => setQuery(current => ({ ...current, page: String(result.page + 1) }))}><ChevronRight size={20} /></button>
      </nav>}
      <section className="sponsored" aria-labelledby="ads-title" aria-busy={loading}>
        <h2 id="ads-title">Sponsored advertisements</h2>
        <div className="grid">{ads?.map(ad => <article className="card" key={ad.id}><small>Sponsored</small><h3>{ad.headline}</h3><p>{ad.description || ''}</p><p className="muted">{ad.agent_name}</p></article>)}</div>
        {!loading && !failed && (ads === null ? <p>Advertisements are unavailable.</p> : !ads.length && <p>No sponsored listings for this area yet.</p>)}
      </section>
      </>}
    </main>
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
