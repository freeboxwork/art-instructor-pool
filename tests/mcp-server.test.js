import assert from "node:assert/strict";
import test from "node:test";

import { createArtInstructorMcpServer } from "../lib/mcp-server.js";

function createAnalyticsSql() {
  const queries = [];
  const sql = (strings) => {
    const query = strings.join("");
    queries.push(query);

    if (query.includes("INSERT INTO mcp_access_logs")) return [];
    if (query.includes("AS page_views")) {
      return [{
        page_views: 40,
        visit_sessions: 20,
        cta_clicks: 12,
        registrations: 8,
      }];
    }
    if (query.includes("count(DISTINCT session_key)::int AS count")) {
      return [
        { event_name: "intro_view", count: 20 },
        { event_name: "intro_cta_clicked", count: 12 },
        { event_name: "registration_started", count: 10 },
        { event_name: "registration_succeeded", count: 8 },
      ];
    }
    if (query.includes("count(*)::int AS views")) {
      return [{ event_name: "intro_view", views: 25, sessions: 20 }];
    }
    throw new Error(`Unexpected query: ${query}`);
  };
  return { sql, queries };
}

test("모든 MCP 도구는 읽기 전용으로 선언된다", async () => {
  const server = createArtInstructorMcpServer({
    sql: () => [],
    accessTokenId: "token-id",
    scopes: ["analytics:read", "registrations:read"],
  });

  const tools = Object.values(server._registeredTools);
  assert.equal(tools.length, 7);
  tools.forEach((tool) => {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  });

  await server.close();
});

test("분석 요약 도구가 구조화된 결과와 감사 로그를 반환한다", async () => {
  const { sql, queries } = createAnalyticsSql();
  const server = createArtInstructorMcpServer({
    sql,
    accessTokenId: "token-id",
    scopes: ["analytics:read"],
  });
  const tool = server._registeredTools.get_analytics_overview;

  const result = await tool.handler({ days: 30 });

  assert.equal(result.structuredContent.data.summary.visitSessions, 20);
  assert.equal(result.structuredContent.data.summary.conversionRate, 40);
  assert.match(result.content[0].text, /"registrations": 8/);
  assert.equal(
    queries.filter((query) => query.includes("INSERT INTO mcp_access_logs")).length,
    1,
  );

  await server.close();
});

test("필요 권한이 없는 토큰은 등록자 조회를 실행하지 않는다", async () => {
  const queries = [];
  const sql = (strings) => {
    queries.push(strings.join(""));
    return [];
  };
  const server = createArtInstructorMcpServer({
    sql,
    accessTokenId: "token-id",
    scopes: ["analytics:read"],
  });
  const tool = server._registeredTools.get_registration_summary;

  const result = await tool.handler({});

  assert.equal(result.isError, true);
  assert.match(result.content[0].text, /registrations:read/);
  assert.equal(queries.length, 1);
  assert.match(queries[0], /INSERT INTO mcp_access_logs/);

  await server.close();
});
