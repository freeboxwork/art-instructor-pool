const ANALYTICS_ENDPOINT = "/api/analytics/events";
const ANALYTICS_SESSION_KEY = "art_pool_analytics_session";
const EXPERIMENT_KEY = "mobile_design_v1";
const ASSIGNMENT_COOKIE = "art_pool_ab_mobile_design_v1";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const PAGE_EVENTS = {
  "/": "intro_view",
  "/1-intro.dc.html": "intro_view",
  "/2-register.dc.html": "register_view",
  "/3-complete.dc.html": "complete_view",
};

function createSessionId() {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();

  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function getSessionId() {
  try {
    const stored = window.sessionStorage.getItem(ANALYTICS_SESSION_KEY);
    if (stored) return stored;

    const sessionId = createSessionId();
    window.sessionStorage.setItem(ANALYTICS_SESSION_KEY, sessionId);
    return sessionId;
  } catch {
    return createSessionId();
  }
}

function getAssignment() {
  try {
    const encoded = document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${ASSIGNMENT_COOKIE}=`))
      ?.slice(ASSIGNMENT_COOKIE.length + 1);
    if (!encoded) return null;

    const [version, visitorId, variant, assignmentMethod] = decodeURIComponent(encoded).split(".");
    if (
      version !== "v1"
      || !UUID_PATTERN.test(visitorId || "")
      || !["A", "B"].includes(variant)
      || !["random", "override"].includes(assignmentMethod)
    ) {
      return null;
    }

    return { visitorId, experimentKey: EXPERIMENT_KEY, experimentVariant: variant, assignmentMethod };
  } catch {
    return null;
  }
}

function getContext() {
  return {
    sessionId: getSessionId(),
    ...getAssignment(),
  };
}

function removeExperimentOverrideFromUrl() {
  const url = new URL(window.location.href);
  if (!url.searchParams.has("ab_override")) return;
  url.searchParams.delete("ab_override");
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}

function getIntroSource() {
  let referrerHost = "";

  try {
    if (document.referrer) {
      const referrer = new URL(document.referrer);
      if (referrer.host !== window.location.host) referrerHost = referrer.hostname;
    }
  } catch {
    referrerHost = "";
  }

  const search = new URLSearchParams(window.location.search);
  return {
    referrerHost,
    utmSource: search.get("utm_source") || "",
    utmMedium: search.get("utm_medium") || "",
    utmCampaign: search.get("utm_campaign") || "",
  };
}

function sendEvent(payload, useBeacon = false) {
  const body = JSON.stringify(payload);

  if (useBeacon && typeof navigator.sendBeacon === "function") {
    const queued = navigator.sendBeacon(
      ANALYTICS_ENDPOINT,
      new Blob([body], { type: "application/json" }),
    );
    if (queued) return Promise.resolve(true);
  }

  return fetch(ANALYTICS_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    keepalive: true,
  })
    .then((response) => response.ok)
    .catch(() => false);
}

function track(eventName, properties = {}, options = {}) {
  const context = getContext();
  return sendEvent({
    eventName,
    ...context,
    pagePath: window.location.pathname,
    properties,
  }, Boolean(options.beacon));
}

window.siteAnalytics = Object.freeze({ track, getContext });

const pageEvent = PAGE_EVENTS[window.location.pathname];
if (pageEvent) {
  track(pageEvent, pageEvent === "intro_view" ? getIntroSource() : {});
}

document.addEventListener("click", (event) => {
  const target = event.target.closest("[data-analytics-event]");
  if (!target) return;
  track(target.dataset.analyticsEvent, {}, { beacon: true });
});

removeExperimentOverrideFromUrl();
