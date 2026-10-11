import { readFile, appendFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';

const path = new URL('../.env', import.meta.url);
const existing = await readFile(path, 'utf8').catch(error => { if (error.code === 'ENOENT') return ''; throw error; });
if (/^SESSION_SECRET=.+$/m.test(existing)) console.log('SESSION_SECRET is already configured');
else { await appendFile(path, `\nSESSION_SECRET=${randomBytes(48).toString('hex')}\n`); console.log('Generated SESSION_SECRET in ignored .env'); }
