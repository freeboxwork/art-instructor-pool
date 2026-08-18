import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

import { serializeRegistrationDetail } from "../api/admin/registrations/[id].js";

const adminHtml = fs.readFileSync(new URL("../admin.html", import.meta.url), "utf8");

const baseRow = {
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
};

test("registration detail includes linked UTM and A/B attribution", () => {
  const registration = serializeRegistrationDetail(baseRow);

  assert.equal(registration.attribution.linked, true);
  assert.deepEqual(registration.attribution.acquisition, {
    source: "email",
    utmSource: "email",
    utmMedium: "newsletter",
    utmCampaign: "artist",
    referrerHost: "example.com",
  });
  assert.deepEqual(registration.attribution.abTest, {
    key: "mobile_design_v1",
    variant: "B",
    assignmentMethod: "random",
  });
});

test("registration detail falls back to the referrer or direct visit", () => {
  const referred = serializeRegistrationDetail({
    ...baseRow,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
  });
  const direct = serializeRegistrationDetail({
    ...baseRow,
    acquisition_event_id: 39,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_host: null,
  });

  assert.equal(referred.attribution.acquisition.source, "example.com");
  assert.equal(direct.attribution.acquisition.source, "직접 방문");
});

test("legacy registration does not invent acquisition or experiment data", () => {
  const registration = serializeRegistrationDetail({
    ...baseRow,
    registration_event_id: null,
    attribution_recorded_at: null,
    acquisition_event_id: null,
    experiment_key: null,
    experiment_variant: null,
    assignment_method: null,
    utm_source: null,
    utm_medium: null,
    utm_campaign: null,
    referrer_host: null,
  });

  assert.equal(registration.attribution.linked, false);
  assert.equal(registration.attribution.acquisition, null);
  assert.equal(registration.attribution.abTest, null);
});

test("acquisition details are grouped in a fold that is closed by default", () => {
  assert.match(adminHtml, /<details class="detail-fold">\s*<summary>유입 경로<\/summary>/);
  assert.doesNotMatch(adminHtml, /<details class="detail-fold"\s+open>/);
  assert.doesNotMatch(adminHtml, />배정 방식</);
  assert.doesNotMatch(adminHtml, />유입 및 A\/B 테스트</);
});
