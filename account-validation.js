import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const scrypt = promisify(scryptCallback);
export function credentials(body) {
  if (!body || typeof body.email !== 'string' || typeof body.password !== 'string') throw new Error('Email and password are required');
  const email = body.email.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Enter a valid email address');
  if (body.password.length < 12 || body.password.length > 128) throw new Error('Use a password between 12 and 128 characters');
  return { email, password: body.password };
}
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  return `scrypt:${salt}:${hash.toString('hex')}`;
}
export async function verifyPassword(password, stored) {
  const [method, salt, encoded] = stored.split(':');
  if (method !== 'scrypt' || !salt || !encoded) return false;
  const actual = await scrypt(password, salt, 64, { N: 32768, maxmem: 64 * 1024 * 1024 });
  const expected = Buffer.from(encoded, 'hex');
  return expected.length === actual.length && timingSafeEqual(actual, expected);
}
export function profileInput(body) {
  const text = (name, max, required = false) => {
    if (body[name] != null && typeof body[name] !== 'string') throw new Error(`Invalid ${name}`);
    const value = (body[name] || '').trim();
    if (value.length > max || (required && !value)) throw new Error(`Invalid ${name}`);
    return value || null;
  };
  const result = { name: text('name', 160, true), agency_name: text('agency_name', 160),
    phone: text('phone', 40), whatsapp: text('whatsapp', 40), bio: text('bio', 4000) };
  for (const key of ['phone', 'whatsapp']) if (result[key] && !/^\+?[\d\s()-]{7,40}$/.test(result[key])) throw new Error(`Invalid ${key}`);
  for (const key of ['latitude', 'longitude']) {
    const value = body[key];
    if (value !== '' && value != null && typeof value !== 'number' && typeof value !== 'string') throw new Error(`Invalid ${key}`);
    result[key] = value === '' || value == null ? null : Number(value);
    if (result[key] !== null && (!Number.isFinite(result[key]) || Math.abs(result[key]) > (key === 'latitude' ? 90 : 180))) throw new Error(`Invalid ${key}`);
  }
  if ((result.latitude === null) !== (result.longitude === null)) throw new Error('Provide both office coordinates');
  if (!Array.isArray(body.service_area_ids) || body.service_area_ids.length > 50 || body.service_area_ids.some(id => !Number.isInteger(id) || id < 1 || id > 2147483647)) throw new Error('Choose valid service areas (maximum 50)');
  result.service_area_ids = [...new Set(body.service_area_ids)];
  if (!Number.isInteger(body.profile_version) || body.profile_version < 0) throw new Error('Invalid profile version');
  result.profile_version = body.profile_version;
  return result;
}
