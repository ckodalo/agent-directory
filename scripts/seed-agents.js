import { close, transaction, parameter as p } from '../database.js';

const fixtures = [
  ['Amani Wekesa', 'Nairobi'],
  ['Neema Otieno', 'Kisumu'],
  ['Baraka Mwangi', 'Nakuru'],
  ['Zawadi Kiptoo', 'Uasin Gishu'],
  ['Imani Karimi', 'Mombasa']
];
const bio = 'Fictional local test profile for the AgentTrust approval workflow. Not a real agent or business; no contact details, reviews or identity verification are provided.';

try {
  const host = (process.env.DB_HOST || 'localhost').toLowerCase();
  if (process.env.NODE_ENV === 'production' || !['localhost', '127.0.0.1', '::1', '.', '(local)'].includes(host)) {
    throw new Error('Test agents may only be seeded against a local development database.');
  }
  const results = await transaction(async run => {
    const results = [];
    for (const [name, county] of fixtures) {
      const [existing] = await run(`SELECT id,profile_status FROM agents WHERE name=${p('name')} AND bio=${p('bio')} AND owner_id IS NULL`, { name, bio });
      if (existing) {
        results.push({ name, id: Number(existing.id), status: existing.profile_status, created: false });
        continue;
      }
      const [location] = await run(`SELECT id FROM locations WHERE location_type='county' AND name=${p('county')}`, { county });
      if (!location) throw new Error(`County ${county} is missing. Run npm run db:migrate first.`);
      // Fixtures intentionally have no account or real contact number.
      await run(`INSERT INTO agents(name,bio,verification_status,profile_status,is_published)
        VALUES (${p('name')},${p('bio')},'unverified','pending',0)`, { name, bio });
      const [agent] = await run(`SELECT id FROM agents WHERE name=${p('name')} AND bio=${p('bio')} AND owner_id IS NULL`, { name, bio });
      const id = Number(agent.id);
      await run(`INSERT INTO agent_service_areas(agent_id,location_id) VALUES (${p('id')},${p('locationId')})`, { id, locationId: Number(location.id) });
      results.push({ name, id, status: 'pending', created: true });
    }
    return results;
  });
  for (const item of results) console.log(`${item.created ? 'Created' : 'Already exists'}: ${item.name} (#${item.id}, ${item.status})`);
} catch (error) {
  console.error(error.message);
  process.exitCode = 1;
} finally {
  await close();
}
