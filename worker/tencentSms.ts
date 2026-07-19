const SMS_HOST = 'sms.tencentcloudapi.com';
const SMS_SERVICE = 'sms';
const SMS_VERSION = '2021-01-11';
const SMS_ACTION = 'SendSms';
const SMS_ALGORITHM = 'TC3-HMAC-SHA256';
const CONTENT_TYPE = 'application/json; charset=utf-8';

const encoder = new TextEncoder();

export interface TencentSmsConfig {
  secretId: string;
  secretKey: string;
  sdkAppId: string;
  signName: string;
  templateId: string;
  region?: string;
}

interface TencentSmsResponse {
  Response?: {
    Error?: { Code?: string; Message?: string };
    RequestId?: string;
    SendStatusSet?: Array<{ Code?: string; Message?: string; SerialNo?: string }>;
  };
}

export interface SmsSendResult {
  messageId: string;
}

export class SmsProviderError extends Error {
  constructor(readonly reason: 'configuration' | 'rejected' | 'unavailable') {
    super('SMS provider request failed');
    this.name = 'SmsProviderError';
  }
}

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

async function sha256(value: string): Promise<string> {
  return bytesToHex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function hmac(key: ArrayBuffer | string, value: string): Promise<ArrayBuffer> {
  const rawKey = typeof key === 'string' ? Uint8Array.from(encoder.encode(key)).buffer : key;
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    rawKey,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return crypto.subtle.sign('HMAC', cryptoKey, encoder.encode(value));
}

function utcDate(timestampSeconds: number): string {
  return new Date(timestampSeconds * 1_000).toISOString().slice(0, 10);
}

export async function buildTencentSmsRequest(
  config: TencentSmsConfig,
  phone: string,
  code: string,
  timestampSeconds: number,
): Promise<{ body: string; headers: Record<string, string> }> {
  const body = JSON.stringify({
    PhoneNumberSet: [phone],
    SmsSdkAppId: config.sdkAppId,
    SignName: config.signName,
    TemplateId: config.templateId,
    TemplateParamSet: [code],
  });
  const canonicalHeaders = [
    `content-type:${CONTENT_TYPE}`,
    `host:${SMS_HOST}`,
    `x-tc-action:${SMS_ACTION.toLowerCase()}`,
    '',
  ].join('\n');
  const signedHeaders = 'content-type;host;x-tc-action';
  const canonicalRequest = [
    'POST',
    '/',
    '',
    canonicalHeaders,
    signedHeaders,
    await sha256(body),
  ].join('\n');
  const date = utcDate(timestampSeconds);
  const credentialScope = `${date}/${SMS_SERVICE}/tc3_request`;
  const stringToSign = [
    SMS_ALGORITHM,
    String(timestampSeconds),
    credentialScope,
    await sha256(canonicalRequest),
  ].join('\n');
  const secretDate = await hmac(`TC3${config.secretKey}`, date);
  const secretService = await hmac(secretDate, SMS_SERVICE);
  const secretSigning = await hmac(secretService, 'tc3_request');
  const signature = bytesToHex(await hmac(secretSigning, stringToSign));

  return {
    body,
    headers: {
      authorization: `${SMS_ALGORITHM} Credential=${config.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      'content-type': CONTENT_TYPE,
      host: SMS_HOST,
      'x-tc-action': SMS_ACTION,
      'x-tc-region': config.region?.trim() || 'ap-guangzhou',
      'x-tc-timestamp': String(timestampSeconds),
      'x-tc-version': SMS_VERSION,
    },
  };
}

export async function sendTencentSmsCode(
  fetcher: typeof globalThis.fetch,
  config: TencentSmsConfig,
  phone: string,
  code: string,
  nowMs: number,
): Promise<SmsSendResult> {
  const request = await buildTencentSmsRequest(config, phone, code, Math.floor(nowMs / 1_000));
  let response: Response;
  try {
    response = await fetcher(`https://${SMS_HOST}`, {
      method: 'POST',
      headers: request.headers,
      body: request.body,
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new SmsProviderError('unavailable');
  }

  let payload: TencentSmsResponse;
  try {
    payload = (await response.json()) as TencentSmsResponse;
  } catch {
    throw new SmsProviderError('unavailable');
  }
  const providerResponse = payload.Response;
  const status = providerResponse?.SendStatusSet?.[0];
  if (!response.ok || providerResponse?.Error || status?.Code !== 'Ok') {
    throw new SmsProviderError('rejected');
  }
  return { messageId: status.SerialNo || providerResponse?.RequestId || 'accepted' };
}
