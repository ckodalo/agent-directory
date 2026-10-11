import { transaction, parameter as p } from '../../database.js';

// Kisumu CIDP III 2023-2027, Plate 13: Maseno Town in Kisumu West Sub-County.
export const source = 'https://www.kisumu.go.ke/wp-content/uploads/KISUMU-CIDP-III-2023-2027.pdf';
export async function up() {
  await transaction(async run => {
    let [parent] = await run("SELECT id FROM locations WHERE county_code='42' AND location_type='county'");
    if (!parent) throw new Error('Kisumu county is missing. Apply discovery migration first.');
    for (const [name, type] of [['Kisumu West', 'sub_county'], ['Maseno', 'town']]) {
      const params = { name, type, parentId: Number(parent.id) };
      const [existing] = await run(`SELECT id,location_type FROM locations WHERE parent_id=${p('parentId')} AND name=${p('name')}`, params);
      if (existing && existing.location_type !== type) throw new Error(`Existing ${name} has a different type; review it before migrating.`);
      if (!existing) await run(`INSERT INTO locations(name,county,location_type,parent_id)
        VALUES (${p('name')},'Kisumu',${p('type')},${p('parentId')})`, params);
      [parent] = await run(`SELECT id FROM locations WHERE parent_id=${p('parentId')} AND name=${p('name')}`, params);
    }
  });
}
