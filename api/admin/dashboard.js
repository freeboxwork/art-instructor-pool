import { requireAdmin } from "../../lib/admin-auth.js";
import { getDb } from "../../lib/db.js";
import { allowMethods, sendJson } from "../../lib/http.js";

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const sql = getDb();
    const [summaryRows, regionRows, careerRows] = await Promise.all([
      sql`
        SELECT
          count(*)::int AS total,
          count(*) FILTER (WHERE status = 'active' AND email_opt_in = true)::int AS active,
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
        SELECT career_level AS label, count(*)::int AS count
        FROM instructor_registrations
        GROUP BY career_level
        ORDER BY CASE career_level
          WHEN '경력 없음' THEN 1
          WHEN '1년 미만' THEN 2
          WHEN '1~3년' THEN 3
          WHEN '3년 이상' THEN 4
          ELSE 5
        END
      `,
    ]);

    const summary = summaryRows[0];
    sendJson(res, 200, {
      summary: {
        total: summary.total,
        active: summary.active,
        recentSevenDays: summary.recent_seven_days,
        childTeaching: summary.child_teaching,
        regions: summary.regions,
      },
      distributions: {
        regions: regionRows,
        careers: careerRows,
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("admin_dashboard_failed", error);
    sendJson(res, 500, { error: "대시보드 정보를 불러오지 못했습니다." });
  }
}
