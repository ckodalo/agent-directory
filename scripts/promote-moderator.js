import { query, parameter as p, close } from '../database.js';

const email = (process.argv[2] || '').trim().toLowerCase();
try {
  if (!email) throw new Error('Usage: npm run moderator:promote -- email@example.com');
  const [user] = await query(`SELECT id FROM users WHERE email=${p('email')}`, { email });
  if (!user) throw new Error('Register this account first; no account was changed');
  await query(`UPDATE users SET role='moderator' WHERE id=${p('id')}`, { id: user.id });
  console.log('Existing account promoted to moderator');
} finally { await close(); }
