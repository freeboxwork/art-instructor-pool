import test from "node:test";
import assert from "node:assert/strict";

import middleware, {
  ASSIGNMENT_COOKIE,
  parseAssignment,
  serializeAssignment,
} from "../middleware.js";
import { buildExperimentComparison } from "../api/admin/experiments.js";
import { normalizeAnalyticsContext } from "../api/registrations.js";

const visitorId = "20d46363-5723-4fc5-b671-194a4c336468";
const sessionId = "5bfdb58d-d3fa-4fa2-b46c-e90fa85699f0";

test("assignment cookie round-trips a valid experiment assignment", () => {
  const assignment = { visitorId, variant: "B", method: "random" };
  assert.deepEqual(parseAssignment(serializeAssignment(assignment)), assignment);
  assert.equal(parseAssignment("invalid"), null);
});

test("middleware forces B for QA and strips the override from the rewrite", () => {
  const request = new Request("https://example.com/?utm_source=kakaotalk&ab_override=B");
  const response = middleware(request);
  const destination = new URL(response.headers.get("x-middleware-rewrite"));

  assert.equal(destination.pathname, "/1-intro.b.html");
  assert.equal(destination.searchParams.get("utm_source"), "kakaotalk");
  assert.equal(destination.searchParams.has("ab_override"), false);
  assert.match(response.headers.get("set-cookie"), new RegExp(`${ASSIGNMENT_COOKIE}=`));
  assert.equal(response.headers.get("x-art-pool-experiment"), "mobile_design_v1:B");
});

test("middleware keeps a stored B assignment across canonical pages", () => {
  const cookie = serializeAssignment({ visitorId, variant: "B", method: "random" });
  const request = new Request("https://example.com/2-register.dc.html", {
    headers: { cookie: `${ASSIGNMENT_COOKIE}=${cookie}` },
  });
  const response = middleware(request);

  assert.equal(new URL(response.headers.get("x-middleware-rewrite")).pathname, "/2-register.b.html");
  assert.equal(response.headers.get("set-cookie"), null);
});

test("experiment comparison calculates rates and lift", () => {
  const comparison = buildExperimentComparison([
    {
      variant: "A",
      exposures: 100,
      cta_clicks: 60,
      form_starts: 50,
      submit_clicks: 30,
      registrations: 20,
      validation_failures: 5,
      registration_failures: 1,
    },
    {
      variant: "B",
      exposures: 100,
      cta_clicks: 70,
      form_starts: 60,
      submit_clicks: 45,
      registrations: 30,
      validation_failures: 3,
      registration_failures: 0,
    },
  ]);

  assert.equal(comparison.variants.A.conversionRate, 20);
  assert.equal(comparison.variants.B.conversionRate, 30);
  assert.equal(comparison.lift.absolutePercentagePoints, 10);
  assert.equal(comparison.lift.relativePercent, 50);
  assert.equal(comparison.decisionStatus, "review");
});

test("registration analytics context accepts only the configured experiment", () => {
  const valid = {
    sessionId,
    visitorId,
    experimentKey: "mobile_design_v1",
    experimentVariant: "A",
    assignmentMethod: "random",
  };

  assert.deepEqual(normalizeAnalyticsContext(valid), valid);
  assert.equal(normalizeAnalyticsContext({ ...valid, experimentVariant: "C" }), null);
  assert.equal(normalizeAnalyticsContext({ ...valid, experimentKey: "other" }), null);
});
