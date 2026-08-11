import assert from "node:assert/strict";
import test from "node:test";

import {
  deleteAnalyticsEvents,
  hasValidDeleteConfirmation,
} from "../api/admin/analytics.js";
import analyticsHandler from "../api/admin/analytics.js";
import { createAdminSessionCookie } from "../lib/admin-auth.js";

process.env.ADMIN_SESSION_SECRET = "analytics-delete-test-secret-1234567890";

function createResponse() {
  return {
    headers: {},
    statusCode: 0,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    end(payload) {
      this.body = JSON.parse(payload);
    },
  };
}

function createAuthenticatedRequest({ body, origin = "https://admin.example.com" } = {}) {
  return {
    method: "DELETE",
    query: {},
    body,
    headers: {
      cookie: createAdminSessionCookie().split(";")[0],
      host: "admin.example.com",
      origin,
    },
  };
}

test("전체 분석 삭제 확인 문구는 소문자 delete만 허용한다", () => {
  assert.equal(hasValidDeleteConfirmation("delete"), true);
  assert.equal(hasValidDeleteConfirmation(" delete "), true);
  assert.equal(hasValidDeleteConfirmation("DELETE"), false);
  assert.equal(hasValidDeleteConfirmation("delete all"), false);
  assert.equal(hasValidDeleteConfirmation(undefined), false);
});

test("전체 분석 삭제는 analytics_events만 지우고 삭제 건수를 반환한다", async () => {
  let query = "";
  const sql = (strings) => {
    query = strings.join("");
    return [{ deleted_events: 181 }];
  };

  const deletedEvents = await deleteAnalyticsEvents(sql);

  assert.equal(deletedEvents, 181);
  assert.match(query, /DELETE FROM analytics_events/);
  assert.doesNotMatch(query, /instructor_registrations/);
});

test("삭제할 분석 이벤트가 없으면 0건을 반환한다", async () => {
  const sql = () => [{ deleted_events: 0 }];
  assert.equal(await deleteAnalyticsEvents(sql), 0);
});

test("서버도 delete 확인 문구를 다시 검증한다", async () => {
  const response = createResponse();
  const request = createAuthenticatedRequest({ body: { confirmation: "DELETE" } });

  await analyticsHandler(request, response);

  assert.equal(response.statusCode, 400);
  assert.match(response.body.error, /delete/);
});

test("다른 출처에서 보낸 전체 삭제 요청은 차단한다", async () => {
  const response = createResponse();
  const request = createAuthenticatedRequest({
    body: { confirmation: "delete" },
    origin: "https://malicious.example.com",
  });

  await analyticsHandler(request, response);

  assert.equal(response.statusCode, 403);
});

test("관리자 세션이 없는 전체 삭제 요청은 차단한다", async () => {
  const response = createResponse();
  const request = {
    method: "DELETE",
    query: {},
    body: { confirmation: "delete" },
    headers: { host: "admin.example.com", origin: "https://admin.example.com" },
  };

  await analyticsHandler(request, response);

  assert.equal(response.statusCode, 401);
});
