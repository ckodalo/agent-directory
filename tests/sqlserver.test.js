import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { query, close, dialect } from '../database.js';
import * as directory from '../directory.js';

test('SQL Server directory filtering, ratings, nearby search, and advertisements', async () => {
  assert.equal(dialect, 'sqlserver', 'Run this integration test with DB_CLIENT=sqlserver');
  const name = `Integration ${randomUUID()}`;
  const ids = [];
  const locationIds = [];
  try {
    const [{ id }] = await query(`INSERT INTO agents(name,agency_name,is_published,latitude,longitude)
      OUTPUT INSERTED.id VALUES (@name,'Test agency',1,-1.2921,36.7820)`, { name });
    ids.push(Number(id));
    const [{ id: hidden }] = await query(`INSERT INTO agents(name,is_published)
      OUTPUT INSERTED.id VALUES (@name,0)`, { name });
    ids.push(Number(hidden));
    await query(`INSERT INTO agent_service_areas(agent_id,location_id)
      SELECT @id,id FROM locations WHERE name='Kilimani' AND county='Nairobi'`, { id: Number(id) });
    await query(`INSERT INTO reviews(agent_id,rating,comment,moderation_status)
      VALUES (@id,4,'Approved','approved'),(@id,5,'Approved','approved'),(@id,1,'Pending','pending')`, { id: Number(id) });
    await query(`INSERT INTO advertisements(agent_id,headline,status,starts_at,ends_at)
      VALUES (@id,@name,'approved',DATEADD(day,-1,GETDATE()),DATEADD(day,1,GETDATE())),
      (@id,@name,'pending',DATEADD(day,-1,GETDATE()),DATEADD(day,1,GETDATE())),
      (@id,@name,'approved',DATEADD(day,-2,GETDATE()),DATEADD(day,-1,GETDATE())),
      (@hidden,@name,'approved',DATEADD(day,-1,GETDATE()),DATEADD(day,1,GETDATE()))`, { id: Number(id), hidden: Number(hidden), name });
    const base = { q: name, location: '', latitude: null, longitude: null, radius: 25 };
    const rows = await directory.agents(base);
    assert.equal(rows.length, 1);
    assert.equal(Number(rows[0].id), Number(id));
    assert.equal(Number(rows[0].average_rating), 4.5);
    assert.equal(Number(rows[0].review_count), 2);
    assert.equal((await directory.agents({ ...base, location: 'Kilimani' })).length, 1);
    assert.equal((await directory.agents({ ...base, location: 'Missing location' })).length, 0);
    const nearby = await directory.agents({ ...base, latitude: -1.2921, longitude: 36.782, radius: 1 });
    assert.equal(nearby.length, 1);
    assert.ok(Number(nearby[0].distance_km) < 0.01);
    assert.equal((await directory.agents({ ...base, latitude: 0, longitude: 0, radius: 1 })).length, 0);
    assert.equal((await directory.agents({ ...base, q: `${name}' OR 1=1 --` })).length, 0);
    assert.equal((await directory.reviews(Number(id))).length, 2);
    const ads = (await directory.advertisements('Nairobi')).filter(ad => ad.headline === name);
    assert.equal(ads.length, 1);
    assert.equal(ads[0].agent_name, name);
    const places = await directory.locations();
    const counties = places.filter(place => place.location_type === 'county');
    assert.equal(counties.length, 47);
    assert.equal(new Set(counties.map(county => county.county_code)).size, 47);
    const nairobi = counties.find(county => county.county_code === '47');
    const mombasa = counties.find(county => county.county_code === '01');
    const kilimani = places.find(place => place.name === 'Kilimani');
    const westlands = places.find(place => place.name === 'Westlands');
    assert.equal(kilimani.parent_id, nairobi.id);

    const [{ id: broadId }] = await query(`INSERT INTO agents(name,is_published,latitude,longitude)
      OUTPUT INSERTED.id VALUES (@name,1,-4.0435,39.6682)`, { name: `${name} county-wide` });
    ids.push(Number(broadId));
    await query('INSERT INTO agent_service_areas(agent_id,location_id) VALUES (@id,@county)', { id: Number(broadId), county: nairobi.id });
    const countySearch = await directory.searchAgents({ ...base, locationId: nairobi.id, pageSize: 1 });
    assert.equal(countySearch.total, 2);
    assert.equal(countySearch.total_pages, 2);
    const secondPage = await directory.searchAgents({ ...base, locationId: nairobi.id, pageSize: 1, page: 2 });
    assert.notEqual(countySearch.items[0].id, secondPage.items[0].id);
    assert.ok(countySearch.items[0].service_areas.length);
    const areaSearch = await directory.searchAgents({ ...base, locationId: kilimani.id });
    assert.equal(areaSearch.total, 2, 'county-wide service includes its neighborhoods');
    assert.equal(areaSearch.items.find(agent => agent.id === Number(broadId)).average_rating, null);
    const siblingSearch = await directory.searchAgents({ ...base, locationId: westlands.id });
    assert.deepEqual(siblingSearch.items.map(agent => agent.id), [Number(broadId)]);
    assert.equal((await directory.searchAgents({ ...base, locationId: mombasa.id })).total, 0, 'office location does not define service areas');
    assert.equal((await directory.searchAgents({ ...base, locationId: 2147483647 })).total, 0);
    assert.equal((await directory.searchAgents({ ...base, page: 100 })).items.length, 0);
    await query(`INSERT INTO reviews(agent_id,rating,comment,moderation_status) VALUES (@id,5,'Hidden profile','approved')`, { id: Number(hidden) });
    assert.deepEqual(await directory.reviews(Number(hidden)), []);

    const targetedAds = [];
    for (const [label, target] of [['county', nairobi.id], ['area', kilimani.id], ['other county', mombasa.id], ['sibling', westlands.id]]) {
      const [{ id: adId }] = await query(`INSERT INTO advertisements(agent_id,headline,status,starts_at,ends_at)
        OUTPUT INSERTED.id VALUES (@id,@headline,'approved',DATEADD(day,-1,GETDATE()),DATEADD(day,1,GETDATE()))`, { id: Number(id), headline: `${name} ${label}` });
      targetedAds.push({ id: Number(adId), label });
      await query('INSERT INTO advertisement_locations(advertisement_id,location_id) VALUES (@ad,@location)', { ad: Number(adId), location: target });
    }
    const labels = rows => targetedAds.filter(ad => rows.some(row => row.id === ad.id)).map(ad => ad.label).sort();
    assert.deepEqual(labels(await directory.advertisements({ locationId: nairobi.id })), ['area', 'county', 'sibling']);
    assert.deepEqual(labels(await directory.advertisements({ locationId: kilimani.id })), ['area', 'county']);
    assert.deepEqual(labels(await directory.advertisements({ latitude: -1.2921, longitude: 36.782, radius: 1 })), ['area', 'county']);
    assert.deepEqual(labels(await directory.advertisements({ latitude: 0, longitude: 0, radius: 1 })), []);
    let parentId = nairobi.id;
    for (const type of ['sub_county', 'town', 'neighborhood']) {
      const [{ id: areaId }] = await query(`INSERT INTO locations(name,county,location_type,parent_id)
        OUTPUT INSERTED.id VALUES (@name,'Nairobi',@type,@parent)`, { name: `${name} ${type}`, type, parent: parentId });
      parentId = Number(areaId);
      locationIds.push(parentId);
    }
    await query('INSERT INTO agent_service_areas(agent_id,location_id) VALUES (@id,@location)', { id: Number(id), location: parentId });
    for (const locationId of locationIds) {
      assert.equal((await directory.searchAgents({ ...base, locationId })).total, 2, 'nested areas match descendants and county-wide agents');
    }
  } finally {
    try {
      for (const id of ids) await query('DELETE FROM agents WHERE id=@id', { id });
      for (const id of locationIds.reverse()) await query('DELETE FROM locations WHERE id=@id', { id });
    } finally { await close(); }
  }
});
