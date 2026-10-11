import { useState } from 'react';
import { Plus } from 'lucide-react';

export default function LocationManager({ places, request, operation, busy, onAdded }) {
  const [parentId, setParentId] = useState('');
  const levels = ['county', 'sub_county', 'town', 'neighborhood'];
  const parent = places.find(place => String(place.id) === parentId);
  function path(place) {
    const names = [place.name], seen = new Set([place.id]);
    let next = places.find(item => item.id === place.parent_id);
    while (next && !seen.has(next.id)) { names.unshift(next.name); seen.add(next.id); next = places.find(item => item.id === next.parent_id); }
    return names.join(' / ');
  }
  async function add(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));
    await operation(async () => {
      const created = await request('/moderation/locations', 'POST', { ...data, parent_id: Number(parentId), confirmed: data.confirmed === 'on' });
      onAdded(created); form.reset(); setParentId('');
    });
  }
  return <section className="location-manager"><h3>Add location</h3><form className="profile-form" onSubmit={add}>
    <label className="full-width">Parent location<select aria-label="Parent location" required value={parentId} onChange={event => setParentId(event.target.value)}><option value="">Choose parent</option>{places.filter(place => place.location_type !== 'neighborhood').sort((a, b) => path(a).localeCompare(path(b))).map(place => <option key={place.id} value={place.id}>{path(place)} ({place.location_type.replace('_', '-')})</option>)}</select></label>
    <label>Name<input name="name" required maxLength={120} /></label>
    <label>Type<select name="location_type" required disabled={!parent} key={parentId}>{levels.filter((type, index) => index > levels.indexOf(parent?.location_type)).map(type => <option key={type} value={type}>{type.replace('_', '-')}</option>)}</select></label>
    <label className="full-width">Source URL<input name="source_url" type="url" required maxLength={1000} /></label>
    <label className="checkbox-label full-width"><input type="checkbox" name="confirmed" required />I checked the location name and parent relationship against this source.</label>
    <div className="full-width"><button disabled={busy || !parent} type="submit"><Plus size={16} />Add location</button></div>
  </form></section>;
}
