import { next, rewrite } from "@vercel/functions";

export const EXPERIMENT_KEY = "mobile_design_v1";
export const ASSIGNMENT_COOKIE = "art_pool_ab_mobile_design_v1";
export const ASSIGNMENT_MAX_AGE = 60 * 60 * 24 * 90;

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const VARIANTS = new Set(["A", "B"]);
const ASSIGNMENT_METHODS = new Set(["random", "override"]);
const ROUTES = new Map([
  ["/", { A: "/1-intro.dc.html", B: "/1-intro.b.html" }],
  ["/1-intro.dc.html", { A: "/1-intro.dc.html", B: "/1-intro.b.html" }],
  ["/2-register.dc.html", { A: "/2-register.dc.html", B: "/2-register.b.html" }],
  ["/3-complete.dc.html", { A: "/3-complete.dc.html", B: "/3-complete.b.html" }],
]);

function parseCookies(headerValue = "") {
  return Object.fromEntries(
    String(headerValue || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const separator = part.indexOf("=");
        if (separator < 0) return [part, ""];
        return [part.slice(0, separator), decodeURIComponent(part.slice(separator + 1))];
      }),
  );
}

export function parseAssignment(value) {
  if (typeof value !== "string") return null;
  const [version, visitorId, variant, method] = value.split(".");
  if (
    version !== "v1"
    || !UUID_PATTERN.test(visitorId || "")
    || !VARIANTS.has(variant)
    || !ASSIGNMENT_METHODS.has(method)
  ) {
    return null;
  }

  return { visitorId, variant, method };
}

export function serializeAssignment({ visitorId, variant, method }) {
  return `v1.${visitorId}.${variant}.${method}`;
}

function createRandomAssignment() {
  const random = new Uint8Array(1);
  crypto.getRandomValues(random);
  return {
    visitorId: crypto.randomUUID(),
    variant: random[0] < 128 ? "A" : "B",
    method: "random",
  };
}

export function resolveAssignment(request) {
  const url = new URL(request.url);
  const override = url.searchParams.get("ab_override")?.toUpperCase();
  const stored = parseAssignment(parseCookies(request.headers.get("cookie"))[ASSIGNMENT_COOKIE]);

  if (VARIANTS.has(override)) {
    return {
      assignment: {
        visitorId: stored?.visitorId || crypto.randomUUID(),
        variant: override,
        method: "override",
      },
      shouldSetCookie: true,
    };
  }

  if (override === "RANDOM") {
    return { assignment: createRandomAssignment(), shouldSetCookie: true };
  }

  if (stored) return { assignment: stored, shouldSetCookie: false };
  return { assignment: createRandomAssignment(), shouldSetCookie: true };
}

function assignmentCookie(assignment, secure) {
  const parts = [
    `${ASSIGNMENT_COOKIE}=${encodeURIComponent(serializeAssignment(assignment))}`,
    "Path=/",
    `Max-Age=${ASSIGNMENT_MAX_AGE}`,
    "SameSite=Lax",
  ];
  if (secure) parts.push("Secure");
  return parts.join("; ");
}

export default function middleware(request) {
  const url = new URL(request.url);
  const route = ROUTES.get(url.pathname);
  if (!route) return next();

  const { assignment, shouldSetCookie } = resolveAssignment(request);
  const headers = new Headers({
    "Vary": "Cookie",
    "X-Art-Pool-Experiment": `${EXPERIMENT_KEY}:${assignment.variant}`,
  });

  if (shouldSetCookie) {
    headers.set(
      "Set-Cookie",
      assignmentCookie(assignment, url.protocol === "https:"),
    );
  }

  const destination = new URL(request.url);
  destination.pathname = route[assignment.variant];
  destination.searchParams.delete("ab_override");

  if (destination.pathname === url.pathname && !url.searchParams.has("ab_override")) {
    return next({ headers });
  }

  return rewrite(destination, { headers });
}

export const config = {
  matcher: ["/", "/1-intro.dc.html", "/2-register.dc.html", "/3-complete.dc.html"],
};
