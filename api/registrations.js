import { getDb } from "../lib/db.js";
import {
  allowMethods,
  isSameOrigin,
  readJsonBody,
  sendJson,
} from "../lib/http.js";

const ALLOWED_REGIONS = new Set([
  "서울",
  "경기·인천",
  "부산·울산·경남",
  "대구·경북",
  "대전·세종·충청",
  "광주·전라",
  "강원",
  "제주",
]);
const ALLOWED_CAREERS = new Set(["경력 없음", "1년 미만", "1~3년", "3년 이상"]);
const ALLOWED_CHILD_TEACHING = new Set(["가능해요", "어려워요"]);
const ALLOWED_JOB_SEEKING = new Set(["현재 구직중", "향후 구직 의향 있음", "구직 의향 없음"]);
const ALLOWED_COURSE_INTEREST = new Set(["네, 관심 있어요", "아니오"]);
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_VERSION = "2026-08-03";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const EXPERIMENT_KEY = "mobile_design_v1";

function normalizeInput(body) {
  return {
    region: typeof body?.region === "string" ? body.region.trim() : "",
    major: typeof body?.major === "string" ? body.major.trim() : "",
    teachingSubject: typeof body?.teachingSubject === "string" ? body.teachingSubject.trim() : "",
    career: typeof body?.career === "string" ? body.career.trim() : "",
    certification: typeof body?.certification === "string" ? body.certification.trim() : "",
    jobSeeking: typeof body?.jobSeeking === "string" ? body.jobSeeking.trim() : "",
    courseInterest: typeof body?.courseInterest === "string" ? body.courseInterest.trim() : "",
    additionalNotes: typeof body?.additionalNotes === "string" ? body.additionalNotes.trim() : "",
    childTeaching: typeof body?.childTeaching === "string" ? body.childTeaching.trim() : "",
    email: typeof body?.email === "string" ? body.email.trim() : "",
    consent: body?.consent === true,
    website: typeof body?.website === "string" ? body.website.trim() : "",
  };
}

function validateRegistration(data) {
  const fields = {};

  if (!ALLOWED_REGIONS.has(data.region)) {
    fields.region = "활동 가능한 지역을 선택해 주세요.";
  }
  if (data.major && data.major.length > 100) {
    fields.major = "미술 전공 분야는 100자 이하로 입력해 주세요.";
  }
  if (data.teachingSubject && data.teachingSubject.length > 100) {
    fields.teachingSubject = "가르치는 수업은 100자 이하로 입력해 주세요.";
  }
  if (data.career && !ALLOWED_CAREERS.has(data.career)) {
    fields.career = "관련 경력을 선택해 주세요.";
  }
  if (data.childTeaching && !ALLOWED_CHILD_TEACHING.has(data.childTeaching)) {
    fields.childTeaching = "아동 수업 가능 여부를 확인해 주세요.";
  }
  if (data.certification && data.certification.length > 100) {
    fields.certification = "자격 여부는 100자 이하로 입력해 주세요.";
  }
  if (!ALLOWED_JOB_SEEKING.has(data.jobSeeking)) {
    fields.jobSeeking = "구직 여부를 선택해 주세요.";
  }
  if (data.courseInterest && !ALLOWED_COURSE_INTEREST.has(data.courseInterest)) {
    fields.courseInterest = "선택 항목을 확인해 주세요.";
  }
  if (data.additionalNotes && data.additionalNotes.length > 500) {
    fields.additionalNotes = "기타사항은 500자 이하로 입력해 주세요.";
  }
  if (!data.email || data.email.length > 254 || !EMAIL_PATTERN.test(data.email)) {
    fields.email = data.email
      ? "올바른 이메일 형식으로 입력해 주세요."
      : "이메일을 입력해 주세요.";
  }
  if (!data.consent) {
    fields.consent = "이메일 안내 수신에 동의해 주세요.";
  }

  return fields;
}

