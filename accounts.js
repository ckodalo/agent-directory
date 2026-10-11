import express from 'express';
import session from 'express-session';
import rateLimit from 'express-rate-limit';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { query, parameter as p } from './database.js';
import { DatabaseSessionStore } from './session-store.js';
import { credentials, hashPassword, verifyPassword, profileInput } from './account-validation.js';
import * as repository from './account-repository.js';

export const accounts = express.Router();
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) throw new Error('Run npm run auth:setup to configure SESSION_SECRET before starting the server');
const cookieSecure = process.env.NODE_ENV === 'production' || process.env.SESSION_COOKIE_SECURE === 'true';
accounts.use(session({ name: 'agenttrust.sid', secret: process.env.SESSION_SECRET,
  resave: false, saveUninitialized: false, store: new DatabaseSessionStore(),
  cookie: { httpOnly: true, sameSite: 'lax', secure: cookieSecure, maxAge: 8 * 60 * 60 * 1000 } }));
const safe = handler => async (req, res, next) => { try { await handler(req, res, next); } catch (error) { next(error); } };
accounts.use(safe(async (req, res, next) => {
  req.account = req.session.userId ? await repository.userById(req.session.userId) : null;
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const token = req.get('X-CSRF-Token');
    const expected = req.session.csrf;
    if (!req.is('application/json') || typeof token !== 'string' || !expected || Buffer.byteLength(token) !== Buffer.byteLength(expected) ||
      !timingSafeEqual(Buffer.from(token), Buffer.from(expected))) return res.status(403).json({ error: 'Session expired. Refresh the page and try again.' });
  }
  next();
}));
const requireUser = (req, res, next) => req.account ? next() : res.status(401).json({ error: 'Sign in to continue' });
const requireModerator = (req, res, next) => req.account?.role === 'moderator' ? next() : res.status(403).json({ error: 'Moderator access required' });
const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: 20, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many attempts. Please try later.' } });
const registerLimit = rateLimit({ windowMs: 60 * 60_000, limit: 5, standardHeaders: 'draft-7', legacyHeaders: false, message: { error: 'Too many registrations. Please try later.' } });
const regenerate = req => new Promise((resolve, reject) => req.session.regenerate(error => error ? reject(error) : resolve()));
async function signedIn(req, res, user, status = 200) {
  await regenerate(req);
  req.session.userId = user.id; req.session.csrf = randomBytes(32).toString('hex');
  res.status(status).json({ user, csrfToken: req.session.csrf });
}
accounts.get('/auth/session', (req, res) => {
  req.session.csrf ||= randomBytes(32).toString('hex');
  res.json({ user: req.account, csrfToken: req.session.csrf });
});
accounts.post('/auth/register', registerLimit, safe(async (req, res) => {
  let input;
  try { input = credentials(req.body); } catch (error) { throw new repository.AccountError(400, error.message); }
  const name = typeof req.body.name === 'string' ? req.body.name.trim() : '';
  if (!name || name.length > 160) throw new repository.AccountError(400, 'Enter your public agent name');
  const user = await repository.registerUser(input.email, await hashPassword(input.password), name);
  await signedIn(req, res, user, 201);
}));
accounts.post('/auth/login', authLimit, safe(async (req, res) => {
  let input;
  try { input = credentials(req.body); } catch { throw new repository.AccountError(401, 'Incorrect email or password'); }
  const [user] = await query(`SELECT id,email,role,password_hash FROM users WHERE email=${p('email')}`, { email: input.email });
  const dummy = `scrypt:00000000000000000000000000000000:${'00'.repeat(64)}`;
  const valid = await verifyPassword(input.password, user?.password_hash || dummy);
  if (!user || !valid) throw new repository.AccountError(401, 'Incorrect email or password');
  await signedIn(req, res, { id: user.id, email: user.email, role: user.role });
}));
accounts.post('/auth/logout', safe(async (req, res) => {
  await new Promise((resolve, reject) => req.session.destroy(error => error ? reject(error) : resolve()));
  res.clearCookie('agenttrust.sid', { httpOnly: true, sameSite: 'lax', secure: cookieSecure });
  res.json({ ok: true });
}));
accounts.get('/account/profile', requireUser, safe(async (req, res) => res.json(await repository.ownProfile(req.account.id))));
accounts.put('/account/profile', requireUser, safe(async (req, res) => {
  let profile;
  try { profile = profileInput(req.body); } catch (error) { throw new repository.AccountError(400, error.message); }
  res.json(await repository.saveProfile(req.account.id, profile));
}));
accounts.post('/account/profile/submit', requireUser, safe(async (req, res) => {
  if (!Number.isInteger(req.body.profile_version) || req.body.profile_version < 0) throw new repository.AccountError(400, 'Invalid profile version');
  res.json(await repository.submitProfile(req.account.id, req.body.profile_version));
}));
accounts.get('/moderation/profiles', requireUser, requireModerator, safe(async (req, res) => res.json(await repository.pendingProfiles())));
accounts.post('/moderation/profiles/:id', requireUser, requireModerator, safe(async (req, res) => {
  const id = Number(req.params.id), { action, profile_version: version } = req.body;
  const reason = typeof req.body.reason === 'string' ? req.body.reason.trim() : '';
  if (!Number.isInteger(id) || id < 1 || id > 2147483647 || !['approve', 'reject'].includes(action) ||
      !Number.isInteger(version) || version < 0 || reason.length > 1000 || (action === 'reject' && !reason)) throw new repository.AccountError(400, 'Choose approve or reject; rejection requires a reason');
  await repository.moderateProfile(req.account.id, id, action, version, reason);
  res.json({ ok: true });
}));
accounts.use((error, req, res, next) => {
  if (error.status) return res.status(error.status).json({ error: error.message });
  if ([2601, 2627, 1062].includes(error.number || error.errno)) return res.status(409).json({ error: 'Account already exists' });
  console.error('Account request failed:', error.message);
  res.status(500).json({ error: 'Unable to complete account request' });
});
