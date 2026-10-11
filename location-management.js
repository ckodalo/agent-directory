import { dialect, transaction, parameter as p } from './database.js';
import { AccountError } from './account-repository.js';

const levels = ['county', 'sub_county', 'town', 'neighborhood'];
export async function createLocation(actorId, body) {
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const type = body.location_type;
  const parentId = body.parent_id;
  let source;
  try { source = new URL(body.source_url); } catch { throw new AccountError(400, 'Provide a source URL for the location and its parent relationship'); }
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password || source.href.length > 1000 ||
      !name || name.length > 120 || !levels.slice(1).includes(type) || !Number.isInteger(parentId) || parentId < 1 || parentId > 2147483647 || body.confirmed !== true) {
    throw new AccountError(400, 'Enter a name, valid parent, location type and source, and confirm the relationship');
  }
  return transaction(async run => {
    const [parent] = await run(`SELECT id,county,location_type FROM locations${dialect === 'sqlserver' ? ' WITH (UPDLOCK,HOLDLOCK)' : ''} WHERE id=${p('parentId')}${dialect === 'mysql' ? ' FOR UPDATE' : ''}`, { parentId });
    if (!parent || levels.indexOf(parent.location_type) >= levels.indexOf(type)) throw new AccountError(400, 'Choose a parent higher in the county/sub-county/town/neighborhood hierarchy');
    const duplicate = await run(`SELECT id FROM locations WHERE parent_id=${p('parentId')} AND LOWER(name)=LOWER(${p('name')})`, { parentId, name });
    if (duplicate.length) throw new AccountError(409, 'This area already exists under that parent');
    const parameters = { name, county: parent.county, type, parentId };
    await run(`INSERT INTO locations(name,county,location_type,parent_id) VALUES (${p('name')},${p('county')},${p('type')},${p('parentId')})`, parameters);
    const [created] = await run(`SELECT id,name,county,location_type,parent_id FROM locations WHERE parent_id=${p('parentId')} AND name=${p('name')}`, parameters);
    const id = Number(created.id);
    await run(`INSERT INTO location_evidence(location_id,source_url,created_by) VALUES (${p('id')},${p('source')},${p('actorId')})`, { id, source: source.href, actorId });
    return { ...created, id, parent_id: Number(created.parent_id) };
  });
}
