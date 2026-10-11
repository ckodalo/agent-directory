import test from 'node:test';
import assert from 'node:assert/strict';
import { parseDiscoveryQuery } from '../discovery-query.js';

test('discovery defaults and structured pagination', () => {
  assert.deepEqual(parseDiscoveryQuery({}), { q: '', location: '', locationId: null, latitude: null, longitude: null, radius: 25, page: 1, pageSize: 20 });
  assert.equal(parseDiscoveryQuery({ location_id: '47', page: '2', page_size: '12' }).locationId, 47);
  assert.equal(parseDiscoveryQuery({ lat: '0', lng: '0' }).latitude, 0);
});

test('invalid pagination, duplicate filters and partial coordinates are rejected', () => {
  for (const input of [{ page: '0' }, { page: '1.5' }, { page_size: '101' }, { page: '100001' },
    { location_id: '-1' }, { location_id: 'no' }, { q: ['a', 'b'] }, { lat: '1' }, { lng: '1' },
    { lat: '91', lng: '0' }, { lat: '0', lng: '181' }, { lat: 'NaN', lng: '0' }, { radius: '' }, { radius: '501' }]) {
    assert.throws(() => parseDiscoveryQuery(input), JSON.stringify(input));
  }
});
