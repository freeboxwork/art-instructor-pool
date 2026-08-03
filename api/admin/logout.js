import { createExpiredAdminSessionCookie } from "../../lib/admin-auth.js";
import {
  allowMethods,
  isSameOrigin,
  sendJson,
  setNoStore,
} from "../../lib/http.js";

export default async function handler(req, res) {
  setNoStore(res);
  if (!allowMethods(req, res, ["POST"])) return;
  if (!isSameOrigin(req)) {
    sendJson(res, 403, { error: "허용되지 않은 요청 출처입니다." });
    return;
  }

  res.setHeader("Set-Cookie", createExpiredAdminSessionCookie());
  sendJson(res, 200, { ok: true });
}
