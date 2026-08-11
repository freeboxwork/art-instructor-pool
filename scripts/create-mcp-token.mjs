import { neon } from "@neondatabase/serverless";

import {
  createMcpToken,
  getMcpTokenPrefix,
  hashMcpToken,
} from "../lib/mcp-auth.js";
import { requireDatabaseUrl } from "./load-local-env.mjs";

const ALLOWED_SCOPES = new Set(["analytics:read", "registrations:read"]);

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const name = getArgument("--name")?.trim();
if (!name || name.length > 100) {
  throw new Error('--name에 1~100자의 사용자 또는 팀 이름을 입력해 주세요.');
}

const requestedScopes = (getArgument("--scopes") || "analytics:read,registrations:read")
  .split(",")
  .map((scope) => scope.trim())
  .filter(Boolean);

if (
  requestedScopes.length === 0
  || requestedScopes.some((scope) => !ALLOWED_SCOPES.has(scope))
) {
  throw new Error("--scopes는 analytics:read, registrations:read만 사용할 수 있습니다.");
}

const expiresDaysValue = getArgument("--expires-days");
const expiresDays = expiresDaysValue === undefined
  ? null
  : Number.parseInt(expiresDaysValue, 10);
if (expiresDays !== null && (!Number.isInteger(expiresDays) || expiresDays < 1)) {
  throw new Error("--expires-days는 1 이상의 정수여야 합니다.");
}

const token = createMcpToken();
const tokenHash = hashMcpToken(token);
const tokenPrefix = getMcpTokenPrefix(token);
const expiresAt = expiresDays === null
  ? null
  : new Date(Date.now() + expiresDays * 24 * 60 * 60 * 1000).toISOString();
const scopeArrayLiteral = `{${requestedScopes.join(",")}}`;
const sql = neon(requireDatabaseUrl());

await sql`
  INSERT INTO mcp_access_tokens (
    name,
    token_prefix,
    token_hash,
    scopes,
    expires_at
  ) VALUES (
    ${name},
    ${tokenPrefix},
    ${tokenHash},
    ${scopeArrayLiteral}::text[],
    ${expiresAt}::timestamptz
  )
`;

// The raw token is intentionally printed once and is never stored in the database.
process.stdout.write(token);
