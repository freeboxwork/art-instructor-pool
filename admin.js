const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#admin-login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
const adminViewButtons = [...document.querySelectorAll("[data-admin-view]")];
const adminPages = [...document.querySelectorAll("[data-admin-page]")];

const utmBuilderForm = document.querySelector("#utm-builder-form");
const utmBaseUrl = document.querySelector("#utm-base-url");
const utmSource = document.querySelector("#utm-source");
const utmMedium = document.querySelector("#utm-medium");
const utmCampaign = document.querySelector("#utm-campaign");
const utmPresetButtons = [...document.querySelectorAll("[data-utm-preset]")];
const utmGeneratedUrl = document.querySelector("#utm-generated-url");
const utmCopyButton = document.querySelector("#utm-copy-button");
const utmOpenLink = document.querySelector("#utm-open-link");
const utmOutputState = document.querySelector("#utm-output-state");
const utmBuilderStatus = document.querySelector("#utm-builder-status");

const analyticsRange = document.querySelector("#analytics-range");
const analyticsRefreshButton = document.querySelector("#analytics-refresh-button");
const analyticsSummaryCopy = document.querySelector("#analytics-summary-copy");
const analyticsStatus = document.querySelector("#analytics-status");
const analyticsUpdated = document.querySelector("#analytics-updated");
const analyticsFunnel = document.querySelector("#analytics-funnel");
const analyticsDaily = document.querySelector("#analytics-daily");
const analyticsTrendChart = document.querySelector("#analytics-trend-chart");
const analyticsTrendChartView = document.querySelector("#analytics-trend-chart-view");
const analyticsTrendTableView = document.querySelector("#analytics-trend-table-view");
const trendViewButtons = [...document.querySelectorAll("[data-trend-view]")];
const trendSeriesButtons = [...document.querySelectorAll("[data-trend-series]")];
const analyticsPages = document.querySelector("#analytics-pages");
const analyticsSources = document.querySelector("#analytics-sources");
const analyticsCampaigns = document.querySelector("#analytics-campaigns");

const refreshButton = document.querySelector("#refresh-button");
const registrationCount = document.querySelector("#registration-count");
const lastUpdated = document.querySelector("#last-updated");
const dashboardStatus = document.querySelector("#dashboard-status");
const listCount = document.querySelector("#list-count");
const listStatus = document.querySelector("#list-status");
const registrationTableWrap = document.querySelector("#registration-table-wrap");
const registrationList = document.querySelector("#registration-list");
const pagination = document.querySelector("#pagination");
const previousPageButton = document.querySelector("#previous-page");
const nextPageButton = document.querySelector("#next-page");
const pageNumbers = document.querySelector("#page-numbers");
const detailEmpty = document.querySelector("#detail-empty");
const registrationDetail = document.querySelector("#registration-detail");
const detailState = document.querySelector("#detail-state");
const detailError = document.querySelector("#detail-error");
const regionDistribution = document.querySelector("#region-distribution");
const careerDistribution = document.querySelector("#career-distribution");

const PAGE_SIZE = 15;
const SVG_NS = "http://www.w3.org/2000/svg";
const TREND_SERIES = {
  sessions: { label: "방문자", className: "is-sessions" },
  cta_clicks: { label: "CTA", className: "is-cta" },
  registrations: { label: "등록", className: "is-registrations" },
};
const trendSeriesVisibility = {
  sessions: true,
  cta_clicks: true,
  registrations: true,
};
let selectedRegistrationId = null;
let currentPage = 1;
let totalPages = 1;
let currentTrendView = "chart";
let dailyTrendRows = [];
let trendResizeFrame = null;

function viewFromHash() {
  const requestedView = window.location.hash.slice(1);
  return ["analytics", "links", "registrations"].includes(requestedView)
    ? requestedView
    : "analytics";
}

let currentView = viewFromHash();
let analyticsLoaded = false;
let linksLoaded = false;
let registrationsLoaded = false;

function showLogin(message = "") {
  dashboardView.hidden = true;
  loginView.hidden = false;
  loginError.textContent = message;
  loginError.hidden = !message;
  window.setTimeout(() => loginForm.elements.password.focus(), 0);
}

function showDashboard() {
  loginView.hidden = true;
  dashboardView.hidden = false;
}

function activateView(view, updateHash = false) {
  currentView = ["analytics", "links", "registrations"].includes(view) ? view : "analytics";

  for (const button of adminViewButtons) {
    button.setAttribute("aria-current", button.dataset.adminView === currentView ? "page" : "false");
  }
  for (const page of adminPages) {
    page.hidden = page.dataset.adminPage !== currentView;
  }

  if (updateHash) {
    history.replaceState(null, "", `#${currentView}`);
  }
}

