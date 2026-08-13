import { requireAdmin } from "../../lib/admin-auth.js";
import { getDb } from "../../lib/db.js";
import { allowMethods, sendJson } from "../../lib/http.js";

const EXPERIMENT_KEY = "mobile_design_v1";
const EXPERIMENT_NAME = "모바일 등록 화면 간소화";
const ALLOWED_RANGES = new Set([7, 30, 90]);
const SAFE_FILTER_PATTERN = /^[a-zA-Z0-9가-힣._-]{1,80}$/;

function parseRange(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_RANGES.has(parsed) ? parsed : 30;
}

function parseFilter(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SAFE_FILTER_PATTERN.test(trimmed) ? trimmed : "";
}

function percentage(numerator, denominator) {
  return denominator > 0 ? Math.round((numerator / denominator) * 1000) / 10 : 0;
}

export function buildExperimentComparison(rows) {
  const empty = {
    exposures: 0,
    ctaClicks: 0,
    formStarts: 0,
    submitClicks: 0,
    registrations: 0,
    validationFailures: 0,
    registrationFailures: 0,
  };
  const variants = { A: { ...empty }, B: { ...empty } };

  for (const row of rows) {
    if (!variants[row.variant]) continue;
    variants[row.variant] = {
      exposures: Number(row.exposures || 0),
      ctaClicks: Number(row.cta_clicks || 0),
      formStarts: Number(row.form_starts || 0),
      submitClicks: Number(row.submit_clicks || 0),
      registrations: Number(row.registrations || 0),
      validationFailures: Number(row.validation_failures || 0),
      registrationFailures: Number(row.registration_failures || 0),
    };
  }

  for (const variant of Object.values(variants)) {
    variant.ctaRate = percentage(variant.ctaClicks, variant.exposures);
    variant.startRate = percentage(variant.formStarts, variant.exposures);
    variant.conversionRate = percentage(variant.registrations, variant.exposures);
    variant.startToCompleteRate = percentage(variant.registrations, variant.formStarts);
    variant.validationFailureRate = percentage(variant.validationFailures, variant.formStarts);
    variant.apiFailureRate = percentage(variant.registrationFailures, variant.submitClicks);
  }

  const absoluteLift = Math.round(
    (variants.B.conversionRate - variants.A.conversionRate) * 10,
  ) / 10;
  const relativeLift = variants.A.conversionRate > 0
    ? Math.round(((variants.B.conversionRate - variants.A.conversionRate) / variants.A.conversionRate) * 1000) / 10
    : null;
  const hasMinimumSample = variants.A.exposures >= 100
    && variants.B.exposures >= 100
    && variants.A.registrations >= 10
    && variants.B.registrations >= 10;

  return {
    variants,
    lift: {
      absolutePercentagePoints: absoluteLift,
      relativePercent: relativeLift,
    },
    decisionStatus: hasMinimumSample ? "review" : "insufficient_data",
  };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  const days = parseRange(req.query?.days);
  const source = parseFilter(req.query?.source);
  const campaign = parseFilter(req.query?.campaign);
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
    const [summaryRows, dailyRows, acquisitionRows, optionRows, qualityRows] = await Promise.all([
      sql`
        WITH exposures AS (
          SELECT DISTINCT ON (visitor_key)
            visitor_key,
            experiment_variant AS variant,
            created_at AS exposed_at,
            coalesce(nullif(properties ->> 'utmSource', ''), '직접 방문') AS source,
            coalesce(nullif(properties ->> 'utmMedium', ''), '미지정') AS medium,
            coalesce(nullif(properties ->> 'utmCampaign', ''), '미지정') AS campaign
          FROM analytics_events
          WHERE created_at >= ${periodStart}::timestamptz
            AND event_name = 'intro_view'
            AND experiment_key = ${EXPERIMENT_KEY}
            AND experiment_variant IN ('A', 'B')
            AND assignment_method = 'random'
            AND visitor_key IS NOT NULL
          ORDER BY visitor_key, created_at ASC
        ), filtered_exposures AS (
          SELECT *
          FROM exposures
          WHERE (${source} = '' OR source = ${source})
            AND (${campaign} = '' OR campaign = ${campaign})
        ), outcomes AS (
          SELECT
            exposure.visitor_key,
            exposure.variant,
            coalesce(bool_or(event.event_name = 'intro_cta_clicked'), false) AS cta_clicked,
            coalesce(bool_or(event.event_name = 'registration_started'), false) AS form_started,
            coalesce(bool_or(event.event_name = 'registration_submit_clicked'), false) AS submit_clicked,
            coalesce(bool_or(event.event_name = 'registration_succeeded'), false) AS registered,
            coalesce(bool_or(event.event_name = 'registration_validation_failed'), false) AS validation_failed,
            coalesce(bool_or(event.event_name = 'registration_failed'), false) AS registration_failed
          FROM filtered_exposures AS exposure
          LEFT JOIN analytics_events AS event
            ON event.visitor_key = exposure.visitor_key
            AND event.experiment_key = ${EXPERIMENT_KEY}
            AND event.experiment_variant = exposure.variant
            AND event.assignment_method = 'random'
            AND event.created_at >= exposure.exposed_at
            AND event.created_at < exposure.exposed_at + interval '7 days'
          GROUP BY exposure.visitor_key, exposure.variant
        )
        SELECT
          variant,
          count(*)::int AS exposures,
          count(*) FILTER (WHERE cta_clicked)::int AS cta_clicks,
          count(*) FILTER (WHERE form_started)::int AS form_starts,
          count(*) FILTER (WHERE submit_clicked)::int AS submit_clicks,
          count(*) FILTER (WHERE registered)::int AS registrations,
          count(*) FILTER (WHERE validation_failed)::int AS validation_failures,
          count(*) FILTER (WHERE registration_failed)::int AS registration_failures
        FROM outcomes
        GROUP BY variant
        ORDER BY variant
      `,
      sql`
        WITH calendar AS (
          SELECT generate_series(
            timezone('Asia/Seoul', now())::date - (${days}::int - 1),
            timezone('Asia/Seoul', now())::date,
            interval '1 day'
          )::date AS exposure_date
        ), variants AS (
          SELECT unnest(ARRAY['A', 'B']) AS variant
        ), exposures AS (
          SELECT DISTINCT ON (visitor_key)
            visitor_key,
            experiment_variant AS variant,
            created_at AS exposed_at,
            timezone('Asia/Seoul', created_at)::date AS exposure_date,
            coalesce(nullif(properties ->> 'utmSource', ''), '직접 방문') AS source,
            coalesce(nullif(properties ->> 'utmCampaign', ''), '미지정') AS campaign
          FROM analytics_events
          WHERE created_at >= ${periodStart}::timestamptz
            AND event_name = 'intro_view'
            AND experiment_key = ${EXPERIMENT_KEY}
            AND experiment_variant IN ('A', 'B')
            AND assignment_method = 'random'
            AND visitor_key IS NOT NULL
          ORDER BY visitor_key, created_at ASC
        ), filtered_exposures AS (
          SELECT *
          FROM exposures
          WHERE (${source} = '' OR source = ${source})
            AND (${campaign} = '' OR campaign = ${campaign})
        ), outcomes AS (
          SELECT
            exposure.visitor_key,
            exposure.variant,
            exposure.exposure_date,
            coalesce(bool_or(event.event_name = 'registration_succeeded'), false) AS registered
          FROM filtered_exposures AS exposure
          LEFT JOIN analytics_events AS event
            ON event.visitor_key = exposure.visitor_key
            AND event.experiment_key = ${EXPERIMENT_KEY}
            AND event.experiment_variant = exposure.variant
            AND event.assignment_method = 'random'
            AND event.created_at >= exposure.exposed_at
            AND event.created_at < exposure.exposed_at + interval '7 days'
          GROUP BY exposure.visitor_key, exposure.variant, exposure.exposure_date
        ), totals AS (
          SELECT
            exposure_date,
            variant,
            count(*)::int AS exposures,
            count(*) FILTER (WHERE registered)::int AS registrations
          FROM outcomes
          GROUP BY exposure_date, variant
        )
        SELECT
          to_char(calendar.exposure_date, 'YYYY-MM-DD') AS date,
          variants.variant,
          coalesce(totals.exposures, 0)::int AS exposures,
          coalesce(totals.registrations, 0)::int AS registrations
        FROM calendar
        CROSS JOIN variants
        LEFT JOIN totals USING (exposure_date, variant)
        ORDER BY calendar.exposure_date ASC, variants.variant ASC
      `,
      sql`
        WITH exposures AS (
          SELECT DISTINCT ON (visitor_key)
            visitor_key,
            experiment_variant AS variant,
            created_at AS exposed_at,
            coalesce(nullif(properties ->> 'utmSource', ''), '직접 방문') AS source,
            coalesce(nullif(properties ->> 'utmMedium', ''), '미지정') AS medium,
            coalesce(nullif(properties ->> 'utmCampaign', ''), '미지정') AS campaign
          FROM analytics_events
          WHERE created_at >= ${periodStart}::timestamptz
            AND event_name = 'intro_view'
            AND experiment_key = ${EXPERIMENT_KEY}
            AND experiment_variant IN ('A', 'B')
            AND assignment_method = 'random'
            AND visitor_key IS NOT NULL
          ORDER BY visitor_key, created_at ASC
        ), outcomes AS (
          SELECT
            exposure.visitor_key,
            exposure.variant,
            exposure.source,
            exposure.medium,
            exposure.campaign,
            coalesce(bool_or(event.event_name = 'registration_succeeded'), false) AS registered
          FROM exposures AS exposure
          LEFT JOIN analytics_events AS event
            ON event.visitor_key = exposure.visitor_key
            AND event.experiment_key = ${EXPERIMENT_KEY}
            AND event.experiment_variant = exposure.variant
            AND event.assignment_method = 'random'
            AND event.created_at >= exposure.exposed_at
            AND event.created_at < exposure.exposed_at + interval '7 days'
          WHERE (${source} = '' OR exposure.source = ${source})
            AND (${campaign} = '' OR exposure.campaign = ${campaign})
          GROUP BY
            exposure.visitor_key,
            exposure.variant,
            exposure.source,
            exposure.medium,
            exposure.campaign
        )
        SELECT
          source,
          medium,
          campaign,
          variant,
          count(*)::int AS exposures,
          count(*) FILTER (WHERE registered)::int AS registrations
        FROM outcomes
        GROUP BY source, medium, campaign, variant
        ORDER BY sum(count(*)) OVER (PARTITION BY source, medium, campaign) DESC,
          campaign ASC,
          variant ASC
        LIMIT 40
      `,
      sql`
        SELECT DISTINCT
          coalesce(nullif(properties ->> 'utmSource', ''), '직접 방문') AS source,
          coalesce(nullif(properties ->> 'utmCampaign', ''), '미지정') AS campaign
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
          AND event_name = 'intro_view'
          AND experiment_key = ${EXPERIMENT_KEY}
          AND assignment_method = 'random'
          AND visitor_key IS NOT NULL
        ORDER BY source ASC, campaign ASC
      `,
      sql`
        SELECT
          count(DISTINCT visitor_key) FILTER (
            WHERE event_name = 'intro_view'
              AND experiment_key = ${EXPERIMENT_KEY}
              AND assignment_method = 'override'
          )::int AS override_visitors,
          count(DISTINCT session_key) FILTER (
            WHERE event_name = 'intro_view'
              AND experiment_key IS NULL
          )::int AS legacy_sessions,
          (
            SELECT count(*)::int
            FROM (
              SELECT visitor_key
              FROM analytics_events
              WHERE created_at >= ${periodStart}::timestamptz
                AND experiment_key = ${EXPERIMENT_KEY}
                AND assignment_method = 'random'
                AND visitor_key IS NOT NULL
              GROUP BY visitor_key
              HAVING count(DISTINCT experiment_variant) > 1
            ) AS conflicts
          ) AS conflicting_visitors
        FROM analytics_events
        WHERE created_at >= ${periodStart}::timestamptz
      `,
    ]);

    const comparison = buildExperimentComparison(summaryRows);
    const optionSources = [...new Set(optionRows.map((row) => row.source))];
    const optionCampaigns = [...new Set(optionRows.map((row) => row.campaign))];

    sendJson(res, 200, {
      experiment: {
        key: EXPERIMENT_KEY,
        name: EXPERIMENT_NAME,
        status: "active",
        allocation: { A: 50, B: 50 },
        labels: {
          A: "A안 · 기존 상세형",
          B: "B안 · 간소화형",
        },
        conversionWindowDays: 7,
      },
      rangeDays: days,
      filters: {
        selected: { source, campaign },
        options: { sources: optionSources, campaigns: optionCampaigns },
      },
      comparison,
      daily: dailyRows,
      acquisition: acquisitionRows.map((row) => ({
        source: row.source,
        medium: row.medium,
        campaign: row.campaign,
        variant: row.variant,
        exposures: Number(row.exposures || 0),
        registrations: Number(row.registrations || 0),
        conversionRate: percentage(Number(row.registrations || 0), Number(row.exposures || 0)),
      })),
      quality: {
        overrideVisitors: Number(qualityRows[0]?.override_visitors || 0),
        legacySessions: Number(qualityRows[0]?.legacy_sessions || 0),
        conflictingVisitors: Number(qualityRows[0]?.conflicting_visitors || 0),
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("admin_experiments_failed", error);
    sendJson(res, 500, { error: "A/B 테스트 분석 정보를 불러오지 못했습니다." });
  }
}
