import { requireAdmin } from "../../../lib/admin-auth.js";
import { getDb } from "../../../lib/db.js";
import { allowMethods, isSameOrigin, sendJson } from "../../../lib/http.js";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export async function deleteRegistration(sql, id) {
  return sql`
    DELETE FROM instructor_registrations
    WHERE id = ${id}
    RETURNING id, email
  `;
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
        id,
        email,
        region,
        major,
        career_level,
        can_teach_children,
        email_opt_in,
        consented_at,
        consent_version,
        status,
        created_at,
        updated_at
      FROM instructor_registrations
      WHERE id = ${id}
      LIMIT 1
    `;

    if (rows.length === 0) {
      sendJson(res, 404, { error: "등록자를 찾을 수 없습니다." });
      return;
    }

    const row = rows[0];
    sendJson(res, 200, {
      registration: {
        id: row.id,
        email: row.email,
        region: row.region,
        major: row.major,
        career: row.career_level,
        canTeachChildren: row.can_teach_children,
        emailOptIn: row.email_opt_in,
        consentedAt: row.consented_at,
        consentVersion: row.consent_version,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      },
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
