import { dialect, parameter as p, query } from './database.js';

const top = limit => dialect === 'sqlserver' ? `TOP (${limit}) ` : '';
const tail = limit => dialect === 'mysql' ? ` LIMIT ${limit}` : '';
const withKeyword = dialect === 'mysql' ? 'WITH RECURSIVE' : 'WITH';
const numericFields = ['id', 'parent_id', 'agent_id', 'latitude', 'longitude', 'average_rating', 'review_count', 'distance_km', 'rating'];
function normalize(rows) {
  return rows.map(row => {
    const result = { ...row };
    for (const field of numericFields) if (result[field] != null) result[field] = Number(result[field]);
    return result;
  });
}

export async function locations() {
  return normalize(await query('SELECT id,name,county,location_type,parent_id,county_code,latitude,longitude FROM locations ORDER BY county,name,id'));
}

function distance(alias) {
  const cosine = `COS(RADIANS(CAST(${p('latitude')} AS FLOAT)))*COS(RADIANS(${alias}.latitude))*COS(RADIANS(${alias}.longitude)-RADIANS(CAST(${p('longitude')} AS FLOAT)))+SIN(RADIANS(CAST(${p('latitude')} AS FLOAT)))*SIN(RADIANS(${alias}.latitude))`;
  return `6371 * ACOS(CASE WHEN (${cosine})>1 THEN 1 WHEN (${cosine})<(-1) THEN -1 ELSE (${cosine}) END)`;
}

function locationScope(locationId, parameters) {
  if (!locationId) return '';
  parameters.locationId = locationId;
  // Depth bounds protect discovery from a malformed hierarchy or accidental cycles.
  return `${withKeyword} descendants AS (
    SELECT id,parent_id,0 AS depth FROM locations WHERE id=${p('locationId')}
    UNION ALL SELECT l.id,l.parent_id,d.depth+1 FROM locations l JOIN descendants d ON l.parent_id=d.id WHERE d.depth<8
  ), ancestors AS (
    SELECT id,parent_id,0 AS depth FROM locations WHERE id=${p('locationId')}
    UNION ALL SELECT l.id,l.parent_id,a.depth+1 FROM locations l JOIN ancestors a ON l.id=a.parent_id WHERE a.depth<8
  ), location_scope AS (SELECT id FROM descendants UNION SELECT id FROM ancestors)`;
}

export async function searchAgents({ q = '', location = '', locationId = null, latitude = null, longitude = null, radius = 25, page = 1, pageSize = 20 }) {
  const parameters = {};
  const scope = locationScope(locationId, parameters);
  let where = 'a.is_published=1';
  if (q) {
    where += ` AND (a.name LIKE ${p('q')} OR a.agency_name LIKE ${p('q')}
      OR EXISTS (SELECT 1 FROM agent_service_areas search_area JOIN locations search_location ON search_location.id=search_area.location_id
        WHERE search_area.agent_id=a.id AND (search_location.name LIKE ${p('q')} OR search_location.county LIKE ${p('q')})))`;
    parameters.q = `%${q}%`;
  }
  if (locationId) where += ' AND EXISTS (SELECT 1 FROM agent_service_areas asa JOIN location_scope s ON s.id=asa.location_id WHERE asa.agent_id=a.id)';
  if (location) {
    where += ` AND EXISTS (SELECT 1 FROM agent_service_areas asa JOIN locations loc ON loc.id=asa.location_id WHERE asa.agent_id=a.id AND (loc.name LIKE ${p('location')} OR loc.county LIKE ${p('location')}))`;
    parameters.location = `%${location}%`;
  }
  const nearby = latitude !== null && longitude !== null;
  if (nearby) Object.assign(parameters, { latitude, longitude, radius });
  const source = `FROM (
    SELECT a.id,a.name,a.agency_name,a.phone,a.whatsapp,a.bio,a.verification_status,a.latitude,a.longitude,
      ROUND(r.average_rating,1) AS average_rating,COALESCE(r.review_count,0) AS review_count,
      ${nearby ? distance('a') : 'NULL'} AS distance_km
    FROM agents a LEFT JOIN (
      SELECT agent_id,AVG(CAST(rating AS FLOAT)) AS average_rating,COUNT(*) AS review_count
      FROM reviews WHERE moderation_status='approved' GROUP BY agent_id
    ) r ON r.agent_id=a.id WHERE ${where}
  ) results ${nearby ? `WHERE distance_km<=${p('radius')}` : ''}`;
  const [count] = await query(`${scope} SELECT COUNT(*) AS total ${source}`, parameters);
  const total = Number(count.total);
  Object.assign(parameters, { offset: (page - 1) * pageSize, pageSize });
  const pagination = dialect === 'mysql' ? `LIMIT ${p('pageSize')} OFFSET ${p('offset')}` : `OFFSET ${p('offset')} ROWS FETCH NEXT ${p('pageSize')} ROWS ONLY`;
  const items = normalize(await query(`${scope} SELECT * ${source}
    ORDER BY ${nearby ? 'distance_km,' : ''}CASE WHEN verification_status='verified' THEN 1 ELSE 0 END DESC,
      average_rating DESC,review_count DESC,id ${pagination}`, parameters));
  for (const item of items) item.service_areas = [];
  if (items.length) {
    const bindings = Object.fromEntries(items.map((item, index) => [`agent${index}`, item.id]));
    const ids = items.map((_, index) => p(`agent${index}`)).join(',');
    const areas = normalize(await query(`SELECT asa.agent_id,l.id,l.name,l.county,l.location_type,l.parent_id
      FROM agent_service_areas asa JOIN locations l ON l.id=asa.location_id WHERE asa.agent_id IN (${ids}) ORDER BY l.county,l.name,l.id`, bindings));
    const byAgent = new Map(items.map(item => [item.id, item]));
    for (const area of areas) byAgent.get(area.agent_id).service_areas.push(area);
  }
  return { items, total, page, page_size: pageSize, total_pages: Math.ceil(total / pageSize) };
}

