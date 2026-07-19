import { getClientId } from '../utils/aiChat';

export interface AuthConfig {
  methods: {
    phone: boolean;
    wechat: boolean;
  };
}

export interface AuthIdentity {
  provider: 'phone' | 'wechat';
  label: string;
}

export interface AuthUser {
  id: string;
  displayName: string | null;
  avatarUrl: string | null;
  identities: AuthIdentity[];
}

export interface AuthSession {
  authenticated: boolean;
  user: AuthUser | null;
}

export interface SmsChallengeResponse {
  challengeId: string;
  phone: string;
  expiresIn: number;
  resendAfter: number;
}

export class AuthApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly retryAfter: number | null,
  ) {
    super(message);
    this.name = 'AuthApiError';
  }
}

async function readPayload<T>(response: Response): Promise<T> {
  const payload: unknown = await response.json().catch(() => null);
  if (response.ok) return payload as T;
  const error =
    typeof payload === 'object' && payload !== null && 'error' in payload
      ? (payload as { error?: unknown }).error
      : null;
  const code =
    typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string'
      ? error.code
      : 'REQUEST_FAILED';
  const message =
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof error.message === 'string'
      ? error.message
      : '请求失败，请稍后重试';
  const retryAfter = Number(response.headers.get('retry-after'));
  throw new AuthApiError(
    response.status,
    code,
    message,
    Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : null,
  );
}

function jsonRequest(body: unknown): RequestInit {
  return {
    method: 'POST',
    credentials: 'same-origin',
    headers: {
      'content-type': 'application/json',
      'x-suan-client-id': getClientId(),
    },
    body: JSON.stringify(body),
  };
}

export async function getAuthConfig(): Promise<AuthConfig> {
  return readPayload<AuthConfig>(
    await fetch('/api/auth/config', { credentials: 'same-origin', cache: 'no-store' }),
  );
}

export async function getAuthSession(): Promise<AuthSession> {
  return readPayload<AuthSession>(
    await fetch('/api/auth/session', { credentials: 'same-origin', cache: 'no-store' }),
  );
}

export async function logoutAuthSession(): Promise<AuthSession> {
  return readPayload<AuthSession>(
    await fetch('/api/auth/session', {
      method: 'DELETE',
      credentials: 'same-origin',
      headers: { 'x-suan-client-id': getClientId() },
    }),
  );
}

export async function sendSmsCode(phone: string): Promise<SmsChallengeResponse> {
  const payload = await readPayload<{ data: SmsChallengeResponse }>(
    await fetch('/api/auth/sms/send', jsonRequest({ phone })),
  );
  return payload.data;
}

export async function verifySmsCode(
  phone: string,
  challengeId: string,
  code: string,
): Promise<AuthSession> {
  return readPayload<AuthSession>(
    await fetch('/api/auth/sms/verify', jsonRequest({ phone, challengeId, code })),
  );
}
