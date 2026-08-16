const MAX_BEARER_TOKEN_LENGTH = 8_192;

export function extractBearerToken(header: string | null): string | null {
  if (!header || header.length > MAX_BEARER_TOKEN_LENGTH + 16) return null;
  const match = /^Bearer[\t ]+(\S+)$/i.exec(header);
  return match?.[1] && match[1].length <= MAX_BEARER_TOKEN_LENGTH ? match[1] : null;
}
