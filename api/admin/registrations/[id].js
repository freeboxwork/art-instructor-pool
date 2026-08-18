import { requireAdmin } from "../../../lib/admin-auth.js";
import { getDb } from "../../../lib/db.js";
import { allowMethods, isSameOrigin, sendJson } from "../../../lib/http.js";
import { serializeRegistrationAttribution } from "../../../lib/registration-attribution.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteRegistration(sql, id) {
  return sql`
    DELETE FROM instructor_registrations
    WHERE id = ${id}
    RETURNING id, email
  `;
}

export function serializeRegistrationDetail(row) {
  return {
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
    attribution: serializeRegistrationAttribution(row),
  };
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET", "DELETE"])) return;
  if (!requireAdmin(req, res)) return;

  if (req.method === "DELETE" && !isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청입니다." });
    return;
  }

  const id = Array.isArray(req.query?.id) ? req.query.id[0] : req.query?.id;
  if (typeof id !== "string" || !UUID_PATTERN.test(id)) {
    sendJson(res, 400, { error: "올바르지 않은 등록자 ID입니다." });
    return;
  }

  try {
    const sql = getDb();

    if (req.method === "DELETE") {
      const deletedRows = await deleteRegistration(sql, id);

      if (deletedRows.length === 0) {
        sendJson(res, 404, { error: "등록자를 찾을 수 없습니다." });
        return;
      }

      sendJson(res, 200, {
        ok: true,
        deleted: {
          id: deletedRows[0].id,
          email: deletedRows[0].email,
        },
      });
      return;
    }

    const rows = await sql`
      SELECT
        registration.id,
        registration.email,
        registration.region,
        registration.major,
        registration.teaching_subject,
        registration.career_level,
        registration.certification,
        registration.job_seeking,
        registration.course_interest,
        registration.additional_notes,
        registration.can_teach_children,
        registration.email_opt_in,
        registration.consented_at,
        registration.consent_version,
        registration.status,
        registration.created_at,
        registration.updated_at,
        registration_event.id AS registration_event_id,
        registration_event.created_at AS attribution_recorded_at,
        registration_event.experiment_key,
        registration_event.experiment_variant,
        registration_event.assignment_method,
        acquisition_event.id AS acquisition_event_id,
        acquisition_event.properties ->> 'utmSource' AS utm_source,
        acquisition_event.properties ->> 'utmMedium' AS utm_medium,
        acquisition_event.properties ->> 'utmCampaign' AS utm_campaign,
        acquisition_event.properties ->> 'referrerHost' AS referrer_host
      FROM instructor_registrations AS registration
      LEFT JOIN LATERAL (
        SELECT
          event.id,
          event.session_key,
          event.experiment_key,
          event.experiment_variant,
          event.assignment_method,
          event.created_at
        FROM analytics_events AS event
        WHERE event.event_name = 'registration_succeeded'
          AND event.registration_id = registration.id
        ORDER BY event.created_at DESC, event.id DESC
        LIMIT 1
      ) AS registration_event ON true
      LEFT JOIN LATERAL (
        SELECT event.id, event.properties
        FROM analytics_events AS event
        WHERE event.event_name = 'intro_view'
          AND event.session_key = registration_event.session_key
          AND event.created_at BETWEEN
            registration_event.created_at - interval '7 days'
            AND registration_event.created_at + interval '1 minute'
        ORDER BY event.created_at ASC, event.id ASC
        LIMIT 1
      ) AS acquisition_event ON true
      WHERE registration.id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      sendJson(res, 404, { error: "등록자를 찾을 수 없습니다." });
      return;
    }

    sendJson(res, 200, {
      registration: serializeRegistrationDetail(rows[0]),
    });
  } catch (error) {
    const isDeleteRequest = req.method === "DELETE";
    console.error(isDeleteRequest ? "admin_registration_delete_failed" : "admin_registration_detail_failed", error);
    sendJson(res, 500, {
      error: isDeleteRequest
        ? "등록자를 삭제하지 못했습니다. 잠시 후 다시 시도해 주세요."
        : "등록자 상세 정보를 불러오지 못했습니다.",
    });
  }
}
