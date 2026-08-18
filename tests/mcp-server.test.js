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

function createAbAnalyticsSql() {
  const queries = [];
  const sql = (strings, ...values) => {
    const query = strings.join("");
    queries.push({ query, values });

    if (query.includes("INSERT INTO mcp_access_logs")) return [];
    if (query.includes("count(*) FILTER (WHERE cta_clicked)::int AS cta_clicks")) {
      return [
        {
          variant: "A",
          exposures: 100,
          cta_clicks: 60,
          form_starts: 50,
          submit_clicks: 30,
          registrations: 20,
          validation_failures: 5,
          registration_failures: 1,
        },
        {
          variant: "B",
          exposures: 100,
          cta_clicks: 70,
          form_starts: 60,
          submit_clicks: 45,
          registrations: 30,
          validation_failures: 3,
          registration_failures: 0,
        },
      ];
    }
    if (query.includes("CROSS JOIN variants")) {
      return [
        { date: "2026-08-14", variant: "A", exposures: 4, registrations: 1 },
        { date: "2026-08-14", variant: "B", exposures: 5, registrations: 2 },
      ];
    }
    if (query.includes("GROUP BY source, medium, campaign, variant")) {
      return [{
        source: "kakaotalk",
        medium: "group_chat",
        campaign: "미술인모임",
        variant: "B",
        exposures: 5,
        registrations: 2,
      }];
    }
    if (query.includes("SELECT DISTINCT") && query.includes("AS campaign")) {
      return [{ source: "kakaotalk", campaign: "미술인모임" }];
    }
    if (query.includes("AS override_visitors")) {
      return [{ override_visitors: 1, legacy_sessions: 2, conflicting_visitors: 0 }];
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
  assert.equal(tools.length, 8);
  tools.forEach((tool) => {
    assert.equal(tool.annotations.readOnlyHint, true);
    assert.equal(tool.annotations.destructiveHint, false);
  });

  await server.close();
});

test("A/B 테스트 도구가 버전별 전환과 UTM 성과를 반환한다", async () => {
  const { sql, queries } = createAbAnalyticsSql();
  const server = createArtInstructorMcpServer({
    sql,
    accessTokenId: "token-id",
    scopes: ["analytics:read"],
  });
  const tool = server._registeredTools.get_ab_test_report;

  const result = await tool.handler({
    days: 30,
    source: "kakaotalk",
    campaign: "미술인모임",
  });
  const data = result.structuredContent.data;

  assert.equal(data.comparison.variants.A.conversionRate, 20);
  assert.equal(data.comparison.variants.B.conversionRate, 30);
  assert.equal(data.comparison.lift.absolutePercentagePoints, 10);
  assert.equal(data.daily[1].registrations, 2);
  assert.equal(data.acquisition[0].conversionRate, 40);
  assert.deepEqual(data.filters.selected, {
    source: "kakaotalk",
    campaign: "미술인모임",
  });
  assert.equal(
    queries.filter(({ query }) => query.includes("INSERT INTO mcp_access_logs")).length,
    1,
  );

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
