const ALLOWED_RANGES = new Set([7, 30, 90]);

export function normalizeAnalyticsRange(value) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return ALLOWED_RANGES.has(parsed) ? parsed : 30;
}

export function getKstPeriodStart(days, now = Date.now()) {
  const normalizedDays = normalizeAnalyticsRange(days);
  const kstOffsetMs = 9 * 60 * 60 * 1000;
  const nowInKst = new Date(now + kstOffsetMs);

  return new Date(
    Date.UTC(
      nowInKst.getUTCFullYear(),
      nowInKst.getUTCMonth(),
      nowInKst.getUTCDate() - (normalizedDays - 1),
    ) - kstOffsetMs,
  ).toISOString();
}

export async function getAnalyticsOverview(sql, days) {
  const rangeDays = normalizeAnalyticsRange(days);
  const periodStart = getKstPeriodStart(rangeDays);

  const [summaryRows, funnelRows, pageRows] = await Promise.all([
    sql`
      SELECT
        count(*) FILTER (
          WHERE event_name IN ('intro_view', 'register_view', 'complete_view')
        )::int AS page_views,
        count(DISTINCT session_key) FILTER (
          WHERE event_name IN ('intro_view', 'register_view', 'complete_view')
        )::int AS visit_sessions,
        count(DISTINCT session_key) FILTER (
          WHERE event_name = 'intro_cta_clicked'
        )::int AS cta_clicks,
        count(DISTINCT session_key) FILTER (
          WHERE event_name = 'registration_succeeded'
        )::int AS registrations
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
  ]);

  const summary = summaryRows[0] || {};
  const funnelCounts = Object.fromEntries(
    funnelRows.map((row) => [row.event_name, Number(row.count || 0)]),
  );
  const introSessions = funnelCounts.intro_view || 0;
  const registrations = funnelCounts.registration_succeeded || 0;

  return {
    rangeDays,
    summary: {
      visitSessions: Number(summary.visit_sessions || 0),
      pageViews: Number(summary.page_views || 0),
      ctaClicks: Number(summary.cta_clicks || 0),
      registrations: Number(summary.registrations || 0),
      conversionRate: introSessions > 0
        ? Math.round((registrations / introSessions) * 1000) / 10
        : 0,
    },
    funnel: [
      { event: "intro_view", label: "소개 페이지 방문", count: introSessions },
      {
        event: "intro_cta_clicked",
        label: "등록 버튼 클릭",
        count: funnelCounts.intro_cta_clicked || 0,
      },
      {
        event: "registration_started",
        label: "폼 입력 시작",
        count: funnelCounts.registration_started || 0,
      },
      { event: "registration_succeeded", label: "등록 완료", count: registrations },
    ],
    pages: pageRows.map((row) => ({
      event: row.event_name,
      views: Number(row.views || 0),
      sessions: Number(row.sessions || 0),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function getDailyAnalytics(sql, days) {
  const rangeDays = normalizeAnalyticsRange(days);
  const periodStart = getKstPeriodStart(rangeDays);
  const rows = await sql`
    WITH calendar AS (
      SELECT generate_series(
        timezone('Asia/Seoul', now())::date - (${rangeDays}::int - 1),
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
  `;

  return {
    rangeDays,
    daily: rows.map((row) => ({
      date: row.date,
      visitors: Number(row.sessions || 0),
      ctaClicks: Number(row.cta_clicks || 0),
      registrations: Number(row.registrations || 0),
    })),
    timezone: "Asia/Seoul",
    generatedAt: new Date().toISOString(),
  };
}

export async function getAcquisitionReport(sql, days) {
  const rangeDays = normalizeAnalyticsRange(days);
  const periodStart = getKstPeriodStart(rangeDays);
  const [sourceRows, campaignRows] = await Promise.all([
    sql`
      SELECT
        CASE
          WHEN nullif(properties ->> 'utmSource', '') IS NOT NULL
            THEN properties ->> 'utmSource'
          WHEN nullif(properties ->> 'referrerHost', '') IS NOT NULL
            THEN properties ->> 'referrerHost'
          ELSE '직접 방문'
        END AS source,
        count(DISTINCT session_key)::int AS sessions
      FROM analytics_events
      WHERE created_at >= ${periodStart}::timestamptz
        AND event_name = 'intro_view'
      GROUP BY source
      ORDER BY sessions DESC, source ASC
      LIMIT 50
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
      LIMIT 100
    `,
  ]);

  return {
    rangeDays,
    sources: sourceRows.map((row) => ({
      source: row.source,
      sessions: Number(row.sessions || 0),
    })),
    campaigns: campaignRows.map((row) => ({
      campaign: row.campaign,
      source: row.source,
      medium: row.medium,
      sessions: Number(row.sessions || 0),
    })),
    generatedAt: new Date().toISOString(),
  };
}

export async function getRegistrationSummary(sql) {
  const [summaryRows, regionRows, careerRows, jobSeekingRows] = await Promise.all([
    sql`
      SELECT
        count(*)::int AS total,
        count(*) FILTER (WHERE status = 'active')::int AS active,
        count(*) FILTER (WHERE email_opt_in = true)::int AS email_opt_in,
        count(*) FILTER (WHERE created_at >= now() - interval '7 days')::int AS recent_seven_days,
        count(*) FILTER (WHERE can_teach_children = true)::int AS child_teaching,
        count(DISTINCT region)::int AS regions
      FROM instructor_registrations
    `,
    sql`
      SELECT region AS label, count(*)::int AS count
      FROM instructor_registrations
      GROUP BY region
      ORDER BY count DESC, region ASC
    `,
    sql`
      SELECT coalesce(career_level, '미입력') AS label, count(*)::int AS count
      FROM instructor_registrations
      GROUP BY career_level
      ORDER BY count DESC, label ASC
    `,
    sql`
      SELECT coalesce(job_seeking, '미입력') AS label, count(*)::int AS count
      FROM instructor_registrations
      GROUP BY job_seeking
      ORDER BY count DESC, label ASC
    `,
  ]);

  const summary = summaryRows[0] || {};
  const mapDistribution = (rows) => rows.map((row) => ({
    label: row.label,
    count: Number(row.count || 0),
  }));

  return {
    summary: {
      total: Number(summary.total || 0),
      active: Number(summary.active || 0),
      emailOptIn: Number(summary.email_opt_in || 0),
      recentSevenDays: Number(summary.recent_seven_days || 0),
      childTeaching: Number(summary.child_teaching || 0),
      regions: Number(summary.regions || 0),
    },
    distributions: {
      regions: mapDistribution(regionRows),
      careers: mapDistribution(careerRows),
      jobSeeking: mapDistribution(jobSeekingRows),
    },
    generatedAt: new Date().toISOString(),
  };
}

function textOrNull(value) {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized || null;
}

function buildRegistrationFilters(filters = {}) {
  const email = textOrNull(filters.email);
  const freeText = textOrNull(filters.text);

  return {
    region: textOrNull(filters.region),
    career: textOrNull(filters.career),
    jobSeeking: textOrNull(filters.jobSeeking),
    status: textOrNull(filters.status),
    canTeachChildren: typeof filters.canTeachChildren === "boolean"
      ? filters.canTeachChildren
      : null,
    emailPattern: email ? `%${email.toLowerCase()}%` : null,
    freeTextPattern: freeText ? `%${freeText}%` : null,
    createdFrom: textOrNull(filters.createdFrom),
    createdTo: textOrNull(filters.createdTo),
  };
}

export async function listRegistrations(sql, options = {}) {
  const page = Math.max(1, Number.parseInt(String(options.page || 1), 10));
  const pageSize = Math.min(
    100,
    Math.max(1, Number.parseInt(String(options.pageSize || 15), 10)),
  );
  const offset = (page - 1) * pageSize;
  const filters = buildRegistrationFilters(options);

  const [rows, countRows] = await Promise.all([
    sql`
      SELECT
        id,
        email,
        region,
        major,
        teaching_subject,
        career_level,
        certification,
        job_seeking,
        course_interest,
        additional_notes,
        can_teach_children,
        email_opt_in,
        status,
        consented_at,
        created_at,
        updated_at
      FROM instructor_registrations
      WHERE (${filters.region}::text IS NULL OR region = ${filters.region})
        AND (${filters.career}::text IS NULL OR career_level = ${filters.career})
        AND (${filters.jobSeeking}::text IS NULL OR job_seeking = ${filters.jobSeeking})
        AND (${filters.status}::text IS NULL OR status = ${filters.status})
        AND (${filters.canTeachChildren}::boolean IS NULL
          OR can_teach_children = ${filters.canTeachChildren})
        AND (${filters.emailPattern}::text IS NULL
          OR email_normalized ILIKE ${filters.emailPattern})
        AND (${filters.freeTextPattern}::text IS NULL OR (
          coalesce(major, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(teaching_subject, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(certification, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(additional_notes, '') ILIKE ${filters.freeTextPattern}
        ))
        AND (${filters.createdFrom}::date IS NULL
          OR created_at >= ${filters.createdFrom}::date)
        AND (${filters.createdTo}::date IS NULL
          OR created_at < (${filters.createdTo}::date + interval '1 day'))
      ORDER BY created_at DESC, id DESC
      LIMIT ${pageSize}
      OFFSET ${offset}
    `,
    sql`
      SELECT count(*)::int AS total
      FROM instructor_registrations
      WHERE (${filters.region}::text IS NULL OR region = ${filters.region})
        AND (${filters.career}::text IS NULL OR career_level = ${filters.career})
        AND (${filters.jobSeeking}::text IS NULL OR job_seeking = ${filters.jobSeeking})
        AND (${filters.status}::text IS NULL OR status = ${filters.status})
        AND (${filters.canTeachChildren}::boolean IS NULL
          OR can_teach_children = ${filters.canTeachChildren})
        AND (${filters.emailPattern}::text IS NULL
          OR email_normalized ILIKE ${filters.emailPattern})
        AND (${filters.freeTextPattern}::text IS NULL OR (
          coalesce(major, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(teaching_subject, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(certification, '') ILIKE ${filters.freeTextPattern}
          OR coalesce(additional_notes, '') ILIKE ${filters.freeTextPattern}
        ))
        AND (${filters.createdFrom}::date IS NULL
          OR created_at >= ${filters.createdFrom}::date)
        AND (${filters.createdTo}::date IS NULL
          OR created_at < (${filters.createdTo}::date + interval '1 day'))
    `,
  ]);

  const total = Number(countRows[0]?.total || 0);
  return {
    registrations: rows.map((row) => ({
      id: row.id,
      email: row.email,
      region: row.region,
      major: row.major,
      teachingSubject: row.teaching_subject,
      career: row.career_level,
      certification: row.certification,
      jobSeeking: row.job_seeking,
      courseInterest: row.course_interest,
      additionalNotes: row.additional_notes,
      canTeachChildren: row.can_teach_children,
      emailOptIn: row.email_opt_in,
      status: row.status,
      consentedAt: row.consented_at,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    })),
    pagination: {
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
      hasNext: offset + rows.length < total,
    },
    appliedFilters: options,
    generatedAt: new Date().toISOString(),
  };
}

export async function getRegistrationByEmail(sql, email) {
  const normalizedEmail = String(email || "").trim().toLowerCase();
  const rows = await sql`
    SELECT
      id,
      email,
      region,
      major,
      teaching_subject,
      career_level,
      certification,
      job_seeking,
      course_interest,
      additional_notes,
      can_teach_children,
      email_opt_in,
      consented_at,
      consent_version,
      status,
      created_at,
      updated_at
    FROM instructor_registrations
    WHERE email_normalized = ${normalizedEmail}
    LIMIT 1
  `;

  if (rows.length === 0) {
    return { found: false, registration: null };
  }

  const row = rows[0];
  return {
    found: true,
    registration: {
      id: row.id,
      email: row.email,
      region: row.region,
      major: row.major,
      teachingSubject: row.teaching_subject,
      career: row.career_level,
      certification: row.certification,
      jobSeeking: row.job_seeking,
      courseInterest: row.course_interest,
      additionalNotes: row.additional_notes,
      canTeachChildren: row.can_teach_children,
      emailOptIn: row.email_opt_in,
      consentedAt: row.consented_at,
      consentVersion: row.consent_version,
      status: row.status,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    },
  };
}

export async function aggregateRegistrations(sql, options = {}) {
  const groupBy = options.groupBy || "region";
  const filters = buildRegistrationFilters(options);
  const rows = await sql`
    SELECT
      CASE ${groupBy}
        WHEN 'region' THEN coalesce(region, '미입력')
        WHEN 'major' THEN coalesce(major, '미입력')
        WHEN 'teachingSubject' THEN coalesce(teaching_subject, '미입력')
        WHEN 'career' THEN coalesce(career_level, '미입력')
        WHEN 'certification' THEN coalesce(certification, '미입력')
        WHEN 'jobSeeking' THEN coalesce(job_seeking, '미입력')
        WHEN 'courseInterest' THEN coalesce(course_interest, '미입력')
        WHEN 'canTeachChildren' THEN CASE
          WHEN can_teach_children THEN '가능해요'
          ELSE '어려워요'
        END
        WHEN 'status' THEN status
        WHEN 'registrationDate' THEN to_char(
          timezone('Asia/Seoul', created_at),
          'YYYY-MM-DD'
        )
        ELSE '미입력'
      END AS label,
      count(*)::int AS count
    FROM instructor_registrations
    WHERE (${filters.region}::text IS NULL OR region = ${filters.region})
      AND (${filters.career}::text IS NULL OR career_level = ${filters.career})
      AND (${filters.jobSeeking}::text IS NULL OR job_seeking = ${filters.jobSeeking})
      AND (${filters.status}::text IS NULL OR status = ${filters.status})
      AND (${filters.canTeachChildren}::boolean IS NULL
        OR can_teach_children = ${filters.canTeachChildren})
      AND (${filters.emailPattern}::text IS NULL
        OR email_normalized ILIKE ${filters.emailPattern})
      AND (${filters.freeTextPattern}::text IS NULL OR (
        coalesce(major, '') ILIKE ${filters.freeTextPattern}
        OR coalesce(teaching_subject, '') ILIKE ${filters.freeTextPattern}
        OR coalesce(certification, '') ILIKE ${filters.freeTextPattern}
        OR coalesce(additional_notes, '') ILIKE ${filters.freeTextPattern}
      ))
      AND (${filters.createdFrom}::date IS NULL
        OR created_at >= ${filters.createdFrom}::date)
      AND (${filters.createdTo}::date IS NULL
        OR created_at < (${filters.createdTo}::date + interval '1 day'))
    GROUP BY label
    ORDER BY count DESC, label ASC
    LIMIT 200
  `;

  return {
    groupBy,
    groups: rows.map((row) => ({
      label: row.label,
      count: Number(row.count || 0),
    })),
    appliedFilters: options,
    generatedAt: new Date().toISOString(),
  };
}