// Preserve the original array response for existing API callers without page parameters.
export async function agents(options) {
  return (await searchAgents({ ...options, pageSize: options.pageSize || 100 })).items;
}

export async function reviews(id) {
  return normalize(await query(`SELECT ${top(50)}r.rating,r.comment,r.created_at FROM reviews r JOIN agents a ON a.id=r.agent_id
    WHERE r.agent_id=${p('id')} AND a.is_published=1 AND r.moderation_status='approved'
    ORDER BY r.created_at DESC,r.id DESC${tail(50)}`, { id }));
}

export async function advertisements(options) {
  const { location = '', locationId = null, latitude = null, longitude = null, radius = 25 } = typeof options === 'string' ? { location: options } : options;
  const parameters = { location, match: `%${location}%` };
  let scope = locationScope(locationId, parameters);
  const nearby = latitude !== null && longitude !== null;
  if (nearby && !locationId) {
    Object.assign(parameters, { latitude, longitude, radius });
    // Resolve only known nearby location points; never infer county coverage from an agent's office.
    scope = `${withKeyword} nearby_points AS (SELECT id,parent_id FROM locations l WHERE ${distance('l')}<=${p('radius')}),
      ancestors AS (SELECT id,parent_id,0 AS depth FROM nearby_points UNION ALL
        SELECT l.id,l.parent_id,a.depth+1 FROM locations l JOIN ancestors a ON l.id=a.parent_id WHERE a.depth<8),
      location_scope AS (SELECT DISTINCT id FROM ancestors)`;
  }
  const now = dialect === 'sqlserver' ? 'GETDATE()' : 'NOW()';
  return normalize(await query(`${scope} SELECT ${top(10)}ad.id,ad.headline,ad.description,ad.image_url,ad.target_url,a.name AS agent_name
    FROM advertisements ad JOIN agents a ON a.id=ad.agent_id
    WHERE ad.status='approved' AND a.is_published=1 AND ${now} BETWEEN ad.starts_at AND ad.ends_at
      AND (NOT EXISTS (SELECT 1 FROM advertisement_locations al WHERE al.advertisement_id=ad.id)
        OR EXISTS (SELECT 1 FROM advertisement_locations al JOIN locations l ON l.id=al.location_id
          WHERE al.advertisement_id=ad.id
          ${scope ? 'AND l.id IN (SELECT id FROM location_scope)' : ''}
          AND (${p('location')}='' OR l.name LIKE ${p('match')} OR l.county LIKE ${p('match')})))
    ORDER BY ad.created_at DESC,ad.id DESC${tail(10)}`, parameters));
}
