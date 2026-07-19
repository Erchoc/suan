const SESSION_VERSION = 'v1';
const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1_000;
export const ADMIN_SESSION_COOKIE = 'suan_admin_session';
export const ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/u, '');
}

function fromBase64Url(value: string): Uint8Array | null {
  if (!/^[A-Za-z0-9_-]+$/u.test(value)) return null;
  const padded = value
    .replaceAll('-', '+')
    .replaceAll('_', '/')
    .padEnd(Math.ceil(value.length / 4) * 4, '=');
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, character => character.charCodeAt(0));
  } catch {
    return null;
  }
}

async function importSigningKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
}

async function sign(value: string, secret: string): Promise<Uint8Array> {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await importSigningKey(secret),
    encoder.encode(value),
  );
  return new Uint8Array(signature);
}

function constantTimeEqual(left: Uint8Array, right: Uint8Array): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index] ^ right[index];
  }
  return difference === 0;
}

export async function constantTimeStringMatches(
  candidate: string,
  configured: string,
): Promise<boolean> {
  const [candidateHash, configuredHash] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(candidate)),
    crypto.subtle.digest('SHA-256', encoder.encode(configured)),
  ]);
  return constantTimeEqual(new Uint8Array(candidateHash), new Uint8Array(configuredHash));
}

export function getDailyAdminPasscode(nowMs: number): string {
  const shanghaiDate = new Date(nowMs + SHANGHAI_OFFSET_MS);
  const month = String(shanghaiDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(shanghaiDate.getUTCDate()).padStart(2, '0');
  return `${month}${day}`;
}

export async function createAdminSession(
  secret: string,
  nowMs: number,
  nonce: string,
): Promise<{ value: string; expiresAt: number }> {
  const expiresAt = Math.floor(nowMs / 1000) + ADMIN_SESSION_MAX_AGE_SECONDS;
  const payload = `${SESSION_VERSION}.${expiresAt}.${nonce}`;
  const signature = toBase64Url(await sign(payload, secret));
  return { value: `${payload}.${signature}`, expiresAt: expiresAt * 1000 };
}

export async function verifyAdminSession(
  value: string | undefined,
  secret: string,
  nowMs: number,
): Promise<boolean> {
  if (!value) return false;
  const parts = value.split('.');
  if (parts.length !== 4 || parts[0] !== SESSION_VERSION) return false;
  const expiresAt = Number(parts[1]);
  if (!Number.isSafeInteger(expiresAt) || expiresAt <= Math.floor(nowMs / 1000)) return false;
  if (!/^[0-9a-f-]{36}$/iu.test(parts[2])) return false;
  const receivedSignature = fromBase64Url(parts[3]);
  if (!receivedSignature) return false;
  const expectedSignature = await sign(parts.slice(0, 3).join('.'), secret);
  return constantTimeEqual(receivedSignature, expectedSignature);
}

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator === -1) continue;
    if (part.slice(0, separator).trim() === name) return part.slice(separator + 1).trim();
  }
  return undefined;
}

export function buildAdminSessionCookie(value: string, secure: boolean): string {
  return [
    `${ADMIN_SESSION_COOKIE}=${value}`,
    'Path=/',
    `Max-Age=${ADMIN_SESSION_MAX_AGE_SECONDS}`,
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}

export function buildExpiredAdminSessionCookie(secure: boolean): string {
  return [
    `${ADMIN_SESSION_COOKIE}=`,
    'Path=/',
    'Max-Age=0',
    'HttpOnly',
    'SameSite=Strict',
    secure ? 'Secure' : '',
  ]
    .filter(Boolean)
    .join('; ');
}
