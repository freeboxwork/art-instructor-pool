import assert from "node:assert/strict";
import test from "node:test";

import {
  getRegistrationByEmail,
  getKstPeriodStart,
  normalizeAnalyticsRange,
} from "../lib/mcp-data.js";
import {
  normalizeExperimentFilter,
  normalizeExperimentRange,
} from "../lib/ab-analytics.js";

test("분석 조회 기간은 7일, 30일, 90일만 허용한다", () => {
  assert.equal(normalizeAnalyticsRange(7), 7);
  assert.equal(normalizeAnalyticsRange("90"), 90);
  assert.equal(normalizeAnalyticsRange(14), 30);
  assert.equal(normalizeAnalyticsRange(undefined), 30);
});

test("기간 시작은 한국 시간 자정으로 계산한다", () => {
  const now = Date.parse("2026-08-11T04:30:00.000Z");

  assert.equal(
    getKstPeriodStart(7, now),
    "2026-08-04T15:00:00.000Z",
  );
});

test("A/B 테스트 조회 기간과 필터를 정규화한다", () => {
  assert.equal(normalizeExperimentRange("90"), 90);
  assert.equal(normalizeExperimentRange(14), 30);
  assert.equal(normalizeExperimentFilter("  kakaotalk  "), "kakaotalk");
  assert.equal(normalizeExperimentFilter(undefined), "");
});

test("이메일 등록자 상세에 기록된 유입 경로와 A/B 배정을 포함한다", async () => {
  const queries = [];
  const sql = (strings, ...values) => {
    queries.push({ query: strings.join(""), values });
    return [{
      id: "c673b5a2-864a-4f40-aa12-bc68ececd9d4",
      email: "instructor@example.com",
      region: "서울",
      major: "회화",
      teaching_subject: "아동 미술",
      career_level: "1~3년",
      certification: null,
      job_seeking: "현재 구직중",
      course_interest: "네, 관심 있어요",
      additional_notes: null,
      can_teach_children: true,
      email_opt_in: true,
      consented_at: "2026-08-18T00:00:00.000Z",
      consent_version: "2026-08-03",
      status: "active",
      created_at: "2026-08-18T00:00:00.000Z",
      updated_at: "2026-08-18T00:00:00.000Z",
      registration_event_id: 42,
      attribution_recorded_at: "2026-08-18T00:00:02.000Z",
      acquisition_event_id: 38,
      utm_source: "email",
      utm_medium: "newsletter",
      utm_campaign: "artist",
      referrer_host: "example.com",
      experiment_key: "mobile_design_v1",
      experiment_variant: "B",
      assignment_method: "random",
    }];
  };

  const result = await getRegistrationByEmail(sql, " Instructor@Example.com ");

  assert.equal(result.found, true);
  assert.equal(result.registration.attribution.acquisition.source, "email");
  assert.equal(result.registration.attribution.acquisition.utmCampaign, "artist");
  assert.deepEqual(result.registration.attribution.abTest, {
    key: "mobile_design_v1",
    variant: "B",
    assignmentMethod: "random",
  });
  assert.match(queries[0].query, /event\.registration_id = registration\.id/);
  assert.deepEqual(queries[0].values, ["instructor@example.com"]);
});
