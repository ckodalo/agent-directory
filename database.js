import 'dotenv/config';

export const dialect = process.env.DB_CLIENT || 'sqlserver';
if (!['sqlserver', 'mysql'].includes(dialect)) throw new Error('DB_CLIENT must be sqlserver or mysql');
export const parameter = name => `${dialect === 'mysql' ? ':' : '@'}${name}`;
let connection;

async function connect() {
  if (dialect === 'mysql') {
    const { default: mysql } = await import('mysql2/promise');
    return mysql.createPool({
      host: process.env.DB_HOST || 'localhost',
      port: Number(process.env.DB_PORT || 3306),
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
      database: process.env.DB_NAME || 'agenttrust',
      namedPlaceholders: true,
      connectionLimit: 5
    });
  }
  const windowsAuth = (process.env.DB_AUTH || 'windows') === 'windows';
  const { default: sql } = await import(windowsAuth ? 'mssql/msnodesqlv8.js' : 'mssql');
  const pool = new sql.ConnectionPool({
    server: process.env.DB_HOST || 'localhost',
    database: process.env.DB_NAME || 'agenttrust',
    ...(process.env.DB_PORT ? { port: Number(process.env.DB_PORT) } : {}),
    ...(windowsAuth ? { driver: process.env.DB_ODBC_DRIVER || 'ODBC Driver 18 for SQL Server' } : {
      user: process.env.DB_USER, password: process.env.DB_PASSWORD
    }),
    ...(windowsAuth ? {
      // The native driver does not forward trustServerCertificate from options.
      beforeConnect: config => {
        config.conn_str += `;TrustServerCertificate=${process.env.DB_TRUST_SERVER_CERTIFICATE === 'true' ? 'Yes' : 'No'}`;
      }
    } : {}),
    options: {
      trustedConnection: windowsAuth,
      encrypt: process.env.DB_ENCRYPT !== 'false',
      trustServerCertificate: process.env.DB_TRUST_SERVER_CERTIFICATE === 'true',
      ...(process.env.DB_INSTANCE ? { instanceName: process.env.DB_INSTANCE } : {})
    },
    pool: { max: 5, min: 0, idleTimeoutMillis: 30000 }
  });
  pool.on('error', error => console.error('Database pool error:', error.message));
  await pool.connect();
  return { pool, sql };
}

export async function query(statement, parameters = {}) {
  if (!connection) connection = connect().catch(error => { connection = undefined; throw error; });
  const client = await connection;
  if (dialect === 'mysql') {
    const [rows] = await client.execute(statement, parameters);
    return rows;
  }
  const request = client.pool.request();
  for (const [name, value] of Object.entries(parameters)) {
    const type = typeof value === 'number'
      ? (Number.isInteger(value) ? client.sql.Int : client.sql.Float) : client.sql.NVarChar;
    request.input(name, type, value);
  }
  return (await request.query(statement)).recordset;
}

export async function close() {
  if (!connection) return;
  const client = await connection;
  connection = undefined;
  if (dialect === 'mysql') await client.end();
  else await client.pool.close();
}
