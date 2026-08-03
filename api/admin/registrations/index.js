import { requireAdmin } from "../../../lib/admin-auth.js";
import { getDb } from "../../../lib/db.js";
import { allowMethods, sendJson } from "../../../lib/http.js";

function positiveInteger(value, fallback) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  const page = positiveInteger(req.query?.page, 1);
  const limit = Math.min(positiveInteger(req.query?.limit, 15), 100);
  const offset = (page - 1) * limit;

  try {
    const sql = getDb();
    const [rows, countRows] = await Promise.all([
      sql`
        SELECT id, email, status, created_at, updated_at
        FROM instructor_registrations
        ORDER BY created_at DESC, id DESC
        LIMIT ${limit}
        OFFSET ${offset}
      `,
      sql`SELECT count(*)::int AS total FROM instructor_registrations`,
    ]);

    sendJson(res, 200, {
      registrations: rows.map((row) => ({
        id: row.id,
        email: row.email,
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
      })),
      pagination: {
        page,
        limit,
        total: countRows[0].total,
        hasNext: offset + rows.length < countRows[0].total,
      },
    });
  } catch (error) {
    console.error("admin_registration_list_failed", error);
    sendJson(res, 500, { error: "등록자 목록을 불러오지 못했습니다." });
  }
}