async function apiRequest(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      Accept: "application/json",
      ...(options.body ? { "Content-Type": "application/json" } : {}),
      ...options.headers,
    },
  });
  const data = await response.json().catch(() => ({}));

  if (!response.ok) {
    const error = new Error(data.error || "요청을 처리하지 못했습니다.");
    error.status = response.status;
    throw error;
  }

  return data;
}

function normalizeUtmValue(value) {
  return value
    .trim()
    .replace(/\s+/g, "_")
    .replace(/[^a-zA-Z0-9가-힣._-]/g, "")
    .slice(0, 80);
}

function setUtmFieldError(name, message = "") {
  const field = utmBuilderForm.querySelector(`[data-utm-field="${name}"]`);
  const input = field?.querySelector("input");
  const error = field?.querySelector(".utm-field-error");
  if (!field || !input || !error) return;

  field.classList.toggle("is-invalid", Boolean(message));
  input.setAttribute("aria-invalid", String(Boolean(message)));
  error.textContent = message;
  error.hidden = !message;
}

function setUtmBuilderStatus(message = "", type = "") {
  utmBuilderStatus.textContent = message;
  utmBuilderStatus.className = `utm-builder-status${type ? ` is-${type}` : ""}`;
  utmBuilderStatus.hidden = !message;
}

function resetGeneratedUtmLink() {
  if (!utmGeneratedUrl.value.startsWith("http")) return;

  utmGeneratedUrl.value = "변경 내용을 반영하려면 UTM 링크 만들기 버튼을 다시 눌러 주세요.";
  utmOutputState.textContent = "변경 내용 있음";
  utmOutputState.classList.remove("is-ready");
  utmCopyButton.disabled = true;
  utmOpenLink.removeAttribute("href");
  utmOpenLink.removeAttribute("target");
  utmOpenLink.removeAttribute("rel");
  utmOpenLink.setAttribute("aria-disabled", "true");
  utmOpenLink.classList.add("is-disabled");
}

function renderGeneratedUtmLink(url, message = "링크가 준비되었습니다.") {
  utmGeneratedUrl.value = url;
  utmOutputState.textContent = "생성 완료";
  utmOutputState.classList.add("is-ready");
  utmCopyButton.disabled = false;
  utmOpenLink.href = url;
  utmOpenLink.target = "_blank";
  utmOpenLink.rel = "noopener noreferrer";
  utmOpenLink.setAttribute("aria-disabled", "false");
  utmOpenLink.classList.remove("is-disabled");
  setUtmBuilderStatus(message, "success");
}

function generateUtmLink({ commitValues = false } = {}) {
  const values = {
    source: normalizeUtmValue(utmSource.value),
    medium: normalizeUtmValue(utmMedium.value),
    campaign: normalizeUtmValue(utmCampaign.value),
  };
  const fields = [
    ["source", utmSource, values.source, "유입 출처를 입력해 주세요."],
    ["medium", utmMedium, values.medium, "유입 방식을 입력해 주세요."],
    ["campaign", utmCampaign, values.campaign, "캠페인 이름을 입력해 주세요."],
  ];
  let firstInvalidInput = null;

  for (const [name, input, value, message] of fields) {
    setUtmFieldError(name, value ? "" : message);
    if (!value && !firstInvalidInput) firstInvalidInput = input;
    if (commitValues && value) input.value = value;
  }

  if (firstInvalidInput) {
    setUtmBuilderStatus("필수 값을 모두 입력한 뒤 링크를 만들어 주세요.", "error");
    firstInvalidInput.focus();
    return null;
  }

  const url = new URL(utmBaseUrl.value);
  url.searchParams.set("utm_source", values.source);
  url.searchParams.set("utm_medium", values.medium);
  url.searchParams.set("utm_campaign", values.campaign);
  return url.toString();
}

async function copyGeneratedUtmLink() {
  const value = utmGeneratedUrl.value;
  if (!value) return;

  try {
    await navigator.clipboard.writeText(value);
  } catch {
    utmGeneratedUrl.focus();
    utmGeneratedUrl.select();
    document.execCommand("copy");
  }

  setUtmBuilderStatus("링크를 클립보드에 복사했습니다.", "success");
}

async function loadLinkBuilder() {
  try {
    await apiRequest("/api/admin/session");
    showDashboard();
    linksLoaded = true;
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      return;
    }
    showDashboard();
    setUtmBuilderStatus(error.message, "error");
  }
}

