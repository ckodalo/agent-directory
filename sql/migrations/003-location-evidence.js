import { dialect, query } from '../../database.js';

export async function up() {
  await query(dialect === 'sqlserver' ? `IF OBJECT_ID('location_evidence','U') IS NULL CREATE TABLE location_evidence (
    location_id INT PRIMARY KEY REFERENCES locations(id) ON DELETE CASCADE,
    source_url NVARCHAR(1000) NOT NULL,created_by VARCHAR(36) NOT NULL REFERENCES users(id),
    created_at DATETIME2 NOT NULL DEFAULT SYSDATETIME())`
    : `CREATE TABLE IF NOT EXISTS location_evidence (location_id INT PRIMARY KEY,
      source_url VARCHAR(1000) NOT NULL,created_by VARCHAR(36) NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY(location_id) REFERENCES locations(id) ON DELETE CASCADE, FOREIGN KEY(created_by) REFERENCES users(id))`);
}
