import crypto from "node:crypto";

const TOKEN_PREFIX = "aip_mcp_";
const TOKEN_PATTERN = /^aip_mcp_[A-Za-z0-9_-]{32,128}$/;

export function createMcpToken() {
  return `${TOKEN_PREFIX}${crypto.randomBytes(32).toString("base64url")}`;
}

export function hashMcpToken(token) {
  return crypto.createHash("sha256").update(String(token)).digest("hex");
}

export function getMcpTokenPrefix(token) {
  return String(token).slice(0, TOKEN_PREFIX.length + 8);
}

export function extractBearerToken(authorizationHeader) {
  const value = Array.isArray(authorizationHeader)
    ? authorizationHeader[0]
    : authorizationHeader;

  if (typeof value !== "string") return null;

  const match = value.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();
  return token && TOKEN_PATTERN.test(token) ? token : null;
}

export async function verifyMcpAccessToken(sql, authorizationHeader) {
  const token = extractBearerToken(authorizationHeader);
  if (!token) return null;

  const tokenHash = hashMcpToken(token);
  const rows = await sql`
    UPDATE mcp_access_tokens
    SET last_used_at = now()
    WHERE token_hash = ${tokenHash}
      AND revoked_at IS NULL
      AND (expires_at IS NULL OR expires_at > now())
    RETURNING id, name, token_prefix, scopes, expires_at
  `;

  if (rows.length === 0) return null;

  return {
    id: rows[0].id,
    name: rows[0].name,
    tokenPrefix: rows[0].token_prefix,
    scopes: Array.isArray(rows[0].scopes) ? rows[0].scopes : [],
    expiresAt: rows[0].expires_at,
  };
}