function formatDate(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";

  return new Intl.DateTimeFormat("ko-KR", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function formatRefreshTime(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "방금 업데이트";

  return `${new Intl.DateTimeFormat("ko-KR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date)} 기준`;
}

function formatAnalyticsDate(value) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("ko-KR", { month: "short", day: "numeric" }).format(date);
}

function renderAnalyticsMetric(name, value) {
  const element = document.querySelector(`[data-analytics-metric="${name}"]`);
  if (element) element.textContent = Number(value || 0).toLocaleString("ko-KR");
}

function renderAnalyticsSummary(data) {
  renderAnalyticsMetric("visitSessions", data.summary.visitSessions);
  renderAnalyticsMetric("pageViews", data.summary.pageViews);
  renderAnalyticsMetric("ctaClicks", data.summary.ctaClicks);
  renderAnalyticsMetric("registrations", data.summary.registrations);

  const conversionNote = document.querySelector('[data-analytics-note="conversionRate"]');
  conversionNote.textContent = `방문 대비 ${data.summary.conversionRate}%`;
  analyticsSummaryCopy.textContent = `최근 ${data.rangeDays}일 동안 ${data.summary.visitSessions.toLocaleString("ko-KR")}개의 익명 방문 세션이 집계되었습니다.`;
  analyticsUpdated.textContent = formatRefreshTime(data.generatedAt);
}

function renderFunnel(rows) {
  analyticsFunnel.replaceChildren();
  const firstCount = rows[0]?.count || 0;

  for (const [index, row] of rows.entries()) {
    const percentage = firstCount > 0 ? Math.round((row.count / firstCount) * 1000) / 10 : 0;
    const item = document.createElement("article");
    const number = document.createElement("span");
    const content = document.createElement("div");
    const heading = document.createElement("div");
    const label = document.createElement("strong");
    const count = document.createElement("span");
    const track = document.createElement("div");
    const value = document.createElement("span");

    item.className = "funnel-item";
    number.className = "funnel-number";
    number.textContent = String(index + 1).padStart(2, "0");
    content.className = "funnel-content";
    heading.className = "funnel-heading";
    label.textContent = row.label;
    count.textContent = `${row.count.toLocaleString("ko-KR")}세션 · ${percentage}%`;
    track.className = "funnel-track";
    value.className = "funnel-value";
    value.style.width = `${percentage}%`;
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${row.label} ${row.count}세션, 첫 단계 대비 ${percentage}%`);
    heading.append(label, count);
    track.append(value);
    content.append(heading, track);
    item.append(number, content);
    analyticsFunnel.append(item);
  }
}

function renderDaily(rows) {
  dailyTrendRows = rows;
  analyticsDaily.replaceChildren();
  const fragment = document.createDocumentFragment();

  for (const row of [...rows].reverse()) {
    const tableRow = document.createElement("tr");
    const date = document.createElement("th");
    const sessions = document.createElement("td");
    const clicks = document.createElement("td");
    const registrations = document.createElement("td");

    date.scope = "row";
    date.textContent = formatAnalyticsDate(row.date);
    sessions.textContent = row.sessions.toLocaleString("ko-KR");
    clicks.textContent = row.cta_clicks.toLocaleString("ko-KR");
    registrations.textContent = row.registrations.toLocaleString("ko-KR");
    tableRow.append(date, sessions, clicks, registrations);
    fragment.append(tableRow);
  }

  analyticsDaily.append(fragment);
  renderDailyChart(rows);
}

function createTrendSvgElement(tagName, attributes = {}) {
  const element = document.createElementNS(SVG_NS, tagName);
  for (const [name, value] of Object.entries(attributes)) {
    element.setAttribute(name, String(value));
  }
  return element;
}

function niceTrendMaximum(value) {
  const safeValue = Math.max(Number(value) || 0, 4);
  const magnitude = 10 ** Math.floor(Math.log10(safeValue));
  const normalized = safeValue / magnitude;
  const rounded = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return Math.max(4, Math.ceil((rounded * magnitude) / 4) * 4);
}

function trendTickIndexes(length) {
  if (length <= 7) return Array.from({ length }, (_, index) => index);
  const tickCount = length <= 31 ? 6 : 7;
  return [...new Set(Array.from(
    { length: tickCount },
    (_, index) => Math.round((index * (length - 1)) / (tickCount - 1)),
  ))];
}

function formatTrendAxisDate(value) {
  const date = new Date(`${value}T00:00:00+09:00`);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getMonth() + 1}/${date.getDate()}`;
}

function appendTrendPoint(group, x, y, seriesKey, titleText) {
  let point;

  if (seriesKey === "cta_clicks") {
    point = createTrendSvgElement("rect", {
      x: x - 3,
      y: y - 3,
      width: 6,
      height: 6,
      rx: 1,
    });
  } else if (seriesKey === "registrations") {
    point = createTrendSvgElement("polygon", {
      points: `${x},${y - 4} ${x + 4},${y} ${x},${y + 4} ${x - 4},${y}`,
    });
  } else {
    point = createTrendSvgElement("circle", { cx: x, cy: y, r: 3.5 });
  }

  point.setAttribute("class", `trend-point ${TREND_SERIES[seriesKey].className}`);
  const title = createTrendSvgElement("title");
  title.textContent = titleText;
  point.append(title);
  group.append(point);
}

function renderTrendEmpty(message) {
  const empty = document.createElement("p");
  empty.className = "trend-chart-empty";
  empty.textContent = message;
  analyticsTrendChart.replaceChildren(empty);
}

function renderDailyChart(rows) {
  if (!rows.length) {
    analyticsTrendChart.setAttribute("aria-label", "선택한 기간의 일별 분석 데이터가 없습니다.");
    renderTrendEmpty("선택한 기간의 데이터가 없습니다.");
    return;
  }

  const visibleSeries = Object.keys(TREND_SERIES).filter((key) => trendSeriesVisibility[key]);
  if (visibleSeries.length === 0) {
    analyticsTrendChart.setAttribute("aria-label", "현재 표시하도록 선택한 분석 지표가 없습니다.");
    renderTrendEmpty("그래프에서 확인할 지표를 선택해 주세요.");
    return;
  }

  const chartStyle = window.getComputedStyle(analyticsTrendChart);
  const horizontalPadding = Number.parseFloat(chartStyle.paddingLeft)
    + Number.parseFloat(chartStyle.paddingRight);
  const availableWidth = analyticsTrendChart.clientWidth - horizontalPadding;
  const width = Math.max(300, Math.round(availableWidth > 0 ? availableWidth : 760));
  const height = width < 400 ? 250 : width < 640 ? 290 : 310;
  const margins = { top: 22, right: 18, bottom: 44, left: 52 };
  const plotWidth = width - margins.left - margins.right;
  const plotHeight = height - margins.top - margins.bottom;
  const maximumValue = Math.max(...rows.flatMap((row) => (
    visibleSeries.map((key) => Number(row[key]) || 0)
  )));
  const yMaximum = niceTrendMaximum(maximumValue);
  const xPosition = (index) => (
    rows.length === 1
      ? margins.left + (plotWidth / 2)
      : margins.left + ((index / (rows.length - 1)) * plotWidth)
  );
  const yPosition = (value) => margins.top + plotHeight - ((value / yMaximum) * plotHeight);
  const svg = createTrendSvgElement("svg", {
    width,
    height,
    viewBox: `0 0 ${width} ${height}`,
    preserveAspectRatio: "xMidYMid meet",
    "aria-hidden": "true",
    focusable: "false",
  });

  for (let index = 0; index <= 4; index += 1) {
    const value = (yMaximum / 4) * index;
    const y = yPosition(value);
    const gridLine = createTrendSvgElement("line", {
      x1: margins.left,
      y1: y,
      x2: width - margins.right,
      y2: y,
      class: "trend-grid-line",
    });
    const label = createTrendSvgElement("text", {
      x: margins.left - 10,
      y: y + 4,
      class: "trend-axis-label is-y",
      "text-anchor": "end",
    });
    label.textContent = Number(value.toFixed(2)).toLocaleString("ko-KR");
    svg.append(gridLine, label);
  }

  const yAxis = createTrendSvgElement("line", {
    x1: margins.left,
    y1: margins.top,
    x2: margins.left,
    y2: margins.top + plotHeight,
    class: "trend-axis-line",
  });
  const xAxis = createTrendSvgElement("line", {
    x1: margins.left,
    y1: margins.top + plotHeight,
    x2: width - margins.right,
    y2: margins.top + plotHeight,
    class: "trend-axis-line",
  });
  svg.append(yAxis, xAxis);

  for (const index of trendTickIndexes(rows.length)) {
    const x = xPosition(index);
    const tick = createTrendSvgElement("line", {
      x1: x,
      y1: margins.top + plotHeight,
      x2: x,
      y2: margins.top + plotHeight + 5,
      class: "trend-axis-line",
    });
    const label = createTrendSvgElement("text", {
      x,
      y: height - 15,
      class: "trend-axis-label is-x",
      "text-anchor": "middle",
    });
    label.textContent = formatTrendAxisDate(rows[index].date);
    svg.append(tick, label);
  }

  for (const seriesKey of visibleSeries) {
    const series = TREND_SERIES[seriesKey];
    const points = rows.map((row, index) => ({
      x: xPosition(index),
      y: yPosition(Number(row[seriesKey]) || 0),
      value: Number(row[seriesKey]) || 0,
      date: row.date,
    }));
    const group = createTrendSvgElement("g", { class: `trend-series ${series.className}` });
    const path = createTrendSvgElement("path", {
      d: points.map(({ x, y }, index) => `${index === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`).join(" "),
      class: `trend-line ${series.className}`,
    });
    const pathTitle = createTrendSvgElement("title");
    pathTitle.textContent = `${series.label} 일별 변화`;
    path.append(pathTitle);
    group.append(path);

    if (rows.length <= 31) {
      for (const point of points) {
        appendTrendPoint(
          group,
          point.x,
          point.y,
          seriesKey,
          `${formatAnalyticsDate(point.date)} ${series.label} ${point.value.toLocaleString("ko-KR")}`,
        );
      }
    }
    svg.append(group);
  }

  analyticsTrendChart.setAttribute(
    "aria-label",
    `${formatAnalyticsDate(rows[0].date)}부터 ${formatAnalyticsDate(rows.at(-1).date)}까지 ${visibleSeries.map((key) => TREND_SERIES[key].label).join(", ")} 일별 변화 그래프`,
  );
  analyticsTrendChart.replaceChildren(svg);
}

function setTrendView(view) {
  currentTrendView = view === "table" ? "table" : "chart";
  analyticsTrendChartView.hidden = currentTrendView !== "chart";
  analyticsTrendTableView.hidden = currentTrendView !== "table";

  for (const button of trendViewButtons) {
    button.setAttribute("aria-pressed", String(button.dataset.trendView === currentTrendView));
  }

  if (currentTrendView === "chart") renderDailyChart(dailyTrendRows);
}

function createCompactStatItem(labelText, descriptionText, valueText) {
  const item = document.createElement("div");
  const copy = document.createElement("div");
  const label = document.createElement("strong");
  const description = document.createElement("span");
  const value = document.createElement("b");

  item.className = "compact-stat-item";
  label.textContent = labelText;
  description.textContent = descriptionText;
  value.textContent = valueText;
  copy.append(label, description);
  item.append(copy, value);
  return item;
}

function renderPageStats(rows) {
  const pageLabels = {
    intro_view: "소개 페이지",
    register_view: "등록 페이지",
    complete_view: "완료 페이지",
  };
  analyticsPages.replaceChildren();

  if (rows.length === 0) {
    analyticsPages.append(createCompactStatItem("데이터 없음", "분석 이벤트가 쌓이면 표시됩니다.", "—"));
    return;
  }

  for (const row of rows) {
    analyticsPages.append(createCompactStatItem(
      pageLabels[row.event] || row.event,
      `${row.sessions.toLocaleString("ko-KR")}개 방문 세션`,
      `${row.views.toLocaleString("ko-KR")}회`,
    ));
  }
}

function renderSources(rows) {
  analyticsSources.replaceChildren();

  if (rows.length === 0) {
    analyticsSources.append(createCompactStatItem("데이터 없음", "소개 페이지 방문 후 표시됩니다.", "—"));
    return;
  }

  for (const row of rows) {
    analyticsSources.append(createCompactStatItem(
      row.label,
      "소개 페이지 유입",
      `${row.sessions.toLocaleString("ko-KR")}세션`,
    ));
  }
}

function renderCampaigns(rows) {
  analyticsCampaigns.replaceChildren();

  if (rows.length === 0) {
    analyticsCampaigns.append(createCompactStatItem(
      "캠페인 데이터 없음",
      "UTM 링크로 소개 페이지를 방문하면 캠페인명이 표시됩니다.",
      "—",
    ));
    return;
  }

  for (const row of rows) {
    analyticsCampaigns.append(createCompactStatItem(
      row.campaign,
      `${row.source} · ${row.medium}`,
      `${row.sessions.toLocaleString("ko-KR")}세션`,
    ));
  }
}

function renderAnalytics(data) {
  renderAnalyticsSummary(data);
  renderFunnel(data.funnel);
  renderDaily(data.daily);
  renderPageStats(data.pages);
  renderSources(data.sources);
  renderCampaigns(data.campaigns || []);
}

async function loadAnalytics() {
  analyticsStatus.hidden = true;
  analyticsSummaryCopy.textContent = "익명 방문과 등록 전환 데이터를 불러오는 중입니다.";
  analyticsRefreshButton.disabled = true;
  analyticsRefreshButton.textContent = "업데이트 중...";

  try {
    const data = await apiRequest(`/api/admin/analytics?days=${analyticsRange.value}`);
    showDashboard();
    renderAnalytics(data);
    analyticsLoaded = true;
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      return;
    }
    showDashboard();
    analyticsStatus.textContent = error.message;
    analyticsStatus.hidden = false;
    analyticsSummaryCopy.textContent = "분석 정보를 불러오지 못했습니다.";
  } finally {
    analyticsRefreshButton.disabled = false;
    analyticsRefreshButton.textContent = "분석 새로고침";
  }
}

function setDetailValue(name, value) {
  const element = registrationDetail.querySelector(`[data-detail="${name}"]`);
  if (element) element.textContent = value ?? "-";
}

function renderDetail(registration) {
  setDetailValue("email", registration.email);
  setDetailValue("region", registration.region);
  setDetailValue("major", registration.major);
  setDetailValue("career", registration.career);
  setDetailValue("canTeachChildren", registration.canTeachChildren ? "가능해요" : "어려워요");
  setDetailValue("emailOptIn", registration.emailOptIn ? "동의" : "미동의");
  setDetailValue("consentedAt", formatDate(registration.consentedAt));
  setDetailValue("createdAt", formatDate(registration.createdAt));
  setDetailValue("updatedAt", formatDate(registration.updatedAt));

  detailState.textContent = registration.status === "active" ? "활성" : "수신 거부";
  detailState.classList.toggle("is-inactive", registration.status !== "active");
  detailState.hidden = false;
  detailEmpty.hidden = true;
  detailError.hidden = true;
  registrationDetail.hidden = false;
}

function selectListButton(id) {
  for (const button of registrationList.querySelectorAll("button")) {
    const isSelected = button.dataset.id === id;
    button.setAttribute("aria-current", String(isSelected));
    button.closest("tr")?.classList.toggle("is-selected", isSelected);
  }
}

function resetDetail() {
  selectedRegistrationId = null;
  registrationDetail.hidden = true;
  detailState.hidden = true;
  detailError.hidden = true;
  detailEmpty.hidden = false;
  detailEmpty.querySelector("strong").textContent = "등록자를 선택해 주세요";
  detailEmpty.querySelector("p").textContent = "이메일을 선택하면 활동 지역과 경력 정보를 확인할 수 있습니다.";
}

async function loadDetail(id) {
  selectedRegistrationId = id;
  selectListButton(id);
  registrationDetail.hidden = true;
  detailState.hidden = true;
  detailError.hidden = true;
  detailEmpty.hidden = false;
  detailEmpty.querySelector("strong").textContent = "상세 정보를 불러오는 중입니다";
  detailEmpty.querySelector("p").textContent = "잠시만 기다려 주세요.";

  try {
    const data = await apiRequest(`/api/admin/registrations/${encodeURIComponent(id)}`);
    renderDetail(data.registration);
  } catch (error) {
    if (error.status === 401) {
      showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }
    detailEmpty.hidden = true;
    detailError.textContent = error.message;
    detailError.hidden = false;
  }
}

function formatListDate(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(date);
}

function createRegistrationListRow(registration, index, paginationData) {
  const row = document.createElement("tr");
  const numberCell = document.createElement("td");
  const emailCell = document.createElement("td");
  const statusCell = document.createElement("td");
  const dateCell = document.createElement("td");
  const button = document.createElement("button");
  const status = document.createElement("span");

  const listNumber = paginationData.total
    - ((paginationData.page - 1) * paginationData.limit)
    - index;
  row.classList.toggle("is-selected", registration.id === selectedRegistrationId);
  numberCell.className = "cell-number";
  numberCell.textContent = listNumber.toLocaleString("ko-KR");
  emailCell.className = "cell-email";
  statusCell.className = "cell-status";
  dateCell.className = "cell-date";
  dateCell.dataset.label = "등록일";
  button.type = "button";
  button.dataset.id = registration.id;
  button.className = "list-email-button";
  button.setAttribute("aria-current", String(registration.id === selectedRegistrationId));
  button.setAttribute("aria-label", `${registration.email} 상세 정보 보기`);
  button.textContent = registration.email;
  status.className = `list-status-tag${registration.status === "active" ? "" : " is-inactive"}`;
  status.textContent = registration.status === "active" ? "활성" : "수신 거부";
  button.addEventListener("click", () => loadDetail(registration.id));
  emailCell.append(button);
  statusCell.append(status);
  dateCell.textContent = formatListDate(registration.createdAt);
  row.append(numberCell, emailCell, statusCell, dateCell);
  return row;
}

function renderMetric(name, value) {
  const element = document.querySelector(`[data-metric="${name}"]`);
  if (element) element.textContent = Number(value).toLocaleString("ko-KR");
}

function renderSummary(summary) {
  renderMetric("total", summary.total);
  renderMetric("recentSevenDays", summary.recentSevenDays);
  renderMetric("childTeaching", summary.childTeaching);
  renderMetric("regions", summary.regions);

  const childTeachingNote = document.querySelector('[data-metric-note="childTeaching"]');
  const percentage = summary.total > 0
    ? Math.round((summary.childTeaching / summary.total) * 100)
    : 0;
  childTeachingNote.textContent = `전체의 ${percentage}%`;
  registrationCount.textContent = `총 ${summary.total.toLocaleString("ko-KR")}명 중 ${summary.active.toLocaleString("ko-KR")}명이 이메일 안내에 동의하고 있습니다.`;
}

function renderDistribution(container, rows, emptyMessage) {
  container.replaceChildren();
  if (rows.length === 0) {
    const empty = document.createElement("p");
    empty.className = "distribution-empty";
    empty.textContent = emptyMessage;
    container.append(empty);
    return;
  }

  const maxCount = Math.max(...rows.map((row) => row.count), 1);
  for (const row of rows) {
    const item = document.createElement("div");
    const heading = document.createElement("div");
    const label = document.createElement("span");
    const count = document.createElement("strong");
    const track = document.createElement("div");
    const value = document.createElement("span");

    item.className = "distribution-item";
    heading.className = "distribution-heading";
    label.textContent = row.label;
    count.textContent = `${row.count.toLocaleString("ko-KR")}명`;
    track.className = "distribution-track";
    track.setAttribute("role", "img");
    track.setAttribute("aria-label", `${row.label} ${row.count}명`);
    value.className = "distribution-value";
    value.style.width = `${Math.max((row.count / maxCount) * 100, 4)}%`;
    heading.append(label, count);
    track.append(value);
    item.append(heading, track);
    container.append(item);
  }
}

function paginationItems(pageCount, activePage) {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, index) => index + 1);

  const pages = new Set([1, pageCount, activePage - 1, activePage, activePage + 1]);
  const sortedPages = [...pages].filter((page) => page >= 1 && page <= pageCount).sort((a, b) => a - b);
  const items = [];
  for (const page of sortedPages) {
    const previous = items.at(-1);
    if (typeof previous === "number" && page - previous > 1) items.push("ellipsis");
    items.push(page);
  }
  return items;
}

