import { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";

import {
  aggregateRegistrations,
  getAbTestReport,
  getAcquisitionReport,
  getAnalyticsOverview,
  getDailyAnalytics,
  getRegistrationByEmail,
  getRegistrationSummary,
  listRegistrations,
} from "./mcp-data.js";

const analyticsRangeSchema = z.union([
  z.literal(7),
  z.literal(30),
  z.literal(90),
]).default(30).describe("조회 기간. 7일, 30일, 90일 중 하나");

const dateSchema = z.string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .describe("YYYY-MM-DD 형식의 한국 날짜");

const registrationFilterShape = {
  region: z.string().min(1).max(50).optional(),
  career: z.enum(["경력 없음", "1년 미만", "1~3년", "3년 이상"]).optional(),
  jobSeeking: z.enum(["현재 구직중", "향후 구직 의향 있음", "구직 의향 없음"]).optional(),
  status: z.enum(["active", "unsubscribed"]).optional(),
  canTeachChildren: z.boolean().optional(),
  email: z.string().min(1).max(254).optional()
    .describe("이메일 전체 또는 일부 문자열"),
  text: z.string().min(1).max(100).optional()
    .describe("전공, 수업 분야, 자격, 기타사항에서 찾을 문자열"),
  createdFrom: dateSchema.optional(),
  createdTo: dateSchema.optional(),
};

function toToolResult(data) {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    structuredContent: { data },
  };
}

async function writeAuditLog(sql, tokenId, toolName, success, startedAt) {
  if (!tokenId) return;

  try {
    await sql`
      INSERT INTO mcp_access_logs (
        token_id,
        tool_name,
        success,
        duration_ms
      ) VALUES (
        ${tokenId},
        ${toolName},
        ${success},
        ${Math.max(0, Date.now() - startedAt)}
      )
    `;
  } catch (error) {
    console.error("mcp_audit_log_failed", { toolName, error });
  }
}

function registerReadOnlyTool(server, context, definition, handler) {
  server.registerTool(
    definition.name,
    {
      title: definition.title,
      description: definition.description,
      inputSchema: definition.inputSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      },
    },
    async (input) => {
      const startedAt = Date.now();

      if (!context.scopes.includes(definition.scope)) {
        await writeAuditLog(
          context.sql,
          context.accessTokenId,
          definition.name,
          false,
          startedAt,
        );
        return {
          content: [{
            type: "text",
            text: `이 토큰에는 ${definition.scope} 권한이 없습니다.`,
          }],
          isError: true,
        };
      }

      try {
        const data = await handler(input);
        await writeAuditLog(
          context.sql,
          context.accessTokenId,
          definition.name,
          true,
          startedAt,
        );
        return toToolResult(data);
      } catch (error) {
        console.error("mcp_tool_failed", { toolName: definition.name, error });
        await writeAuditLog(
          context.sql,
          context.accessTokenId,
          definition.name,
          false,
          startedAt,
        );
        return {
          content: [{
            type: "text",
            text: "데이터를 조회하지 못했습니다. 잠시 후 다시 시도해 주세요.",
          }],
          isError: true,
        };
      }
    },
  );
}

