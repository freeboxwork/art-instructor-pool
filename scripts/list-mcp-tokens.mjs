import { neon } from "@neondatabase/serverless";

import { requireDatabaseUrl } from "./load-local-env.mjs";

const sql = neon(requireDatabaseUrl());
const rows = await sql`
  SELECT
    name,
    token_prefix,
    scopes,
    created_at,
    last_used_at,
    expires_at,
    revoked_at
  FROM mcp_access_tokens
  ORDER BY created_at DESC
`;

console.table(rows.map((row) => ({
  name: row.name,
  prefix: row.token_prefix,
  scopes: row.scopes.join(", "),
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at || "-",
  expiresAt: row.expires_at || "-",
  status: row.revoked_at ? "revoked" : "active",
})));
