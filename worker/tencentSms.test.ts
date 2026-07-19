import { describe, expect, it, vi } from 'vitest';
import { buildTencentSmsRequest, SmsProviderError, sendTencentSmsCode } from './tencentSms';

const CONFIG = {
  secretId: 'AKIDEXAMPLE',
  secretKey: 'test-secret-key',
  sdkAppId: '1400000000',
  signName: '算道',
  templateId: '123456',
};

describe('Tencent SMS provider', () => {
  it('builds a deterministic TC3 request without exposing the secret key', async () => {
    const request = await buildTencentSmsRequest(CONFIG, '+8613800138000', '654321', 1_784_448_000);
    expect(JSON.parse(request.body)).toEqual({
      PhoneNumberSet: ['+8613800138000'],
      SmsSdkAppId: '1400000000',
      SignName: '算道',
      TemplateId: '123456',
      TemplateParamSet: ['654321'],
    });
    expect(request.headers['x-tc-version']).toBe('2021-01-11');
    expect(request.headers.authorization).toMatch(
      /^TC3-HMAC-SHA256 Credential=AKIDEXAMPLE\/\d{4}-\d{2}-\d{2}\/sms\/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=[0-9a-f]{64}$/u,
    );
    expect(request.headers.authorization).not.toContain(CONFIG.secretKey);
  });

  it('accepts only a successful provider status', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({
        Response: {
          RequestId: 'request-1',
          SendStatusSet: [{ Code: 'Ok', Message: 'send success', SerialNo: 'serial-1' }],
        },
      }),
    );
    await expect(
      sendTencentSmsCode(fetcher, CONFIG, '+8613800138000', '654321', 1_784_448_000_000),
    ).resolves.toEqual({ messageId: 'serial-1' });
    expect(fetcher).toHaveBeenCalledWith(
      'https://sms.tencentcloudapi.com',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('maps rejected provider responses to a safe error', async () => {
    const fetcher = vi.fn(async () =>
      Response.json({ Response: { Error: { Code: 'FailedOperation', Message: 'private' } } }),
    );
    await expect(
      sendTencentSmsCode(fetcher, CONFIG, '+8613800138000', '654321', 1_784_448_000_000),
    ).rejects.toEqual(new SmsProviderError('rejected'));
  });
});
