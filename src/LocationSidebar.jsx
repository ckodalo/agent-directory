import { useState } from 'react';
import { ChevronRight, ChevronLeft, LocateFixed, X } from 'lucide-react';

export default function LocationSidebar({ locations, selectedId, onSelect, onClear, nearby, locating, radius, onRadius, error, onRetry, onClose }) {
  const [filter, setFilter] = useState('');
  const byId = new Map(locations.map(place => [String(place.id), place]));
  const selected = byId.get(String(selectedId));
  const path = [], seen = new Set();
  let current = selected;
  while (current && !seen.has(current.id)) { path.unshift(current); seen.add(current.id); current = byId.get(String(current.parent_id)); }
  const children = locations.filter(place => selected ? String(place.parent_id) === String(selected.id) : place.location_type === 'county')
    .sort((a, b) => a.name.localeCompare(b.name));
  const choose = id => { setFilter(''); onSelect(String(id)); };
  return <aside id="discovery-filters" className="location-sidebar" aria-label="Location filters">
    <div className="sidebar-heading"><h2>Location</h2><button className="icon-button mobile-filter-close" title="Close filters" aria-label="Close filters" onClick={onClose}><X size={18} /></button></div>
    <nav className="location-path" aria-label="Selected location"><button className="text-button" onClick={() => { setFilter(''); onClear(); }}>All Kenya</button>{path.map(place => <span key={place.id}><ChevronRight size={12} /><button className="text-button" aria-current={place.id === selected?.id ? 'location' : undefined} onClick={() => choose(place.id)}>{place.name}</button></span>)}</nav>
    {selected && <button className="sidebar-back" onClick={() => selected.parent_id ? choose(selected.parent_id) : onClear()}><ChevronLeft size={16} />{selected.parent_id ? 'Back to parent area' : 'All counties'}</button>}
    {children.length > 0 ? <><input aria-label="Find a location" placeholder={selected ? 'Find an area' : 'Find a county'} value={filter} onChange={event => setFilter(event.target.value)} />
      <ul className="location-options">{children.filter(place => place.name.toLowerCase().includes(filter.toLowerCase())).map(place => <li key={place.id}><button onClick={() => choose(place.id)}><span>{place.name}<small>{place.location_type.replace('_', '-')}</small></span><ChevronRight size={15} /></button></li>)}</ul>
      {!children.some(place => place.name.toLowerCase().includes(filter.toLowerCase())) && <p className="muted">No matching areas.</p>}
    </> : !error && <p className="muted">{selected ? 'No more detailed areas listed yet.' : 'Loading locations...'}</p>}
    {error && <p role="status">Locations unavailable. <button className="text-button" onClick={onRetry}>Retry</button></p>}
    <div className="sidebar-nearby"><h3>Nearby offices</h3><button className="secondary" disabled={locating} onClick={nearby}><LocateFixed size={16} />{locating ? 'Locating...' : 'Use my location'}</button><label>Distance<select aria-label="Distance" value={radius} onChange={event => onRadius(event.target.value)}>{[5, 10, 25, 50, 100].map(km => <option key={km} value={km}>{km} km</option>)}</select></label></div>
    <button className="secondary mobile-filter-close" onClick={onClose}>Show agents</button>
  </aside>;
}
