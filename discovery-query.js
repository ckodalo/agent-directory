export function parseDiscoveryQuery(input) {
  const scalar = (key, fallback = '') => {
    const value = input[key] ?? fallback;
    if (typeof value !== 'string') throw new Error(`Invalid ${key}`);
    return value.trim();
  };
  const integer = (key, fallback, max) => {
    const value = scalar(key, fallback);
    if (!/^\d+$/.test(value) || !Number.isSafeInteger(Number(value)) || Number(value) < 1 || Number(value) > max) throw new Error(`Invalid ${key}`);
    return Number(value);
  };
  const lat = scalar('lat'), lng = scalar('lng');
  if (Boolean(lat) !== Boolean(lng)) throw new Error('Provide both latitude and longitude');
  const latitude = lat ? Number(lat) : null, longitude = lng ? Number(lng) : null;
  if ((lat && (!Number.isFinite(latitude) || Math.abs(latitude) > 90)) ||
      (lng && (!Number.isFinite(longitude) || Math.abs(longitude) > 180))) throw new Error('Invalid coordinates');
  const radius = Number(scalar('radius', '25'));
  if (!Number.isFinite(radius) || radius <= 0 || radius > 500) throw new Error('Invalid radius');
  return {
    q: scalar('q').slice(0, 80), location: scalar('location').slice(0, 80),
    locationId: scalar('location_id') ? integer('location_id', '', 2147483647) : null,
    latitude, longitude, radius,
    page: integer('page', '1', 100000), pageSize: integer('page_size', '20', 100)
  };
}