function renderPagination(paginationData) {
  currentPage = paginationData.page;
  totalPages = Math.max(1, Math.ceil(paginationData.total / paginationData.limit));
  previousPageButton.disabled = currentPage <= 1;
  nextPageButton.disabled = currentPage >= totalPages;
  pageNumbers.replaceChildren();

  for (const item of paginationItems(totalPages, currentPage)) {
    if (item === "ellipsis") {
      const ellipsis = document.createElement("span");
      ellipsis.className = "pagination-ellipsis";
      ellipsis.textContent = "…";
      ellipsis.setAttribute("aria-hidden", "true");
      pageNumbers.append(ellipsis);
      continue;
    }

    const button = document.createElement("button");
    button.type = "button";
    button.textContent = String(item);
    button.setAttribute("aria-label", `${item}페이지`);
    button.setAttribute("aria-current", item === currentPage ? "page" : "false");
    button.addEventListener("click", () => loadRegistrationPage(item));
    pageNumbers.append(button);
  }

  pagination.hidden = paginationData.total === 0;
}

function renderList(data) {
  registrationList.replaceChildren();
  listCount.textContent = `${data.pagination.total.toLocaleString("ko-KR")}명`;

  if (data.registrations.length === 0 && data.pagination.total > 0 && data.pagination.page > 1) {
    const lastPage = Math.ceil(data.pagination.total / data.pagination.limit);
    loadRegistrationPage(lastPage);
    return;
  }

  if (data.registrations.length === 0) {
    registrationTableWrap.hidden = true;
    pagination.hidden = true;
    listStatus.hidden = false;
    listStatus.textContent = "아직 등록된 사용자가 없습니다.";
    resetDetail();
    return;
  }

  listStatus.hidden = true;
  registrationTableWrap.hidden = false;
  const fragment = document.createDocumentFragment();
  data.registrations.forEach((registration, index) => {
    fragment.append(createRegistrationListRow(registration, index, data.pagination));
  });
  registrationList.append(fragment);
  renderPagination(data.pagination);

  const stillSelected = data.registrations.some(({ id }) => id === selectedRegistrationId);
  if (!stillSelected) resetDetail();
}

