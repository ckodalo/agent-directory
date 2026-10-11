import React, { useEffect, useRef, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Search, ChevronLeft, ChevronRight, X, Phone, MapPin, MessageCircle, UserRound, House, BadgeCheck, Star, SlidersHorizontal } from 'lucide-react';
import '@fontsource/inter/latin-400.css';
import '@fontsource/inter/latin-500.css';
import '@fontsource/inter/latin-600.css';
import '@fontsource/inter/latin-700.css';
import './marketplace.css';
import PwaControls from './PwaControls.jsx';
import AccountPanel from './AccountPanel.jsx';
import LocationSidebar from './LocationSidebar.jsx';

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

function AgentCard({ agent, selectedLocation, locations }) {
  const [showReviews, setShowReviews] = useState(false);
  const direct = selectedLocation && agent.service_areas.some(area => String(area.id) === String(selectedLocation));
  const ancestors = new Set();
  let parent = locations.find(place => String(place.id) === String(selectedLocation));
  while (parent?.parent_id && !ancestors.has(String(parent.parent_id))) { ancestors.add(String(parent.parent_id)); parent = locations.find(place => String(place.id) === String(parent.parent_id)); }
  const broad = !direct && agent.service_areas.some(area => ancestors.has(String(area.id)));
  return <article className="card agent-card">
    <div className="agent-identity"><div className="avatar" aria-hidden="true"><UserRound size={26} /></div><div className="identity-copy"><h3>{agent.name}</h3><p className="muted">{agent.agency_name || 'Independent agent'}</p></div></div>
    <span className={`tag ${agent.verification_status === 'verified' ? 'verified' : ''}`}>{agent.verification_status === 'verified' && <BadgeCheck size={14} />}{agent.verification_status === 'verified' ? 'Identity verified' : 'Not verified'}</span>
    <p className="rating"><Star size={14} aria-hidden="true" />{agent.review_count > 0 ? `${agent.average_rating} / 5 (${agent.review_count} reviews)` : 'No reviews yet'}</p>
    <p className="service-areas"><MapPin size={16} aria-hidden="true" /><span>{agent.service_areas.length
      ? agent.service_areas.map(area => area.location_type === 'county' ? `${area.name} County` : `${area.name}, ${area.county}`).join('; ')
      : 'Service areas not listed'}</span></p>
    {agent.distance_km != null && <p className="muted">Office {Number(agent.distance_km).toFixed(1)} km away</p>}
    {selectedLocation && <p className="coverage-label">{direct ? 'Lists this area' : broad ? 'Serves a wider area' : 'Lists areas within this location'}</p>}
    <div className="contacts">
      {agent.phone && <a href={`tel:${safePhone(agent.phone)}`}><Phone size={16} aria-hidden="true" />Call</a>}
      {agent.whatsapp && <a rel="noopener noreferrer" target="_blank" href={`https://wa.me/${safePhone(agent.whatsapp).replace(/\+/g, '')}`}><MessageCircle size={16} aria-hidden="true" />WhatsApp</a>}
    </div>
    <details onToggle={event => setShowReviews(event.currentTarget.open)}>
      <summary>Profile details</summary><p>{agent.bio || 'No biography available'}</p>{showReviews && <ApprovedReviews id={agent.id} />}
    </details>
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
  const [filtersOpen, setFiltersOpen] = useState(false);
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
  const byId = new Map(locations.map(item => [String(item.id), item]));

  function find(event) {
    event?.preventDefault();
    locationRequest.current += 1;
    setLocating(false);
    setQuery({ ...initialQuery, q: search.trim(), ...(query.location_id ? { location_id: query.location_id }
      : query.lat ? { lat: query.lat, lng: query.lng, radius } : {}) });
    setFiltersOpen(false);
  }
  function nearby() {
    if (!navigator.geolocation) { setStatus('Location is unavailable. Choose a county or enter an area.'); return; }
    const request = ++locationRequest.current;
    setLocating(true);
    setStatus('Finding your location...');
    navigator.geolocation.getCurrentPosition(position => {
      if (request !== locationRequest.current) return;
      setLocating(false); setFiltersOpen(false);
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
  function clearLocation() {
    locationRequest.current += 1;
    setLocating(false);
    setQuery(current => ({ ...initialQuery, q: current.q }));
  }
  function selectLocation(id) {
    locationRequest.current += 1; setLocating(false);
    setQuery(current => ({ ...initialQuery, q: current.q, location_id: id }));
  }

  if (!online) return <>
    <header><div className="header-inner"><h1>AgentTrust</h1></div></header>
    <main className="offline-state"><h2>You're offline</h2><p>Reconnect to search agents and see current reviews and verification information.</p><button onClick={() => window.location.reload()}>Try again</button></main>
  </>;
  return <>
    <header><div className="header-inner"><button className="brand" onClick={() => setAccountOpen(false)} aria-label="AgentTrust directory"><House size={24} /><span>AgentTrust</span></button><span className="header-location"><MapPin size={14} />Kenya</span><div className="account-toolbar"><PwaControls /><button className="secondary" onClick={() => setAccountOpen(true)}><UserRound size={18} />Agent account</button></div></div></header>
    <main>
      {accountOpen ? <AccountPanel onExit={() => { setAccountOpen(false); setQuery(current => ({ ...current })); }} /> : <>
      <form className="discovery-search" role="search" onSubmit={find}>
        <div className="unified-search"><Search size={20} aria-hidden="true" />
          <input aria-label="Search agents, agencies or places" placeholder="Search agents, agencies or places" value={search} maxLength={80} onChange={event => setSearch(event.target.value)} />
          {search && <button type="button" className="icon-button clear-search" title="Clear search" aria-label="Clear search" onClick={() => { setSearch(''); setQuery(current => ({ ...current, q: '', page: '1' })); }}><X size={16} /></button>}
          <button type="submit" className="icon-button" title="Search" aria-label="Search"><ChevronRight size={20} /></button>
        </div>
        <button type="button" className="secondary filter-toggle" aria-expanded={filtersOpen} aria-controls="discovery-filters" onClick={() => setFiltersOpen(value => !value)}><SlidersHorizontal size={18} />Filters{(query.location_id || query.lat) && <span className="filter-dot" />}</button>
      </form>
      <div className={`directory-layout ${filtersOpen ? 'filters-open' : ''}`}>
      <LocationSidebar locations={locations} selectedId={query.location_id} onSelect={selectLocation} onClear={clearLocation} nearby={nearby} locating={locating} radius={radius} onRadius={changeRadius} error={locationsError} onRetry={() => setLocationRetry(value => value + 1)} onClose={() => setFiltersOpen(false)} />
      <div className="directory-results">
      {(query.location_id || query.lat) && <div className="active-filters"><span>{query.lat ? `Nearby offices · ${query.radius} km` : byId.get(String(query.location_id))?.name || 'Selected area'}</span><button type="button" className="icon-button" title="Remove location filter" aria-label="Remove location filter" onClick={clearLocation}><X size={16} /></button></div>}
      <div className="results-heading"><h2>Property agents</h2><p role="status">{status}</p></div>
      {failed && <button className="secondary" onClick={() => setQuery(current => ({ ...current }))}>Try again</button>}
      <section aria-label="Property agents" aria-busy={loading}>
        <div className="grid">{result.items.map(agent => <AgentCard key={agent.id} agent={agent} selectedLocation={query.location_id} locations={locations} />)}</div>
        {!loading && !failed && !result.items.length && <div className="empty-state"><h3>No agents found</h3><p>Try a different county, area, or search name.</p></div>}
      </section>
      {result.total_pages > 1 && <nav className="pagination" aria-label="Results pages">
        <button className="icon-button" title="Previous page" aria-label="Previous page" disabled={loading || result.page <= 1} onClick={() => setQuery(current => ({ ...current, page: String(result.page - 1) }))}><ChevronLeft size={20} /></button>
        <span>Page {result.page} of {result.total_pages}</span>
        <button className="icon-button" title="Next page" aria-label="Next page" disabled={loading || result.page >= result.total_pages} onClick={() => setQuery(current => ({ ...current, page: String(result.page + 1) }))}><ChevronRight size={20} /></button>
      </nav>}
      {!!ads?.length && <section className="sponsored" aria-labelledby="ads-title" aria-busy={loading}>
        <h2 id="ads-title">Sponsored advertisements</h2>
        <div className="grid">{ads?.map(ad => <article className="card" key={ad.id}><small>Sponsored</small><h3>{ad.headline}</h3><p>{ad.description || ''}</p><p className="muted">{ad.agent_name}</p></article>)}</div>
        {!loading && !failed && (ads === null ? <p>Advertisements are unavailable.</p> : !ads.length && <p>No sponsored listings for this area yet.</p>)}
      </section>}
      </div></div>
      </>}
    </main>
  </>;
}

createRoot(document.getElementById('root')).render(<React.StrictMode><App /></React.StrictMode>);
