import { IncomingHttpHeaders } from 'http';

export function firstForwardedIp(
  value: string | string[] | undefined,
): string | undefined {
  const raw = Array.isArray(value) ? value[0] : value;
  if (typeof raw !== 'string') return undefined;
  const ip = raw.split(',')[0]?.trim();
  return ip || undefined;
}

/**
 * IP real del cliente detrás de Cloudflare / nginx.
 * CF-Connecting-IP la sobreescribe Cloudflare; no usar solo X-Forwarded-For
 * (el visitante puede prefijar IPs falsas).
 */
export function getClientIpFromHeaders(
  headers: IncomingHttpHeaders,
  fallback?: string,
): string | undefined {
  return (
    firstForwardedIp(headers['cf-connecting-ip']) ||
    firstForwardedIp(headers['true-client-ip']) ||
    firstForwardedIp(headers['x-real-ip']) ||
    firstForwardedIp(headers['x-forwarded-for']) ||
    fallback
  );
}