async function loadRegistrationPage(page) {
  if (page < 1 || page > totalPages) return;
  listStatus.hidden = false;
  listStatus.textContent = "등록자 목록을 불러오는 중입니다.";
  registrationTableWrap.hidden = true;
  pagination.hidden = true;

  try {
    const data = await apiRequest(`/api/admin/registrations?limit=${PAGE_SIZE}&page=${page}`);
    renderList(data);
  } catch (error) {
    if (error.status === 401) {
      showLogin("로그인 시간이 만료되었습니다. 다시 로그인해 주세요.");
      return;
    }
    listStatus.textContent = error.message;
  }
}

async function loadRegistrations() {
  dashboardStatus.hidden = true;
  listStatus.hidden = false;
  listStatus.textContent = "등록자 정보를 불러오는 중입니다.";
  refreshButton.disabled = true;
  refreshButton.textContent = "업데이트 중...";

  try {
    const [dashboardData, listData] = await Promise.all([
      apiRequest("/api/admin/dashboard"),
      apiRequest(`/api/admin/registrations?limit=${PAGE_SIZE}&page=${currentPage}`),
    ]);
    showDashboard();
    renderSummary(dashboardData.summary);
    renderDistribution(regionDistribution, dashboardData.distributions.regions, "활동 지역 데이터가 아직 없습니다.");
    renderDistribution(careerDistribution, dashboardData.distributions.careers, "경력 데이터가 아직 없습니다.");
    renderList(listData);
    lastUpdated.textContent = formatRefreshTime(dashboardData.generatedAt);
    registrationsLoaded = true;
  } catch (error) {
    if (error.status === 401) {
      showLogin();
      return;
    }
    showDashboard();
    dashboardStatus.textContent = error.message;
    dashboardStatus.hidden = false;
    listStatus.textContent = "목록을 불러오지 못했습니다.";
  } finally {
    refreshButton.disabled = false;
    refreshButton.textContent = "사용자 새로고침";
  }
}

