const loginView = document.querySelector("#login-view");
const dashboardView = document.querySelector("#dashboard-view");
const loginForm = document.querySelector("#admin-login-form");
const loginError = document.querySelector("#login-error");
const logoutButton = document.querySelector("#logout-button");
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
let selectedRegistrationId = null;
let currentPage = 1;
let totalPages = 1;

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

async function loadDashboard() {
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
    refreshButton.textContent = "데이터 새로고침";
  }
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
    await loadDashboard();
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
    registrationList.replaceChildren();
    registrationTableWrap.hidden = true;
    pagination.hidden = true;
    registrationDetail.hidden = true;
    logoutButton.disabled = false;
    showLogin();
  }
});

refreshButton.addEventListener("click", loadDashboard);
previousPageButton.addEventListener("click", () => loadRegistrationPage(currentPage - 1));
nextPageButton.addEventListener("click", () => loadRegistrationPage(currentPage + 1));
loadDashboard();
