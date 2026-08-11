import { neon } from "@neondatabase/serverless";

import { requireDatabaseUrl } from "./load-local-env.mjs";

function getArgument(name) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

const tokenPrefix = getArgument("--prefix")?.trim();
if (!tokenPrefix || tokenPrefix.length < 9 || tokenPrefix.length > 32) {
  throw new Error("--prefix에 발급 시 표시된 토큰 접두사를 입력해 주세요.");
}

const sql = neon(requireDatabaseUrl());
const rows = await sql`
  UPDATE mcp_access_tokens
  SET revoked_at = now()
  WHERE token_prefix = ${tokenPrefix}
    AND revoked_at IS NULL
  RETURNING id, name, token_prefix
`;

if (rows.length === 0) {
  throw new Error("활성 상태인 해당 토큰을 찾지 못했습니다.");
}

console.log(`Revoked MCP token: ${rows[0].name} (${rows[0].token_prefix})`);