async function loadCurrentView(force = false) {
  activateView(currentView);
  if (currentView === "analytics") {
    if (force || !analyticsLoaded) await loadAnalytics();
  } else if (currentView === "links") {
    if (force || !linksLoaded) await loadLinkBuilder();
    else showDashboard();
  } else if (force || !registrationsLoaded) {
    await loadRegistrations();
  }
}

for (const button of adminViewButtons) {
  button.addEventListener("click", async () => {
    activateView(button.dataset.adminView, true);
    await loadCurrentView();
  });
}

loginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const submitButton = loginForm.querySelector('button[type="submit"]');
  const password = loginForm.elements.password.value;
  loginError.hidden = true;
  submitButton.disabled = true;
  submitButton.textContent = "로그인 중...";

  try {
    await apiRequest("/api/admin/login", {
      method: "POST",
      body: JSON.stringify({ password }),
    });
    loginForm.reset();
    await loadCurrentView(true);
  } catch (error) {
    loginError.textContent = error.message;
    loginError.hidden = false;
    loginForm.elements.password.focus();
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = "대시보드 열기";
  }
});

logoutButton.addEventListener("click", async () => {
  logoutButton.disabled = true;
  try {
    await apiRequest("/api/admin/logout", { method: "POST" });
  } catch {
    // 로그아웃 요청이 실패해도 화면에서는 민감한 데이터를 즉시 숨깁니다.
  } finally {
    selectedRegistrationId = null;
    currentPage = 1;
    totalPages = 1;
    analyticsLoaded = false;
    linksLoaded = false;
    registrationsLoaded = false;
    registrationList.replaceChildren();
    registrationTableWrap.hidden = true;
    pagination.hidden = true;
    registrationDetail.hidden = true;
    logoutButton.disabled = false;
    showLogin();
  }
});

