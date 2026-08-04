import { requireAdmin } from "../../lib/admin-auth.js";
import { getDb } from "../../lib/db.js";
import { allowMethods, sendJson } from "../../lib/http.js";

const ALLOWED_RANGES = new Set([7, 30, 90]);

function parseRange(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_RANGES.has(parsed) ? parsed : 30;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

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

    const [summaryRows, funnelRows, dailyRows, pageRows, sourceRows] = await Promise.all([
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
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("admin_analytics_failed", error);
    sendJson(res, 500, { error: "분석 정보를 불러오지 못했습니다." });
  }
}
