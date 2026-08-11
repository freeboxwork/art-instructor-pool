import { requireAdmin } from "../../lib/admin-auth.js";
import { getDb } from "../../lib/db.js";
import {
  allowMethods,
  isSameOrigin,
  readJsonBody,
  sendJson,
} from "../../lib/http.js";

const ALLOWED_RANGES = new Set([7, 30, 90]);

function parseRange(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_RANGES.has(parsed) ? parsed : 30;
}

export function hasValidDeleteConfirmation(value) {
  return typeof value === "string" && value.trim() === "delete";
}

export async function deleteAnalyticsEvents(sql) {
  const rows = await sql`
    WITH deleted AS (
      DELETE FROM analytics_events
      RETURNING 1
    )
    SELECT count(*)::int AS deleted_events
    FROM deleted
  `;

  return Number(rows[0]?.deleted_events || 0);
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === "DELETE") {
    if (!isSameOrigin(req)) {
      sendJson(res, 403, { error: "허용되지 않은 요청입니다." });
      return;
    }

    const body = readJsonBody(req);
    if (!hasValidDeleteConfirmation(body?.confirmation)) {
      sendJson(res, 400, { error: "전체 삭제를 확인하려면 delete를 정확히 입력해 주세요." });
      return;
    }
  }

  const days = parseRange(req.query?.days);
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const nowInKst = new Date(Date.now() + kstOffsetMs);
  const periodStart = new Date(
    Date.UTC(
      nowInKst.getUTCFullYear(),
      nowInKst.getUTCMonth(),
      nowInKst.getUTCDate() - (days - 1),
    ) - kstOffsetMs,
  ).toISOString();

  try {
    const sql = getDb();

    if (req.method === "DELETE") {
      const deletedEvents = await deleteAnalyticsEvents(sql);
      sendJson(res, 200, { ok: true, deletedEvents });
      return;
    }

    const [summaryRows, funnelRows, dailyRows, pageRows, sourceRows, campaignRows] = await Promise.all([
      sql`
        SELECT
          count(*) FILTER (WHERE event_name IN ('intro_view', 'register_view', 'complete_view'))::int AS page_views,
          count(DISTINCT session_key) FILTER (WHERE event_name IN ('intro_view', 'register_view', 'complete_view'))::int AS visit_sessions,
          count(DISTINCT session_key) FILTER (WHERE event_name = 'intro_cta_clicked')::int AS cta_clicks,
          count(DISTINCT session_key) FILTER (WHERE event_name = 'registration_succeeded')::int AS registrations
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
      `,
      sql`
        SELECT event_name, count(DISTINCT session_key)::int AS count
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
          AND event_name IN (
            'intro_view',
            'intro_cta_clicked',
            'registration_started',
            'registration_succeeded'
          )
        GROUP BY event_name
      `,
      sql`
        WITH calendar AS (
          SELECT generate_series(
            timezone('Asia/Seoul', now())::date - (${days}::int - 1),
            timezone('Asia/Seoul', now())::date,
            interval '1 day'
          )::date AS event_date
        ), totals AS (
          SELECT
            timezone('Asia/Seoul', created_at)::date AS event_date,
            count(DISTINCT session_key) FILTER (
              WHERE event_name IN ('intro_view', 'register_view', 'complete_view')
            )::int AS sessions,
            count(DISTINCT session_key) FILTER (
              WHERE event_name = 'intro_cta_clicked'
            )::int AS cta_clicks,
            count(DISTINCT session_key) FILTER (
              WHERE event_name = 'registration_succeeded'
            )::int AS registrations
          FROM analytics_events
          WHERE created_at >= ${periodStart}::timestamptz
          GROUP BY event_date
        )
        SELECT
          to_char(calendar.event_date, 'YYYY-MM-DD') AS date,
          coalesce(totals.sessions, 0)::int AS sessions,
          coalesce(totals.cta_clicks, 0)::int AS cta_clicks,
          coalesce(totals.registrations, 0)::int AS registrations
        FROM calendar
        LEFT JOIN totals USING (event_date)
        ORDER BY calendar.event_date ASC
      `,
      sql`
        SELECT
          event_name,
          count(*)::int AS views,
          count(DISTINCT session_key)::int AS sessions
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
          AND event_name IN ('intro_view', 'register_view', 'complete_view')
        GROUP BY event_name
        ORDER BY CASE event_name
          WHEN 'intro_view' THEN 1
          WHEN 'register_view' THEN 2
          WHEN 'complete_view' THEN 3
          ELSE 4
        END
      `,
      sql`
        SELECT
          CASE
            WHEN nullif(properties ->> 'utmSource', '') IS NOT NULL
              THEN properties ->> 'utmSource'
            WHEN nullif(properties ->> 'referrerHost', '') IS NOT NULL
              THEN properties ->> 'referrerHost'
            ELSE '직접 방문'
          END AS label,
          count(DISTINCT session_key)::int AS sessions
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
          AND event_name = 'intro_view'
        GROUP BY label
        ORDER BY sessions DESC, label ASC
        LIMIT 8
      `,
      sql`
        SELECT
          properties ->> 'utmCampaign' AS campaign,
          coalesce(nullif(properties ->> 'utmSource', ''), '미지정') AS source,
          coalesce(nullif(properties ->> 'utmMedium', ''), '미지정') AS medium,
          count(DISTINCT session_key)::int AS sessions
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
          AND event_name = 'intro_view'
          AND nullif(properties ->> 'utmCampaign', '') IS NOT NULL
        GROUP BY 1, 2, 3
        ORDER BY sessions DESC, campaign ASC
        LIMIT 12
      `,
    ]);

    const summary = summaryRows[0];
    const funnelCounts = Object.fromEntries(funnelRows.map((row) => [row.event_name, row.count]));
    const introSessions = funnelCounts.intro_view || 0;
    const registrations = funnelCounts.registration_succeeded || 0;

    sendJson(res, 200, {
      rangeDays: days,
      summary: {
        visitSessions: summary.visit_sessions,
        pageViews: summary.page_views,
        ctaClicks: summary.cta_clicks,
        registrations: summary.registrations,
        conversionRate: introSessions > 0
          ? Math.round((registrations / introSessions) * 1000) / 10
          : 0,
      },
      funnel: [
        { event: "intro_view", label: "소개 페이지 방문", count: funnelCounts.intro_view || 0 },
        { event: "intro_cta_clicked", label: "등록 버튼 클릭", count: funnelCounts.intro_cta_clicked || 0 },
        { event: "registration_started", label: "폼 입력 시작", count: funnelCounts.registration_started || 0 },
        { event: "registration_succeeded", label: "등록 완료", count: registrations },
      ],
      daily: dailyRows,
      pages: pageRows.map((row) => ({
        event: row.event_name,
        views: row.views,
        sessions: row.sessions,
      })),
      sources: sourceRows,
      campaigns: campaignRows,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    const isDeleteRequest = req.method === "DELETE";
    console.error(isDeleteRequest ? "admin_analytics_delete_failed" : "admin_analytics_failed", error);
    sendJson(res, 500, {
      error: isDeleteRequest
        ? "방문 분석 데이터를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "분석 정보를 불러오지 못했습니다.",
    });
  }
}
