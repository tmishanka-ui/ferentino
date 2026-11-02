import { createHash, pbkdf2, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);
const ITER = 210_000;

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex');

export async function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2Async(pw, salt, ITER, 32, 'sha256');
  return `pbkdf2$${ITER}$${salt.toString('hex')}$${hash.toString('hex')}`;
}

export async function checkPassword(pw: string, stored: string): Promise<boolean> {
  try {
    const p = stored.split('$');
    if (p.length !== 4 || p[0] !== 'pbkdf2') return false;
    const want = Buffer.from(p[3], 'hex');
    const got = await pbkdf2Async(pw, Buffer.from(p[2], 'hex'), parseInt(p[1], 10), 32, 'sha256');
    return want.length === got.length && timingSafeEqual(want, got);
  } catch {
    return false;
  }
}

function randomFrom(alphabet: string, n: number): string {
  let s = '';
  for (let i = 0; i < n; i++) s += alphabet[randomInt(alphabet.length)];
  return s;
}

export const tempPassword = () => randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789', 10) + randomFrom('23456789', 2);
export const resetCode = () => randomFrom('ABCDEFGHJKLMNPQRSTUVWXYZ23456789', 8);
export const token = () => randomBytes(32).toString('hex');

/** Returns an error message, or "" when the password is acceptable. */
export function policy(pw: string, email: string): string {
  pw = pw || '';
  if (pw.length < 8) return 'The password must have at least 8 characters.';
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return 'The password needs at least one letter and one number.';
  if (email && pw.toLowerCase() === email.toLowerCase()) return 'The password cannot be the e-mail address.';
  return '';
}