export function createArtInstructorMcpServer({
  sql,
  accessTokenId,
  scopes = [],
}) {
  const server = new McpServer(
    {
      name: "art-instructor-data",
      version: "0.1.0",
    },
    {
      capabilities: { tools: {} },
      instructions: [
        "예비 미술 강사 인력풀의 등록자와 익명 사이트 분석 데이터를 조회하는 읽기 전용 서버입니다.",
        "기간 수치는 한국 시간(Asia/Seoul)을 기준으로 설명하세요.",
        "이메일 등 개인정보는 사용자가 명시적으로 요청한 업무에만 사용하고 답변에 불필요하게 노출하지 마세요.",
        "데이터에 없는 사실은 추측하지 말고, 사용한 조회 기간과 필터를 함께 밝혀 주세요.",
      ].join(" "),
    },
  );

  const context = { sql, accessTokenId, scopes };

  registerReadOnlyTool(server, context, {
    name: "get_analytics_overview",
    title: "사이트 분석 요약 조회",
    description: "최근 7·30·90일의 방문 세션, 페이지 조회, CTA, 등록 완료, 전환 퍼널을 조회합니다.",
    scope: "analytics:read",
    inputSchema: { days: analyticsRangeSchema },
  }, ({ days }) => getAnalyticsOverview(sql, days));

  registerReadOnlyTool(server, context, {
    name: "get_daily_analytics",
    title: "일별 분석 추이 조회",
    description: "날짜별 방문자, CTA 클릭, 등록 완료 건수를 한국 시간 기준으로 조회합니다.",
    scope: "analytics:read",
    inputSchema: { days: analyticsRangeSchema },
  }, ({ days }) => getDailyAnalytics(sql, days));

  registerReadOnlyTool(server, context, {
    name: "get_acquisition_report",
    title: "유입 및 캠페인 조회",
    description: "UTM source·medium·campaign과 리퍼러를 기준으로 유입 세션을 조회합니다.",
    scope: "analytics:read",
    inputSchema: { days: analyticsRangeSchema },
  }, ({ days }) => getAcquisitionReport(sql, days));

  registerReadOnlyTool(server, context, {
    name: "get_ab_test_report",
    title: "A/B 테스트 분석 조회",
    description: "A안과 B안의 노출, CTA, 폼 시작, 등록 완료, 전환율, 상승폭, 일별 추이와 UTM별 성과를 조회합니다.",
    scope: "analytics:read",
    inputSchema: {
      days: analyticsRangeSchema,
      source: z.string().trim().min(1).max(80).optional()
        .describe("선택적인 UTM 유입 소스 필터"),
      campaign: z.string().trim().min(1).max(80).optional()
        .describe("선택적인 UTM 캠페인 필터"),
    },
  }, (input) => getAbTestReport(sql, input));

  registerReadOnlyTool(server, context, {
    name: "get_registration_summary",
    title: "등록자 현황 조회",
    description: "전체 등록자 수와 활성·동의·최근 등록 수, 지역·경력·구직 여부 분포를 조회합니다.",
    scope: "registrations:read",
    inputSchema: {},
  }, () => getRegistrationSummary(sql));

  registerReadOnlyTool(server, context, {
    name: "list_registrations",
    title: "등록자 목록 조회",
    description: "조건에 맞는 등록자 목록을 페이지 단위로 조회합니다. 이메일 등 개인정보가 포함됩니다.",
    scope: "registrations:read",
    inputSchema: {
      ...registrationFilterShape,
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(15),
    },
  }, (input) => listRegistrations(sql, input));

  registerReadOnlyTool(server, context, {
    name: "get_registration_by_email",
    title: "이메일로 등록자 상세 조회",
    description: "정확한 이메일 주소로 한 명의 등록자 상세와 등록 당시 유입 경로·UTM·A/B 배정 정보를 조회합니다.",
    scope: "registrations:read",
    inputSchema: { email: z.email().max(254) },
  }, ({ email }) => getRegistrationByEmail(sql, email));

  registerReadOnlyTool(server, context, {
    name: "aggregate_registrations",
    title: "등록자 조건별 집계",
    description: "등록자를 지역·전공·수업 분야·경력·자격·구직 여부·수업 여부·상태·등록일 기준으로 집계합니다.",
    scope: "registrations:read",
    inputSchema: {
      ...registrationFilterShape,
      groupBy: z.enum([
        "region",
        "major",
        "teachingSubject",
        "career",
        "certification",
        "jobSeeking",
        "courseInterest",
        "canTeachChildren",
        "status",
        "registrationDate",
      ]).default("region"),
    },
  }, (input) => aggregateRegistrations(sql, input));

  return server;
}
