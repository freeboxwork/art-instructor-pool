import { getDb } from "../../lib/db.js";
import {
  allowMethods,
  isSameOrigin,
  readJsonBody,
  sendJson,
} from "../../lib/http.js";

const MAX_BODY_BYTES = 4096;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SAFE_TAG_PATTERN = /^[a-zA-Z0-9가-힣._-]{1,80}$/;
const HOST_PATTERN = /^(?=.{1,253}$)[a-z0-9.-]+$/i;
const EXPERIMENT_KEY = "mobile_design_v1";
const EXPERIMENT_VARIANTS = new Set(["A", "B"]);
const ASSIGNMENT_METHODS = new Set(["random", "override"]);

const EVENT_PAGE_MAP = new Map([
  ["intro_view", new Set(["/", "/1-intro.dc.html"])],
  ["intro_cta_clicked", new Set(["/", "/1-intro.dc.html"])],
  ["register_view", new Set(["/2-register.dc.html"])],
  ["registration_started", new Set(["/2-register.dc.html"])],
  ["registration_validation_failed", new Set(["/2-register.dc.html"])],
  ["registration_submit_clicked", new Set(["/2-register.dc.html"])],
  ["registration_succeeded", new Set(["/2-register.dc.html"])],
  ["registration_failed", new Set(["/2-register.dc.html"])],
  ["complete_view", new Set(["/3-complete.dc.html"])],
  ["complete_return_clicked", new Set(["/3-complete.dc.html"])],
]);

const ALLOWED_FIELDS = new Set([
  "region",
  "major",
  "career",
  "childTeaching",
  "jobSeeking",
  "email",
  "consent",
]);
const ALLOWED_FAILURE_REASONS = new Set(["network", "server", "unknown"]);

function cleanTag(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim();
  return SAFE_TAG_PATTERN.test(trimmed) ? trimmed : "";
}

function cleanHost(value) {
  if (typeof value !== "string") return "";
  const trimmed = value.trim().toLowerCase();
  return HOST_PATTERN.test(trimmed) ? trimmed : "";
}

function sanitizeProperties(eventName, properties) {
  if (!properties || typeof properties !== "object" || Array.isArray(properties)) return {};

  if (eventName === "intro_view") {
    return {
      referrerHost: cleanHost(properties.referrerHost),
      utmSource: cleanTag(properties.utmSource),
      utmMedium: cleanTag(properties.utmMedium),
      utmCampaign: cleanTag(properties.utmCampaign),
    };
  }

  if (eventName === "registration_validation_failed") {
    return ALLOWED_FIELDS.has(properties.field) ? { field: properties.field } : {};
  }

  if (eventName === "registration_failed") {
    return ALLOWED_FAILURE_REASONS.has(properties.reason)
      ? { reason: properties.reason }
      : { reason: "unknown" };
  }

  return {};
}

function normalizeBody(body) {
  return {
    eventName: typeof body?.eventName === "string" ? body.eventName.trim() : "",
    sessionId: typeof body?.sessionId === "string" ? body.sessionId.trim() : "",
    visitorId: typeof body?.visitorId === "string" ? body.visitorId.trim() : "",
    experimentKey: typeof body?.experimentKey === "string" ? body.experimentKey.trim() : "",
    experimentVariant: typeof body?.experimentVariant === "string" ? body.experimentVariant.trim() : "",
    assignmentMethod: typeof body?.assignmentMethod === "string" ? body.assignmentMethod.trim() : "",
    pagePath: typeof body?.pagePath === "string" ? body.pagePath.trim() : "",
    properties: body?.properties,
  };
}

function hasValidExperimentContext(data) {
  const fields = [
    data.visitorId,
    data.experimentKey,
    data.experimentVariant,
    data.assignmentMethod,
  ];
  if (fields.every((value) => value === "")) return true;

  return UUID_PATTERN.test(data.visitorId)
    && data.experimentKey === EXPERIMENT_KEY
    && EXPERIMENT_VARIANTS.has(data.experimentVariant)
    && ASSIGNMENT_METHODS.has(data.assignmentMethod);
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["POST"])) return;
  if (!req.headers.origin || !isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청 출처입니다." });
    return;
  }

  if (!String(req.headers["content-type"] || "").toLowerCase().startsWith("application/json")) {
    sendJson(res, 415, { error: "JSON 형식의 이벤트만 허용됩니다." });
    return;
  }

  const contentLength = Number.parseInt(String(req.headers["content-length"] || "0"), 10);
  if (Number.isFinite(contentLength) && contentLength > MAX_BODY_BYTES) {
    sendJson(res, 413, { error: "이벤트 데이터가 너무 큽니다." });
    return;
  }

  const data = normalizeBody(readJsonBody(req));
  const allowedPages = EVENT_PAGE_MAP.get(data.eventName);
  if (
    !allowedPages
    || !allowedPages.has(data.pagePath)
    || !UUID_PATTERN.test(data.sessionId)
    || !hasValidExperimentContext(data)
  ) {
    sendJson(res, 422, { error: "유효하지 않은 분석 이벤트입니다." });
    return;
  }

  try {
    const sql = getDb();
    await sql`
      INSERT INTO analytics_events (
        event_name,
        session_key,
        visitor_key,
        experiment_key,
        experiment_variant,
        assignment_method,
        page_path,
        properties
      )
      VALUES (
        ${data.eventName},
        ${data.sessionId},
        ${data.visitorId || null}::uuid,
        ${data.experimentKey || null},
        ${data.experimentVariant || null},
        ${data.assignmentMethod || null},
        ${data.pagePath},
        ${JSON.stringify(sanitizeProperties(data.eventName, data.properties))}::jsonb
      )
    `;

    sendJson(res, 202, { ok: true });
  } catch (error) {
    console.error("analytics_event_write_failed", error);
    sendJson(res, 500, { error: "분석 이벤트를 저장하지 못했습니다." });
  }
}
