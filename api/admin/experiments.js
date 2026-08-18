import { requireAdmin } from "../../lib/admin-auth.js";
import {
  buildExperimentComparison,
  getAbTestReport,
} from "../../lib/ab-analytics.js";
import { getDb } from "../../lib/db.js";
import { allowMethods, sendJson } from "../../lib/http.js";

export { buildExperimentComparison };

export default async function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  try {
    const report = await getAbTestReport(getDb(), {
      days: req.query?.days,
      source: req.query?.source,
      campaign: req.query?.campaign,
    });
    sendJson(res, 200, report);
  } catch (error) {
    console.error("admin_experiments_failed", error);
    sendJson(res, 500, { error: "A/B 테스트 분석 정보를 불러오지 못했습니다." });
  }
}
