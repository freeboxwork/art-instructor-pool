import { requireAdmin } from "../../lib/admin-auth.js";
import { allowMethods, sendJson } from "../../lib/http.js";

export default function handler(req, res) {
  if (!allowMethods(req, res, ["GET"])) return;
  if (!requireAdmin(req, res)) return;

  sendJson(res, 200, { ok: true });
}