analyticsRefreshButton.addEventListener("click", () => loadAnalytics());
analyticsRange.addEventListener("change", () => loadAnalytics());
refreshButton.addEventListener("click", () => loadRegistrations());
previousPageButton.addEventListener("click", () => loadRegistrationPage(currentPage - 1));
nextPageButton.addEventListener("click", () => loadRegistrationPage(currentPage + 1));

for (const button of trendViewButtons) {
  button.addEventListener("click", () => setTrendView(button.dataset.trendView));
}

for (const button of trendSeriesButtons) {
  button.addEventListener("click", () => {
    const seriesKey = button.dataset.trendSeries;
    if (!(seriesKey in trendSeriesVisibility)) return;
    trendSeriesVisibility[seriesKey] = !trendSeriesVisibility[seriesKey];
    button.setAttribute("aria-pressed", String(trendSeriesVisibility[seriesKey]));
    renderDailyChart(dailyTrendRows);
  });
}

window.addEventListener("resize", () => {
  if (currentTrendView !== "chart" || dailyTrendRows.length === 0) return;
  window.cancelAnimationFrame(trendResizeFrame);
  trendResizeFrame = window.requestAnimationFrame(() => renderDailyChart(dailyTrendRows));
});

utmBuilderForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const originalValues = [utmSource.value, utmMedium.value, utmCampaign.value];
  const url = generateUtmLink({ commitValues: true });
  if (!url) return;

  const normalizedValues = [utmSource.value, utmMedium.value, utmCampaign.value];
  const wasNormalized = originalValues.some((value, index) => value !== normalizedValues[index]);
  renderGeneratedUtmLink(
    url,
    wasNormalized
      ? "공백과 사용할 수 없는 문자를 정리해 링크를 만들었습니다."
      : "링크가 준비되었습니다.",
  );
});

for (const input of [utmSource, utmMedium, utmCampaign]) {
  input.addEventListener("input", () => {
    setUtmFieldError(input.id.replace("utm-", ""));
    setUtmBuilderStatus();
    resetGeneratedUtmLink();
  });
}

for (const button of utmPresetButtons) {
  button.addEventListener("click", () => {
    utmSource.value = button.dataset.source;
    utmMedium.value = button.dataset.medium;
    setUtmFieldError("source");
    setUtmFieldError("medium");
    setUtmBuilderStatus();
    resetGeneratedUtmLink();
    for (const preset of utmPresetButtons) {
      preset.setAttribute("aria-pressed", String(preset === button));
    }
    utmCampaign.focus();
  });
}

utmCopyButton.addEventListener("click", copyGeneratedUtmLink);
utmOpenLink.addEventListener("click", (event) => {
  if (utmOpenLink.getAttribute("aria-disabled") === "true") event.preventDefault();
});

window.addEventListener("hashchange", () => {
  const requestedView = viewFromHash();
  if (requestedView === currentView) return;
  activateView(requestedView);
  loadCurrentView();
});

activateView(currentView);
loadCurrentView();
