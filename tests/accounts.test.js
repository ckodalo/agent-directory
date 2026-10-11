import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { randomUUID } from 'node:crypto';
import { accounts } from '../accounts.js';
import { query, close, parameter as p } from '../database.js';
import { searchAgents } from '../directory.js';

test('onboarding enforces sessions, CSRF, ownership, approval and session revocation', async () => {
  const app = express(); app.use(express.json()); app.use('/api', accounts);
  const server = await new Promise(resolve => { const active = app.listen(0, '127.0.0.1', () => resolve(active)); });
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const users = [];
  const locationIds = [];
  const name = `Integration onboarding ${randomUUID()}`;
  const password = 'Test-only-password-2026!';
  function client() {
    let cookie = '', csrf = '';
    return { async request(path, method = 'GET', body, token = csrf) {
      const response = await fetch(base + path, { method, headers: {
        'Content-Type': 'application/json', Cookie: cookie, 'X-CSRF-Token': token
      }, ...(body ? { body: JSON.stringify(body) } : {}) });
      const nextCookie = response.headers.get('set-cookie');
      if (nextCookie) cookie = nextCookie.split(';')[0];
      const data = await response.json();
      if (data.csrfToken) csrf = data.csrfToken;
      return { status: response.status, data, cookie: nextCookie };
    } };
  }
  const agent = client(), other = client(), moderator = client();
  async function register(connection, suffix) {
    const session = await connection.request('/auth/session');
    const result = await connection.request('/auth/register', 'POST', {
      name: `${name} ${suffix}`, email: `${randomUUID()}@example.test`, password, role: 'moderator'
    });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    assert.match(result.cookie, /HttpOnly/); assert.match(result.cookie, /SameSite=Lax/i);
    assert.equal(result.data.user.role, 'agent');
    users.push(result.data.user.id);
    return result.data.user;
  }
  try {
    assert.equal((await agent.request('/account/profile')).status, 401);
    await agent.request('/auth/session');
    assert.equal((await agent.request('/auth/register', 'POST', { name, email: 'a@example.test', password }, '')).status, 403);
    const owner = await register(agent, 'owner');
    assert.equal((await agent.request('/auth/register', 'POST', { name, email: owner.email, password })).status, 409);
    const original = (await agent.request('/account/profile')).data;
    assert.equal(original.profile_status, 'draft');
    assert.equal((await agent.request('/moderation/profiles')).status, 403);
    assert.equal((await agent.request('/moderation/locations', 'POST', {})).status, 403);
    const [{ id: county }] = await query("SELECT id FROM locations WHERE county_code='47'");
    const edit = { ...original, phone: '+254710000000', service_area_ids: [Number(county)], verification_status: 'verified', is_published: 1 };
    const saved = await agent.request('/account/profile', 'PUT', edit);
    assert.equal(saved.status, 200, JSON.stringify(saved.data));
    assert.equal(saved.data.verification_status, 'unverified');
    assert.equal((await agent.request('/account/profile', 'PUT', edit)).status, 409, 'stale edits rejected');
    assert.equal((await searchAgents({ q: name })).total, 0);
    const invalidAreas = await agent.request('/account/profile', 'PUT', { ...saved.data, service_area_ids: [2147483647] });
    assert.equal(invalidAreas.status, 400);
    assert.equal((await agent.request('/account/profile')).data.profile_version, saved.data.profile_version, 'failed save rolls back');
    const stranger = await register(other, 'other');
    assert.equal((await other.request('/account/profile', 'PUT', { ...saved.data, owner_id: owner.id })).status, 409, 'foreign profile version cannot overwrite owner');
    const otherProfile = (await other.request('/account/profile')).data;
    const ownEdit = await other.request('/account/profile', 'PUT', { ...otherProfile, id: original.id, owner_id: owner.id, name: `${name} stranger edited` });
    assert.equal(ownEdit.status, 200); assert.equal(ownEdit.data.id, otherProfile.id, 'client IDs never select another owner profile');
    assert.equal((await agent.request('/account/profile')).data.name, original.name);
    const submitted = await agent.request('/account/profile/submit', 'POST', { profile_version: saved.data.profile_version });
    assert.equal(submitted.status, 200);
    assert.equal(submitted.data.profile_status, 'pending');
    assert.equal((await agent.request(`/moderation/profiles/${original.id}`, 'POST', { action: 'approve', profile_version: submitted.data.profile_version })).status, 403);
    const mod = await register(moderator, 'moderator');
    await query(`UPDATE users SET role='moderator' WHERE id=${p('id')}`, { id: mod.id });
    const locationInput = { name: `${name} location`, parent_id: Number(county), location_type: 'sub_county', source_url: 'https://example.test/location-evidence', confirmed: true };
    assert.equal((await moderator.request('/moderation/locations', 'POST', { ...locationInput, confirmed: false })).status, 400);
    assert.equal((await moderator.request('/moderation/locations', 'POST', { ...locationInput, source_url: 'javascript:alert(1)' })).status, 400);
    assert.equal((await moderator.request('/moderation/locations', 'POST', locationInput, '')).status, 403);
    const added = await moderator.request('/moderation/locations', 'POST', locationInput);
    assert.equal(added.status, 201, JSON.stringify(added.data)); locationIds.push(added.data.id);
    assert.equal(added.data.county, 'Nairobi');
    assert.equal((await moderator.request('/moderation/locations', 'POST', locationInput)).status, 409);
    assert.equal((await moderator.request('/moderation/locations', 'POST', { ...locationInput, parent_id: added.data.id })).status, 400);
    const evidence = await query(`SELECT created_by,source_url FROM location_evidence WHERE location_id=${p('id')}`, { id: added.data.id });
    assert.equal(evidence[0].created_by, mod.id);
    const queue = await moderator.request('/moderation/profiles');
    assert.equal(queue.status, 200); assert.ok(queue.data.some(item => item.id === original.id));
    const rejected = await moderator.request(`/moderation/profiles/${original.id}`, 'POST', { action: 'reject', profile_version: submitted.data.profile_version, reason: 'Integration feedback' });
    assert.equal(rejected.status, 200);
    const returned = (await agent.request('/account/profile')).data;
    assert.equal(returned.profile_status, 'rejected'); assert.equal(returned.rejection_reason, 'Integration feedback');
    const resubmitted = await agent.request('/account/profile/submit', 'POST', { profile_version: returned.profile_version });
    assert.equal(resubmitted.status, 200);
    assert.equal((await moderator.request(`/moderation/profiles/${original.id}`, 'POST', { action: 'approve', profile_version: returned.profile_version })).status, 409);
    const approved = await moderator.request(`/moderation/profiles/${original.id}`, 'POST', { action: 'approve', profile_version: resubmitted.data.profile_version });
    assert.equal(approved.status, 200, JSON.stringify(approved.data));
    const publicProfile = await searchAgents({ q: `${name} owner` });
    assert.equal(publicProfile.total, 1); assert.equal(publicProfile.items[0].verification_status, 'unverified');
    const current = (await agent.request('/account/profile')).data;
    assert.equal((await agent.request('/account/profile', 'PUT', { ...current, bio: 'Updated integration profile' })).status, 200);
    assert.equal((await searchAgents({ q: `${name} owner` })).total, 0, 'edits require reapproval');
    const beforeLogout = await agent.request('/auth/session');
    assert.equal((await agent.request('/auth/logout', 'POST', {})).status, 200);
    assert.equal((await agent.request('/account/profile')).status, 401);
    await agent.request('/auth/session');
    assert.equal((await agent.request('/auth/login', 'POST', { email: owner.email, password: 'Wrong-password-2026!' })).status, 401);
    const login = await agent.request('/auth/login', 'POST', { email: owner.email, password });
    assert.equal(login.status, 200);
    assert.notEqual(login.data.csrfToken, beforeLogout.data.csrfToken);
    assert.equal((await agent.request('/auth/logout', 'POST', {}, beforeLogout.data.csrfToken)).status, 403);
    assert.equal((await agent.request('/auth/logout', 'POST', {}, 'é'.repeat(64))).status, 403);
    const [stored] = await query(`SELECT password_hash FROM users WHERE id=${p('id')}`, { id: owner.id });
    assert.ok(stored.password_hash.startsWith('scrypt:')); assert.ok(!stored.password_hash.includes(password));
  } finally {
    try {
      for (const id of locationIds.reverse()) await query(`DELETE FROM locations WHERE id=${p('id')}`, { id });
      for (const id of users) {
        await query(`DELETE FROM agents WHERE owner_id=${p('id')}`, { id });
        await query(`DELETE FROM sessions WHERE session_json LIKE ${p('match')}`, { match: `%${id}%` });
      }
      for (const id of users) await query(`DELETE FROM users WHERE id=${p('id')}`, { id });
    } finally { await new Promise(resolve => server.close(resolve)); await close(); }
  }
});
