import assert from "node:assert/strict";
import test from "node:test";

import {
  createMcpToken,
  extractBearerToken,
  getMcpTokenPrefix,
  hashMcpToken,
  verifyMcpAccessToken,
} from "../lib/mcp-auth.js";

test("MCP 토큰은 충분한 엔트로피와 고정 접두사를 사용한다", () => {
  const first = createMcpToken();
  const second = createMcpToken();

  assert.match(first, /^aip_mcp_[A-Za-z0-9_-]{43}$/);
  assert.notEqual(first, second);
  assert.equal(getMcpTokenPrefix(first), first.slice(0, 16));
  assert.equal(hashMcpToken(first).length, 64);
  assert.notEqual(hashMcpToken(first), first);
});

test("Bearer 헤더는 유효한 MCP 토큰만 허용한다", () => {
  const token = createMcpToken();

  assert.equal(extractBearerToken(`Bearer ${token}`), token);
  assert.equal(extractBearerToken(`bearer ${token}`), token);
  assert.equal(extractBearerToken(token), null);
  assert.equal(extractBearerToken("Bearer invalid"), null);
  assert.equal(extractBearerToken(undefined), null);
});

test("검증 시 원문이 아닌 토큰 해시로 활성 토큰을 조회한다", async () => {
  const token = createMcpToken();
  let capturedHash;
  const sql = (strings, value) => {
    assert.match(strings.join(""), /UPDATE mcp_access_tokens/);
    capturedHash = value;
    return [{
      id: "token-id",
      name: "테스트 사용자",
      token_prefix: getMcpTokenPrefix(token),
      scopes: ["analytics:read"],
      expires_at: null,
    }];
  };

  const access = await verifyMcpAccessToken(sql, `Bearer ${token}`);

  assert.equal(capturedHash, hashMcpToken(token));
  assert.equal(access.id, "token-id");
  assert.deepEqual(access.scopes, ["analytics:read"]);
});
