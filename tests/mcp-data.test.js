import assert from "node:assert/strict";
import test from "node:test";

import {
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
