import { readFile } from 'node:fs/promises';
import { dialect, parameter as p, query } from '../../database.js';

export async function up() {
  const columns = dialect === 'sqlserver'
    ? await query("SELECT name FROM sys.columns WHERE object_id=OBJECT_ID('locations')")
    : await query("SELECT COLUMN_NAME AS name FROM information_schema.columns WHERE table_schema=DATABASE() AND table_name='locations'");
  const existing = new Set(columns.map(column => column.name));
  for (const [name, definition] of Object.entries({
    location_type: "VARCHAR(20) NOT NULL DEFAULT 'neighborhood'",
    parent_id: 'INT NULL', county_code: 'VARCHAR(2) NULL'
  })) {
    if (!existing.has(name)) await query(`ALTER TABLE locations ADD ${name} ${definition}`);
  }
  const indexes = dialect === 'sqlserver'
    ? await query("SELECT name FROM sys.indexes WHERE object_id=OBJECT_ID('locations')")
    : await query("SELECT INDEX_NAME AS name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='locations'");
  const indexNames = new Set(indexes.map(index => index.name));
  if (!indexNames.has('idx_county_code')) {
    await query(`CREATE UNIQUE INDEX idx_county_code ON locations(county_code)${dialect === 'sqlserver' ? ' WHERE county_code IS NOT NULL' : ''}`);
  }
  if (!indexNames.has('idx_location_parent')) await query('CREATE INDEX idx_location_parent ON locations(parent_id)');
  const constraints = dialect === 'sqlserver'
    ? await query("SELECT name FROM sys.objects WHERE parent_object_id=OBJECT_ID('locations')")
    : await query("SELECT CONSTRAINT_NAME AS name FROM information_schema.table_constraints WHERE table_schema=DATABASE() AND table_name='locations'");
  const constraintNames = new Set(constraints.map(constraint => constraint.name));
  if (!constraintNames.has('fk_location_parent')) await query('ALTER TABLE locations ADD CONSTRAINT fk_location_parent FOREIGN KEY(parent_id) REFERENCES locations(id)');
  if (!constraintNames.has('ck_location_type')) await query("ALTER TABLE locations ADD CONSTRAINT ck_location_type CHECK(location_type IN ('county','sub_county','town','neighborhood'))");
  if (!constraintNames.has('ck_location_self')) await query('ALTER TABLE locations ADD CONSTRAINT ck_location_self CHECK(parent_id IS NULL OR parent_id<>id)');

  const counties = JSON.parse(await readFile(new URL('../counties.json', import.meta.url), 'utf8'));
  for (const county of counties) {
    await query(`INSERT INTO locations(name,county,location_type,county_code)
      SELECT ${p('name')},${p('name')},'county',${p('code')}
      WHERE NOT EXISTS (SELECT 1 FROM locations WHERE county_code=${p('code')})`, county);
    // Preserve existing IDs and service-area relationships while attaching legacy areas.
    const [root] = await query(`SELECT id FROM locations WHERE county_code=${p('code')}`, { code: county.code });
    await query(`UPDATE locations SET parent_id=${p('parentId')}
      WHERE location_type<>'county' AND parent_id IS NULL AND county=${p('name')}`, { parentId: Number(root.id), name: county.name });
  }
}
