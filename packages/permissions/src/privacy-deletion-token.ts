import crypto from 'crypto';

export interface PrivacyDeletionToken {
  purpose: 'privacy-deletion';
  userId: string;
  expiresAt: number;
}

export function signPrivacyDeletionToken(userId: string, secret: string, nowMs = Date.now()): string {
  if (!/^\d{15,22}$/.test(userId)) {
    throw new Error('Privacy deletion tokens require a valid Discord user ID.');
  }
  const payload: PrivacyDeletionToken = {
    purpose: 'privacy-deletion',
    userId,
    expiresAt: nowMs + 10 * 60_000,
  };
  const data = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const signature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  return `${data}.${signature}`;
}

export function verifyPrivacyDeletionToken(
  token: string,
  secret: string,
  nowMs = Date.now(),
): PrivacyDeletionToken | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, signature] = parts;
  const expectedSignature = crypto.createHmac('sha256', secret).update(data).digest('base64url');
  const signatureBuffer = Buffer.from(signature);
  const expectedBuffer = Buffer.from(expectedSignature);
  if (
    signatureBuffer.length !== expectedBuffer.length ||
    !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
  ) {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(data, 'base64url').toString('utf8')) as PrivacyDeletionToken;
    if (
      parsed.purpose !== 'privacy-deletion' ||
      typeof parsed.userId !== 'string' ||
      !/^\d{15,22}$/.test(parsed.userId) ||
      !Number.isFinite(parsed.expiresAt) ||
      parsed.expiresAt <= nowMs
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}