export function normalizeAnalyticsContext(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const context = {
    sessionId: typeof value.sessionId === "string" ? value.sessionId.trim() : "",
    visitorId: typeof value.visitorId === "string" ? value.visitorId.trim() : "",
    experimentKey: typeof value.experimentKey === "string" ? value.experimentKey.trim() : "",
    experimentVariant: typeof value.experimentVariant === "string" ? value.experimentVariant.trim() : "",
    assignmentMethod: typeof value.assignmentMethod === "string" ? value.assignmentMethod.trim() : "",
  };

  if (!UUID_PATTERN.test(context.sessionId)) return null;

  const hasExperimentContext = Boolean(
    context.visitorId
    || context.experimentKey
    || context.experimentVariant
    || context.assignmentMethod,
  );
  if (!hasExperimentContext) return context;

  if (!UUID_PATTERN.test(context.visitorId)
    || context.experimentKey !== EXPERIMENT_KEY
    || !["A", "B"].includes(context.experimentVariant)
    || !["random", "override"].includes(context.assignmentMethod)) return null;

  return context;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청 출처입니다." });
    return;
  }

  const body = readJsonBody(req);
  const data = normalizeInput(body);
  const analyticsContext = normalizeAnalyticsContext(body?.analyticsContext);

  // 화면에는 보이지 않는 필드입니다. 자동 입력 봇은 성공처럼 응답하되 저장하지 않습니다.
  if (data.website) {
    sendJson(res, 201, { ok: true });
    return;
  }

  const fields = validateRegistration(data);
  if (Object.keys(fields).length > 0) {
    sendJson(res, 422, { error: "입력 내용을 확인해 주세요.", fields });
    return;
  }

  const canTeachChildren = data.childTeaching
    ? data.childTeaching === "가능해요"
    : data.teachingSubject.includes("아동");

  try {
    const sql = getDb();
    const rows = await sql`
      WITH saved_registration AS (
        INSERT INTO instructor_registrations (
          region,
          major,
          teaching_subject,
          career_level,
          certification,
          job_seeking,
          course_interest,
          additional_notes,
          can_teach_children,
          email,
          email_opt_in,
          consented_at,
          consent_version,
          status
        )
        VALUES (
          ${data.region},
          ${data.major || null},
          ${data.teachingSubject || null},
          ${data.career || null},
          ${data.certification || null},
          ${data.jobSeeking},
          ${data.courseInterest || null},
          ${data.additionalNotes || null},
          ${canTeachChildren},
          ${data.email},
          true,
          now(),
          ${CONSENT_VERSION},
          'active'
        )
        ON CONFLICT (email_normalized)
        DO UPDATE SET
          region = EXCLUDED.region,
          major = EXCLUDED.major,
          teaching_subject = EXCLUDED.teaching_subject,
          career_level = EXCLUDED.career_level,
          certification = EXCLUDED.certification,
          job_seeking = EXCLUDED.job_seeking,
          course_interest = EXCLUDED.course_interest,
          additional_notes = EXCLUDED.additional_notes,
          can_teach_children = EXCLUDED.can_teach_children,
          email = EXCLUDED.email,
          email_opt_in = true,
          consented_at = now(),
          consent_version = EXCLUDED.consent_version,
          status = 'active'
        RETURNING id, created_at, updated_at
      ),
      saved_event AS (
        INSERT INTO analytics_events (
          event_name,
          session_key,
          visitor_key,
          registration_id,
          experiment_key,
          experiment_variant,
          assignment_method,
          page_path,
          properties
        )
        SELECT
          'registration_succeeded',
          ${analyticsContext?.sessionId || null},
          ${analyticsContext?.visitorId || null}::uuid,
          saved_registration.id,
          ${analyticsContext?.experimentKey || null},
          ${analyticsContext?.experimentVariant || null},
          ${analyticsContext?.assignmentMethod || null},
          '/2-register.dc.html',
          '{}'::jsonb
        FROM saved_registration
        WHERE ${Boolean(analyticsContext)}
        RETURNING id
      )
      SELECT id, created_at, updated_at
      FROM saved_registration
    `;

    sendJson(res, 201, {
      ok: true,
      registration: {
        id: rows[0].id,
        createdAt: rows[0].created_at,
        updatedAt: rows[0].updated_at,
      },
    });
  } catch (error) {
    console.error("registration_write_failed", error);
    sendJson(res, 500, { error: "등록 정보를 저장하지 못했습니다. 잠시 후 다시 시도해 주세요." });
  }
}
