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
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const CONSENT_VERSION = "2026-08-03";

function normalizeInput(body) {
  return {
    region: typeof body?.region === "string" ? body.region.trim() : "",
    major: typeof body?.major === "string" ? body.major.trim() : "",
    career: typeof body?.career === "string" ? body.career.trim() : "",
    childTeaching: body?.childTeaching,
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
  if (!data.major || data.major.length > 100) {
    fields.major = data.major
      ? "미술 전공 분야는 100자 이하로 입력해 주세요."
      : "미술 전공 분야를 입력해 주세요.";
  }
  if (!ALLOWED_CAREERS.has(data.career)) {
    fields.career = "관련 경력을 선택해 주세요.";
  }
  if (!["가능해요", "어려워요", true, false].includes(data.childTeaching)) {
    fields.childTeaching = "아동 수업 가능 여부를 선택해 주세요.";
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

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청 출처입니다." });
    return;
  }

  const data = normalizeInput(readJsonBody(req));

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

  const canTeachChildren = data.childTeaching === true || data.childTeaching === "가능해요";

  try {
    const sql = getDb();
    const rows = await sql`
      INSERT INTO instructor_registrations (
        region,
        major,
        career_level,
        can_teach_children,
        email,
        email_opt_in,
        consented_at,
        consent_version,
        status
      )
      VALUES (
        ${data.region},
        ${data.major},
        ${data.career},
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
        career_level = EXCLUDED.career_level,
        can_teach_children = EXCLUDED.can_teach_children,
        email = EXCLUDED.email,
        email_opt_in = true,
        consented_at = now(),
        consent_version = EXCLUDED.consent_version,
        status = 'active'
      RETURNING id, created_at, updated_at
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
