import { randomUUID } from 'node:crypto';
import { dialect, query, transaction, parameter as p } from './database.js';

export class AccountError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
const sqlLock = dialect === 'sqlserver' ? ' WITH (UPDLOCK,HOLDLOCK)' : '';
const mysqlLock = dialect === 'mysql' ? ' FOR UPDATE' : '';
export async function userById(id) {
  return (await query(`SELECT id,email,role FROM users WHERE id=${p('id')}`, { id }))[0] || null;
}
export async function registerUser(email, passwordHash, name) {
  const id = randomUUID();
  await transaction(async run => {
    await run(`INSERT INTO users(id,email,password_hash,role) VALUES (${p('id')},${p('email')},${p('hash')},'agent')`, { id, email, hash: passwordHash });
    await run(`INSERT INTO agents(name,owner_id,profile_status,is_published) VALUES (${p('name')},${p('id')},'draft',0)`, { id, name });
  });
  return { id, email, role: 'agent' };
}
export async function ownProfile(userId) {
  const [profile] = await query(`SELECT id,name,agency_name,phone,whatsapp,bio,latitude,longitude,
    verification_status,profile_status,rejection_reason,profile_version FROM agents WHERE owner_id=${p('userId')}`, { userId });
  if (!profile) throw new AccountError(404, 'Profile not found');
  profile.id = Number(profile.id); profile.profile_version = Number(profile.profile_version);
  const areas = await query(`SELECT location_id FROM agent_service_areas WHERE agent_id=${p('id')}`, { id: profile.id });
  profile.service_area_ids = areas.map(area => Number(area.location_id));
  return profile;
}
async function audit(run, agentId, actorId, action, reason = null) {
  await run(`INSERT INTO profile_actions(id,agent_id,actor_id,action,reason)
    VALUES (${p('id')},${p('agentId')},${p('actorId')},${p('action')},${p('reason')})`, { id: randomUUID(), agentId, actorId, action, reason });
}
export async function saveProfile(userId, profile) {
  await transaction(async run => {
    const [existing] = await run(`SELECT id,name,profile_version FROM agents${sqlLock} WHERE owner_id=${p('userId')}${mysqlLock}`, { userId });
    if (!existing) throw new AccountError(404, 'Profile not found');
    if (Number(existing.profile_version) !== profile.profile_version) throw new AccountError(409, 'Profile changed. Reload it before saving.');
    const id = Number(existing.id);
    for (const locationId of profile.service_area_ids) {
      const found = await run(`SELECT id FROM locations WHERE id=${p('locationId')}`, { locationId });
      if (!found.length) throw new AccountError(400, 'A selected service area no longer exists');
    }
    const fields = ['name', 'agency_name', 'phone', 'whatsapp', 'bio', 'latitude', 'longitude'];
    const params = Object.fromEntries(fields.map(field => [field, profile[field]]));
    params.id = id;
    await run(`UPDATE agents SET ${fields.map(field => `${field}=${p(field)}`).join(',')},
      profile_status='draft',is_published=0,rejection_reason=NULL,profile_version=profile_version+1
      ${existing.name !== profile.name ? ",verification_status='unverified'" : ''} WHERE id=${p('id')}`, params);
    await run(`DELETE FROM agent_service_areas WHERE agent_id=${p('id')}`, { id });
    for (const locationId of profile.service_area_ids) await run(`INSERT INTO agent_service_areas(agent_id,location_id) VALUES (${p('id')},${p('locationId')})`, { id, locationId });
    await audit(run, id, userId, 'edit');
  });
  return ownProfile(userId);
}
export async function submitProfile(userId, version) {
  await transaction(async run => {
    const [profile] = await run(`SELECT id,name,phone,whatsapp,profile_status,profile_version FROM agents${sqlLock} WHERE owner_id=${p('userId')}${mysqlLock}`, { userId });
    if (!profile) throw new AccountError(404, 'Profile not found');
    if (Number(profile.profile_version) !== version) throw new AccountError(409, 'Profile changed. Reload it before submitting.');
    if (!['draft', 'rejected'].includes(profile.profile_status)) throw new AccountError(409, 'This profile is already submitted or approved');
    const id = Number(profile.id);
    const areas = await run(`SELECT location_id FROM agent_service_areas WHERE agent_id=${p('id')}`, { id });
    if (!profile.name || (!profile.phone && !profile.whatsapp) || !areas.length) throw new AccountError(400, 'Add a name, contact number and at least one service area before submitting');
    await run(`UPDATE agents SET profile_status='pending',is_published=0,rejection_reason=NULL,profile_version=profile_version+1 WHERE id=${p('id')}`, { id });
    await audit(run, id, userId, 'submit');
  });
  return ownProfile(userId);
}
export async function pendingProfiles() {
  const rows = await query(`SELECT ${dialect === 'sqlserver' ? 'TOP (100)' : ''}id,name,agency_name,phone,whatsapp,bio,
    profile_version,verification_status FROM agents WHERE profile_status='pending' ORDER BY id${dialect === 'mysql' ? ' LIMIT 100' : ''}`);
  for (const row of rows) {
    row.id = Number(row.id); row.profile_version = Number(row.profile_version);
    row.service_areas = await query(`SELECT l.name,l.county FROM agent_service_areas a JOIN locations l ON l.id=a.location_id WHERE a.agent_id=${p('id')} ORDER BY l.name`, { id: row.id });
  }
  return rows;
}
export async function moderateProfile(actorId, agentId, action, version, reason) {
  await transaction(async run => {
    const [profile] = await run(`SELECT owner_id,profile_status,profile_version FROM agents${sqlLock} WHERE id=${p('id')}${mysqlLock}`, { id: agentId });
    if (!profile) throw new AccountError(404, 'Profile not found');
    if (profile.owner_id === actorId) throw new AccountError(403, 'You cannot moderate your own profile');
    if (profile.profile_status !== 'pending' || Number(profile.profile_version) !== version) throw new AccountError(409, 'Profile changed or is no longer pending. Refresh the queue.');
    await run(`UPDATE agents SET profile_status=${p('status')},is_published=${p('published')},rejection_reason=${p('reason')},profile_version=profile_version+1 WHERE id=${p('id')}`,
      { id: agentId, status: action === 'approve' ? 'approved' : 'rejected', published: action === 'approve' ? 1 : 0, reason: action === 'reject' ? reason : null });
    await audit(run, agentId, actorId, action, reason);
  });
}
