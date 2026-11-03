const form = document.querySelector("#downloadForm");
const languageSelect = document.querySelector("#subtitle_language");
const courseInput = document.querySelector("#course");
const pathInput = document.querySelector("#path");
const versionLabel = document.querySelector("#version");
const messageBox = document.querySelector("#message");
const logs = document.querySelector("#logs");
const logStream = document.querySelector("#logStream");
const activityTree = document.querySelector("#activityTree");
const jobState = document.querySelector("#jobState");
const downloadBtn = document.querySelector("#downloadBtn");
const pauseBtn = document.querySelector("#pauseBtn");
const cancelBtn = document.querySelector("#cancelBtn");
const refreshBtn = document.querySelector("#refreshBtn");
const selectFolderBtn = document.querySelector("#selectFolderBtn");
const loginCheckBtn = document.querySelector("#loginCheckBtn");
const settingsToggleBtn = document.querySelector("#settingsToggleBtn");
const themeToggleBtn = document.querySelector("#themeToggleBtn");
const deleteCourseBtn = document.querySelector("#deleteCourseBtn");
const openCourseBtn = document.querySelector("#openCourseBtn");
const retryCourseBtn = document.querySelector("#retryCourseBtn");
const settingsPanel = document.querySelector("#settingsPanel");
const expandTreeBtn = document.querySelector("#expandTreeBtn");
const collapseTreeBtn = document.querySelector("#collapseTreeBtn");
const courseClearBtn = document.querySelector("#courseClearBtn");
const downloadQueue = document.querySelector("#downloadQueue");
const queueList = document.querySelector("#queueList");
const queueTitle = document.querySelector("#queueTitle");
const queueSummary = document.querySelector("#queueSummary");
const queueCurrent = document.querySelector("#queueCurrent");
const startQueueBtn = document.querySelector("#startQueueBtn");
const clearQueueBtn = document.querySelector("#clearQueueBtn");
let renderedQueueMarkup = null;
const bulkLinksToggleBtn = document.querySelector("#bulkLinksToggleBtn");
const bulkLinksPanel = document.querySelector("#bulkLinksPanel");
const bulkLinksInput = document.querySelector("#bulkLinksInput");
const bulkLinksCount = document.querySelector("#bulkLinksCount");
const bulkQueueBtn = document.querySelector("#bulkQueueBtn");
const recentCoursesSection = document.querySelector("#recentCourses");
const recentCoursesGrid = document.querySelector("#recentCoursesGrid");
const backToCoursesBtn = document.querySelector("#backToCoursesBtn");
const authBrowserSelect = document.querySelector("#auth_browser");
const authProfileSelect = document.querySelector("#auth_profile");
const authRefreshBtn = document.querySelector("#authRefreshBtn");
const authCauthInput = document.querySelector("#auth_cauth");
const authApplyBtn = document.querySelector("#authApplyBtn");
const authHint = document.querySelector("#authHint");
const activityBody = document.querySelector("#activityBody");
const jobProgress = document.querySelector("#jobProgress");
const jobProgressLabel = document.querySelector("#jobProgressLabel");
const jobProgressCount = document.querySelector("#jobProgressCount");
const jobProgressTrack = document.querySelector("#jobProgressTrack");
const jobProgressFill = document.querySelector("#jobProgressFill");
const jobProgressFile = document.querySelector("#jobProgressFile");
const jobProgressStats = document.querySelector("#jobProgressStats");
const logCount = document.querySelector("#logCount");
const logLevelFilter = document.querySelector("#logLevelFilter");
const logAutoScroll = document.querySelector("#logAutoScroll");
const logCopyBtn = document.querySelector("#logCopyBtn");
const logClearBtn = document.querySelector("#logClearBtn");
const jobRetryNote = document.querySelector("#jobRetryNote");
const failedFiles = document.querySelector("#failedFiles");
const failedFilesList = document.querySelector("#failedFilesList");
const failedFilesTitle = document.querySelector("#failedFilesTitle");
const retryFailedBtn = document.querySelector("#retryFailedBtn");
const dismissFailedBtn = document.querySelector("#dismissFailedBtn");

let statusTimer = null;
// Live log buffer. The server streams only entries newer than logCursor, so a
// long course never re-sends (or silently truncates) its whole log.
let logEntries = [];
let logCursor = 0;
let logHiddenBefore = 0;
let downloadCount = 0;
let currentCourseFolder = "";
let currentCourseName = "";
let lastProgressKey = "";
let loginOpened = false;
let authPollTimer = null;
let loginWindow = null;
let currentStatus = { running: false, status: "idle" };
let canResumeCurrentCourse = false;
let authCheckPromise = null;
let statusMessages = [];
let selectedTreeId = "";
let selectedTreeView = "content";
let currentTreeNodes = [];
let currentSidebarNodes = [];
let downloadedActivityGroups = [];
let lastSessionLogGroups = [];
let activeTreeId = "";
let userChangedExpansion = false;
let autoExpandedInitialTree = false;
let lastDownloadStateAt = 0;
let downloadStatePromise = null;
const expandedTreeIds = new Set();

const AUTH_BROWSER_STORAGE_KEY = "courseraDownloader.authBrowser";
const AUTH_PROFILE_STORAGE_KEY = "courseraDownloader.authProfile";
const AUTH_HINT_MESSAGE =
  "Login not detected yet. Sign in to coursera.org in the same browser, then click Login again. " +
  "Chrome and Edge cookies are protected on Windows, so Firefox is the most reliable choice. " +
  "You can also paste the CAUTH cookie under Settings.";
const AUTH_STORAGE_KEY = "courseraDownloader.authStatus";
const SETTINGS_STORAGE_KEY = "courseraDownloader.settingsVisible.v3";
const COURSE_INPUT_STORAGE_KEY = "courseraDownloader.lastCourseInput.v3";
console.info("Coursera Downloader UI loaded: 20261103-back");

// Restore log view preferences. Reading them here (not at first poll) means the
// filter is already correct when the first lines arrive.
try {
  const savedLevel = localStorage.getItem("courseraDownloader.logLevel");
  if (savedLevel && document.querySelector("#logLevelFilter")) {
    document.querySelector("#logLevelFilter").value = savedLevel;
  }
  const savedScroll = localStorage.getItem("courseraDownloader.logAutoScroll");
  if (savedScroll !== null && document.querySelector("#logAutoScroll")) {
    document.querySelector("#logAutoScroll").checked = savedScroll !== "0";
  }
} catch {
  /* localStorage can be unavailable in private mode */
}

function treeNeedsStateRender() {
  return (
    !currentSidebarNodes.length ||
    /Waiting for site tree manifest|No activity yet/i.test(activityTree.textContent || "")
  );
}

function showMessage(text, ok = false) {
  const message = cleanDisplayMessage(text);
  messageBox.hidden = true;
  messageBox.textContent = "";
  if (!message) return;
  statusMessages.push({ text: message, ok, time: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }) });
  statusMessages = statusMessages.slice(-20);
  renderInlineStatusMessages();
}

function clearMessage() {
  messageBox.hidden = true;
  messageBox.textContent = "";
  messageBox.classList.remove("ok");
}

function statusMessagesHtml() {
  return statusMessages.map((item) => `
    <div class="log-status ${item.ok ? "ok" : "bad"}">
      <span>${escapeHtml(item.time)}</span>
      <p>${escapeHtml(item.text)}</p>
    </div>
  `).join("");
}

function renderInlineStatusMessages() {
  const existingCourses = logs.querySelectorAll(".folder-detail").length;
  if (existingCourses) {
    logs.querySelectorAll(".log-status").forEach((item) => item.remove());
    logs.insertAdjacentHTML("afterbegin", statusMessagesHtml());
    return;
  }
  logs.innerHTML = statusMessagesHtml() || "No download has started.";
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || "Request failed.");
  }
  return data;
}

function fillSelect(select, items, selected) {
  select.innerHTML = "";
  items.forEach((item) => {
    const option = document.createElement("option");
    option.value = item;
    option.textContent = item;
    option.selected = item === selected;
    select.append(option);
  });
}

const JOBS_STORAGE_KEY = "courseraDownloader.jobs";

function restoreJobsPreference() {
  const select = document.querySelector("#jobs");
  if (!select) return;
  try {
    const saved = localStorage.getItem(JOBS_STORAGE_KEY);
    if (saved) {
      const option = Array.from(select.options).find((o) => o.value === saved);
      if (option) select.value = saved;
    }
  } catch {
    /* ignore unavailable storage */
  }
}

// Wire the control once, at load, so it works even before the first download
// state request completes.
(function initJobsPreference() {
  restoreJobsPreference();
  const select = document.querySelector("#jobs");
  if (!select) return;
  select.addEventListener("change", () => {
    try {
      localStorage.setItem(JOBS_STORAGE_KEY, select.value);
    } catch {
      /* ignore */
    }
  });
})();

const SPEED_STORAGE_KEY = "courseraDownloader.speedLimit";

(function initSpeedPreference() {
  const select = document.querySelector("#speed_limit");
  if (!select) return;
  try {
    const saved = localStorage.getItem(SPEED_STORAGE_KEY);
    if (saved && Array.from(select.options).some((o) => o.value === saved)) {
      select.value = saved;
    }
  } catch {
    /* ignore */
  }
  select.addEventListener("change", () => {
    try {
      localStorage.setItem(SPEED_STORAGE_KEY, select.value);
    } catch {
      /* ignore */
    }
  });
})();

function payloadFromForm() {
  const formData = new FormData(form);
  return {
    course: formData.get("course"),
    path: formData.get("path"),
    video_resolution: formData.get("video_resolution"),
    subtitle_language: formData.get("subtitle_language"),
    jobs: Number(formData.get("jobs")) || 1,
    speed_limit: Number(formData.get("speed_limit")) || 0,
  };
}

function rememberCourseInput() {
  const value = courseInput.value.trim();
  if (value) {
    localStorage.setItem(COURSE_INPUT_STORAGE_KEY, value);
  } else {
    localStorage.removeItem(COURSE_INPUT_STORAGE_KEY);
  }
}

function updateClearButtonVisibility() {
  if (!courseClearBtn) return;
  courseClearBtn.hidden = !courseInput.value;
}

function clearCourseInput() {
  if (result.queued) {
    courseInput.value = "";
    localStorage.removeItem(COURSE_INPUT_STORAGE_KEY);
  } else {
    rememberCourseInput();
  }
  hideCourseHistory();
  downloadedActivityGroups = [];
  lastSessionLogGroups = [];
  currentTreeNodes = [];
  currentSidebarNodes = [];
  selectedTreeId = "";
  canResumeCurrentCourse = false;
  if (activityTree) activityTree.textContent = "";
  if (logs) logs.innerHTML = "";
  updateClearButtonVisibility();
  refreshDownloadButton();
  showRecentCoursesLanding();
  courseInput.focus();
}

// True while the recent-courses list is the visible screen. The status poll
// renders the tree on every tick, which used to yank the landing away the
// moment a course folder had any content. This flag lets an explicit Back
// click win over that until the user picks a course again.
let showingCourseLanding = false;

function showRecentCoursesLanding() {
  if (!recentCoursesSection || !activityBody) return;
  // Always show the list when asked. This used to return early whenever a
  // course was loaded or the input had text, so the Back button had nothing
  // to show: the landing could be hidden but never brought back.
  const list = getCourseHistory();
  const empty = document.querySelector("#recentCoursesEmpty");
  recentCoursesGrid.innerHTML = list.map((url) => `
    <div class="recent-course-card" role="button" tabindex="0" data-recent-pick="${escapeHtml(url)}" title="${escapeHtml(url)}">
      <span class="recent-course-icon">🎓</span>
      <span class="recent-course-title">${escapeHtml(courseTitleFromUrl(url))}</span>
      <span class="recent-course-url">${escapeHtml(url)}</span>
      <button type="button" class="recent-course-remove" data-history-remove="${escapeHtml(url)}" aria-label="Remove" title="Remove from history">×</button>
    </div>
  `).join("");
  if (empty) empty.hidden = list.length > 0;
  recentCoursesSection.hidden = false;
  activityBody.hidden = true;
  showingCourseLanding = true;
  updateBackButton();
}

function hideRecentCoursesLanding(options) {
  // The background poll must not pull the user out of the list they just
  // navigated back to; only an explicit action (picking a course, typing a
  // URL, starting a download) should.
  if (options && options.auto && showingCourseLanding) return;
  showingCourseLanding = false;
  if (recentCoursesSection) recentCoursesSection.hidden = true;
  if (activityBody) activityBody.hidden = false;
  updateBackButton();
}

// The Back button only makes sense when there is a list to go back to, so it is
// hidden when the history is empty rather than offering a dead end.
function updateBackButton() {
  if (!backToCoursesBtn) return;
  const hasHistory = getCourseHistory().length > 0;
  const onLanding = recentCoursesSection ? !recentCoursesSection.hidden : false;
  backToCoursesBtn.hidden = !hasHistory || onLanding;
  backToCoursesBtn.textContent = "\u2190 All courses";
  const viewing = courseInput && courseInput.value.trim() ? courseInput.value.trim() : "";
  backToCoursesBtn.title = viewing
    ? `Back to the recent courses list (currently viewing ${courseTitleFromUrl(viewing)})`
    : "Back to the recent courses list";
}

function courseTitleFromUrl(url) {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    const last = parts[parts.length - 1] || u.hostname;
    return last.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
  } catch (error) {
    return url;
  }
}

const COURSE_HISTORY_KEY = "courseraDownloader.courseHistory.v1";
const COURSE_HISTORY_PAGE_SIZE = 5;
const COURSE_HISTORY_MAX = 50;
let courseHistoryPage = 0;
let courseHistorySuppressOpen = false;

function getCourseHistory() {
  try {
    const raw = localStorage.getItem(COURSE_HISTORY_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === "string" && item) : [];
  } catch (error) {
    return [];
  }
}

function setCourseHistory(list) {
  localStorage.setItem(COURSE_HISTORY_KEY, JSON.stringify(list.slice(0, COURSE_HISTORY_MAX)));
}

function addToCourseHistory(value) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return;
  const list = getCourseHistory().filter((item) => item !== trimmed);
  list.unshift(trimmed);
  setCourseHistory(list);
}

function removeFromCourseHistory(value) {
  setCourseHistory(getCourseHistory().filter((item) => item !== value));
}

function filteredCourseHistory() {
  const list = getCourseHistory();
  const filter = courseInput.value.trim().toLowerCase();
  if (!filter) return list;
  return list.filter((item) => item.toLowerCase().includes(filter) && item.toLowerCase() !== filter);
}

function renderCourseHistory() {
  const dropdown = document.querySelector("#courseHistory");
  if (!dropdown) return;
  const list = filteredCourseHistory();
  if (!list.length) {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
    return;
  }
  const totalPages = Math.max(1, Math.ceil(list.length / COURSE_HISTORY_PAGE_SIZE));
  if (courseHistoryPage >= totalPages) courseHistoryPage = 0;
  const start = courseHistoryPage * COURSE_HISTORY_PAGE_SIZE;
  const pageItems = list.slice(start, start + COURSE_HISTORY_PAGE_SIZE);
  const showPagination = list.length > COURSE_HISTORY_PAGE_SIZE;
  dropdown.innerHTML = `
    ${pageItems.map((url) => `
      <li class="course-history-item">
        <button type="button" class="course-history-pick" data-history-pick="${escapeHtml(url)}" title="${escapeHtml(url)}">${escapeHtml(url)}</button>
        <button type="button" class="course-history-remove" data-history-remove="${escapeHtml(url)}" title="Remove from history" aria-label="Remove">×</button>
      </li>
    `).join("")}
    ${showPagination ? `
      <li class="course-history-pagination">
        <button type="button" data-history-prev ${courseHistoryPage === 0 ? "disabled" : ""}>‹ Prev</button>
        <span>Page ${courseHistoryPage + 1} / ${totalPages}</span>
        <button type="button" data-history-next ${courseHistoryPage >= totalPages - 1 ? "disabled" : ""}>Next ›</button>
      </li>
    ` : ""}
  `;
  dropdown.hidden = false;
}

function showCourseHistory() {
  if (courseHistorySuppressOpen) return;
  courseHistoryPage = 0;
  renderCourseHistory();
}

function hideCourseHistory() {
  const dropdown = document.querySelector("#courseHistory");
  if (dropdown) {
    dropdown.hidden = true;
    dropdown.innerHTML = "";
  }
}

function refreshDownloadButton() {
  const state = currentStatus.status || "idle";
  const running = Boolean(currentStatus.running);
  const paused = state === "paused";
  const canceling = state === "canceling";

  const completed = isCurrentCourseCompleted();

  // The submit button is never a pause button. It used to turn into "Pause"
  // while a download ran, which is why pasting a second link paused the first
  // instead of queueing it. Pausing is what the dedicated Pause button is for.
  downloadBtn.disabled = canceling;
  downloadBtn.textContent = running
    ? "Add to queue"
    : paused
      ? "Resume"
      : completed
        ? "Preview"
        : canResumeCurrentCourse
          ? "Resume"
          : "Download";
  downloadBtn.classList.toggle("preview-mode", !running && !canceling && completed);
  downloadBtn.classList.toggle("queue-mode", running && !canceling);
  downloadBtn.title = running
    ? "Download this course after the current one finishes"
    : "";

  // Pause/Resume becomes a real, visible control while a job is running.
  pauseBtn.hidden = !running || canceling;
  pauseBtn.textContent = paused ? "Resume" : "Pause";
  cancelBtn.hidden = !running;
  cancelBtn.disabled = canceling;
}

function isCurrentCourseCompleted() {
  if (!downloadedActivityGroups.length) return false;
  const completedStatuses = new Set(["downloaded", "completed"]);
  return downloadedActivityGroups.every((group) => completedStatuses.has(group.status));
}

function previewFolderPath() {
  if (!downloadedActivityGroups.length) return "";
  const first = downloadedActivityGroups[0];
  const firstPath = first && first.path ? String(first.path) : "";
  if (!firstPath) return "";
  if (downloadedActivityGroups.length === 1) {
    return firstPath;
  }
  return firstPath.replace(/[\\/][^\\/]+[\\/]?$/, "") || firstPath;
}

function setRunningState(running, state = "idle") {
  currentStatus = { ...currentStatus, running, status: state };
  refreshDownloadButton();
}

function setSettingsVisible(visible, remember = false) {
  settingsPanel.hidden = !visible;
  settingsToggleBtn.classList.toggle("active", visible);
  settingsToggleBtn.setAttribute("aria-expanded", String(visible));
  if (remember) {
    localStorage.setItem(SETTINGS_STORAGE_KEY, visible ? "1" : "0");
  }
}

function restoreSettingsVisible() {
  const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
  if (stored === "1" || stored === "0") {
    setSettingsVisible(stored === "1");
    return true;
  }
  return false;
}

function setAuthMessage(text, ok = null, userName = "") {
  loginCheckBtn.textContent = authButtonLabel(text, ok, userName);
  loginCheckBtn.classList.toggle("ok", ok === true);
  loginCheckBtn.classList.toggle("bad", ok === false);
}

function cleanAuthMessage(text) {
  return String(text || "")
    .replace(/\s*detected from\s+[^.]+\.?/gi, "")
    .replace(/\s+/g, " ")
    .trim();
}

function cleanDisplayMessage(text) {
  const message = cleanAuthMessage(text);
  if (/could not auto-detect your coursera login/i.test(message)) {
    return AUTH_HINT_MESSAGE;
  }
  return message;
}

function authFailureMessage(result) {
  const details = String((result && result.details) || "").trim();
  if (!details) return AUTH_HINT_MESSAGE;
  return `${AUTH_HINT_MESSAGE} Details: ${details}`;
}

function setAuthHint(text) {
  if (authHint) authHint.textContent = text;
}

function authPayload(extra = {}) {
  const selected = authBrowserSelect ? authBrowserSelect.value.trim() : "";
  const profile = authProfileSelect ? authProfileSelect.value : "";
  const cauth = authCauthInput ? authCauthInput.value.trim() : "";
  if (cauth) {
    return { ...extra, browser: "manual", cauth };
  }
  if (profile) {
    return { ...extra, browser: "", profile };
  }
  return { ...extra, browser: selected };
}

function profileOptionLabel(profile) {
  const label = profile.label || profile.folder;
  const email = String(profile.email || "").trim();
  const browserName = profile.browser.charAt(0).toUpperCase() + profile.browser.slice(1);
  const details = [browserName];
  if (profile.folder && profile.folder !== label) details.push(profile.folder);
  const name = email && !label.toLowerCase().includes(email.toLowerCase()) ? `${label} · ${email}` : label;
  return `${name} (${details.join(", ")})`;
}

async function loadBrowserProfiles(config) {
  if (!authProfileSelect) return;
  const savedProfile = (config && config.auth && config.auth.saved_profile) || "";
  const remembered = localStorage.getItem(AUTH_PROFILE_STORAGE_KEY) || savedProfile;
  let profiles = [];
  try {
    const data = await requestJson("/api/browser-profiles", { method: "POST", body: "{}" });
    profiles = data.profiles || [];
  } catch (error) {
  }

  authProfileSelect.innerHTML = "";
  const auto = document.createElement("option");
  auto.value = "";
  auto.textContent = profiles.length
    ? "Auto-detect all browser profiles"
    : "Auto-detect (no readable browser profiles found)";
  authProfileSelect.append(auto);

  profiles.forEach((profile) => {
    const option = document.createElement("option");
    option.value = profile.path;
    option.textContent = profileOptionLabel(profile);
    authProfileSelect.append(option);
  });

  if (remembered && profiles.some((profile) => profile.path === remembered)) {
    authProfileSelect.value = remembered;
  } else if (remembered && !profiles.length) {
    // Keep the choice visible even if the profile list is unavailable right now.
    const option = document.createElement("option");
    option.value = remembered;
    option.textContent = "Saved profile";
    authProfileSelect.append(option);
    authProfileSelect.value = remembered;
  }
}

function isAuthDetectionFailure(message) {
  return /could not auto-detect your coursera login/i.test(message || "");
}

function authButtonLabel(text, ok = null, userName = "") {
  const name = String(userName || "").trim();
  if (ok === true && name) {
    return `Welcome, ${name}`;
  }

  const message = cleanAuthMessage(text);
  const loggedInMatch = message.match(/^logged in as\s+(.+?)\.?$/i);
  if (ok === true && loggedInMatch && loggedInMatch[1].trim()) {
    return `Welcome, ${loggedInMatch[1].trim()}`;
  }

  if (ok === true && /^logged in( as\s+.+?)?\.?(\s|$)/i.test(message)) {
    return "Welcome";
  }

  if (/could not auto-detect your coursera login/i.test(message)) {
    return "Login not detected";
  }

  return message || "Login";
}

function rememberAuth(result) {
  if (!result.authenticated) return;
  const message = cleanAuthMessage(result.message);
  localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({
    message,
    userName: result.user_name || "",
    savedAt: Date.now(),
  }));
}

function restoreAuth() {
  try {
    const stored = JSON.parse(localStorage.getItem(AUTH_STORAGE_KEY) || "null");
    if (stored && stored.message) {
      const message = cleanAuthMessage(stored.message);
      if (message !== stored.message) {
        localStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify({ ...stored, message }));
      }
      setAuthMessage(message, true, stored.userName);
      loginOpened = true;
      return true;
    }
  } catch {
    localStorage.removeItem(AUTH_STORAGE_KEY);
  }
  return false;
}

const LOG_LEVEL_RANK = { debug: 0, info: 1, warning: 2, error: 3 };

function logLevelName(entry) {
  return String((entry && entry.level) || "INFO").toLowerCase();
}

function applyLogEntries(entries, resync) {
  if (!entries || !entries.length) return;
  if (resync) {
    // The server dropped older lines; restart cleanly rather than leave a hole.
    logEntries = [];
    logHiddenBefore = 0;
  }
  entries.forEach((entry) => {
    if (!entry || typeof entry.seq !== "number") return;
    if (entry.seq <= logCursor) return;
    logCursor = entry.seq;
    logEntries.push(entry);
  });
  // Keep the browser responsive: an hour-long course can log 100k lines.
  const MAX_VIEW = 5000;
  if (logEntries.length > MAX_VIEW) {
    const dropped = logEntries.length - MAX_VIEW;
    logEntries = logEntries.slice(dropped);
    logHiddenBefore += dropped;
  }
}

function visibleLogEntries() {
  const min = logLevelFilter ? logLevelFilter.value : "all";
  if (min === "all") return logEntries;
  const threshold = min === "info" ? 1 : min === "warning" ? 2 : 3;
  return logEntries.filter((entry) => (LOG_LEVEL_RANK[logLevelName(entry)] || 1) >= threshold);
}

function renderLogStream() {
  if (!logStream) return;
  const entries = visibleLogEntries();
  const total = logEntries.length + logHiddenBefore;
  if (logCount) {
    logCount.textContent = total
      ? `${entries.length} of ${total} lines${logHiddenBefore ? " (older lines dropped)" : ""}`
      : "";
  }
  if (!entries.length) {
    logStream.innerHTML = `<div class="activity-note">${
      total ? "No lines match this filter." : "No log lines yet."
    }</div>`;
    return;
  }
  logStream.innerHTML = entries
    .map((entry) => {
      const level = logLevelName(entry);
      const time = entry.time ? `<span class="log-time">${escapeHtml(entry.time)}</span> ` : "";
      return `<div class="log-line log-line-${level}">${time}${escapeHtml(entry.message || "")}</div>`;
    })
    .join("");
  if (!logAutoScroll || logAutoScroll.checked) {
    logStream.scrollTop = logStream.scrollHeight;
  }
}

function syncLogPaneVisibility() {
  // While a job streams lines, the raw log is the useful pane; the grouped tree
  // detail is what the user wants once it has finished.
  if (!logs || !logStream) return;
  const streaming = logEntries.length > 0 && Boolean(currentStatus.running);
  logs.hidden = streaming;
  logStream.hidden = !streaming;
}

function formatBytesShort(value) {
  const size = Number(value) || 0;
  if (size <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  const scaled = size / Math.pow(1024, index);
  return `${scaled.toFixed(scaled >= 10 || index === 0 ? 0 : 1)} ${units[index]}`;
}

function formatDuration(seconds) {
  const total = Math.max(0, Math.round(Number(seconds) || 0));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m) return `${m}m ${String(s).padStart(2, "0")}s`;
  return `${s}s`;
}

let failedFilesDismissed = false;

function renderFailedFiles(status) {
  if (!failedFiles) return;
  const failed = Array.isArray(status.failed_files) ? status.failed_files : [];
  const retrying = Array.isArray(status.retrying_files) ? status.retrying_files : [];

  // A note while automatic retries are in progress, so a temporary failure
  // does not look like a permanent one.
  if (jobRetryNote) {
    if (retrying.length && !failed.length) {
      jobRetryNote.hidden = false;
      jobRetryNote.textContent = `Retrying ${retrying.length} file${
        retrying.length === 1 ? "" : "s"
      } automatically…`;
    } else {
      jobRetryNote.hidden = true;
    }
  }

  if (!failed.length || failedFilesDismissed) {
    failedFiles.hidden = true;
    return;
  }

  failedFiles.hidden = false;
  if (failedFilesTitle) {
    failedFilesTitle.textContent = `${failed.length} file${
      failed.length === 1 ? "" : "s"
    } failed`;
  }
  failedFilesList.innerHTML = failed
    .map((item) => {
      const attempts = item.attempts ? ` — ${item.attempts} attempts` : "";
      return `<li class="failed-file">
        <span class="failed-file-name" title="${escapeHtml(item.filename || "")}">${escapeHtml(
          item.name || item.filename || "unknown"
        )}</span>
        <span class="failed-file-reason">${escapeHtml(item.reason || "unknown error")}${attempts}</span>
      </li>`;
    })
    .join("");
}

function renderProgress(status) {
  if (!jobProgress) return;
  const progress = status.progress || {};
  const running = Boolean(status.running);
  const paused = Boolean(status.paused);
  const total = Number(progress.total) || 0;
  const done = Number(progress.bytes) || 0;

  // Per-file percentage while a file transfers, otherwise an indeterminate bar
  // so the user can still see that work is happening.
  const hasFileProgress = running && total > 0 && done > 0;
  const percent = hasFileProgress ? Math.min(100, Math.round((done / total) * 100)) : 0;

  if (!running) {
    jobProgress.hidden = true;
    return;
  }

  jobProgress.hidden = false;
  jobProgressTrack.classList.toggle("indeterminate", !hasFileProgress);
  jobProgressTrack.setAttribute("aria-valuenow", String(hasFileProgress ? percent : 0));
  jobProgressFill.style.width = hasFileProgress ? `${percent}%` : "35%";

  const statusText = paused ? "Paused" : status.status === "canceling" ? "Canceling" : "Downloading";
  jobProgressLabel.textContent = statusText;
  jobProgressCount.textContent = hasFileProgress
    ? `${percent}% — ${formatBytesShort(done)} of ${formatBytesShort(total)}`
    : `${downloadCount} file${downloadCount === 1 ? "" : "s"} handled`;

  if (progress.filename) {
    const name = String(progress.filename).split(/[\\/]/).pop();
    jobProgressFile.textContent = name;
    jobProgressFile.title = progress.filename;
  } else {
    jobProgressFile.textContent = "";
    jobProgressFile.title = "";
  }

  const parts = [];
  if (progress.speed > 0) {
    parts.push(`${formatBytesShort(progress.speed)}/s`);
    if (hasFileProgress && progress.speed > 0) {
      parts.push(`~${formatDuration((total - done) / progress.speed)} left`);
    }
  }
  if (status.started_at) {
    const elapsed = (status.finished_at || Date.now() / 1000) - status.started_at;
    parts.push(`elapsed ${formatDuration(elapsed)}`);
  }
  jobProgressStats.textContent = parts.join(" · ");
}

let notifiedJobEnd = false;

function notifyJobFinished(status) {
  // Browser notifications only fire while this tab is open, which is exactly
  // when the user is likely waiting on a long course download.
  if (!("Notification" in window) || Notification.permission !== "granted") return;
  const state = status.status || "";
  if (status.running || !(state === "completed" || state === "failed")) return;
  if (notifiedJobEnd) return;
  notifiedJobEnd = true;

  const failed = Array.isArray(status.failed_files) ? status.failed_files.length : 0;
  if (state === "completed") {
    const body = failed
      ? `Finished with ${failed} file${failed === 1 ? "" : "s"} that could not be downloaded.`
      : "All files downloaded successfully.";
    new Notification("Coursera download finished", { body, tag: "coursera-download" });
  } else {
    new Notification("Coursera download failed", {
      body: status.error || "See the log for details.",
      tag: "coursera-download",
    });
  }
}

function renderQueue(status) {
  if (!downloadQueue) return;
  const queue = Array.isArray(status.queue) ? status.queue : [];
  const runningCourse = status.current_course || "";
  const running = Boolean(status.running);
  const show = queue.length > 0 || Boolean(runningCourse);
  downloadQueue.hidden = !show;
  if (!show) {
    queueList.innerHTML = "";
    renderedQueueMarkup = null;
    if (startQueueBtn) startQueueBtn.hidden = true;
    return;
  }
  if (queueTitle) {
    queueTitle.textContent = queue.length
      ? `${queue.length} course${queue.length === 1 ? "" : "s"} waiting`
      : "Queue";
  }
  if (queueSummary) {
    queueSummary.textContent = running
      ? "The next course starts automatically when this download finishes."
      : "Start the queue to continue in the order shown.";
  }
  if (startQueueBtn) startQueueBtn.hidden = running || queue.length === 0;
  if (queueCurrent) {
    queueCurrent.hidden = !runningCourse;
    queueCurrent.textContent = runningCourse
      ? `Downloading now: ${queueCourseLabel({ course: runningCourse })}`
      : "";
  }
  const queueMarkup = queue
    .map((entry, index) => {
      const label = escapeHtml(queueCourseLabel(entry));
      const sub = escapeHtml(entry.path || "");
      const mode = entry.resume ? "Resume" : "Download";
      const upDisabled = index === 0 ? " disabled" : "";
      const downDisabled = index === queue.length - 1 ? " disabled" : "";
      return `
        <li class="queue-item" data-entry-id="${entry.id}" aria-label="Position ${index + 1}: ${label}">
          <span class="queue-index" aria-hidden="true">${index + 1}</span>
          <span class="queue-text">
            <span class="queue-name-row">
              <span class="queue-name">${label}</span>
              <span class="queue-mode-tag">${mode}</span>
            </span>
            <span class="queue-path" title="${sub}">${sub || "Default download folder"}</span>
          </span>
          <span class="queue-item-actions">
            <button type="button" class="secondary small queue-up" aria-label="Move ${label} up" title="Move up"${upDisabled}>↑</button>
            <button type="button" class="secondary small queue-down" aria-label="Move ${label} down" title="Move down"${downDisabled}>↓</button>
            <button type="button" class="secondary small queue-remove" aria-label="Remove ${label} from queue" title="Remove from queue">×</button>
          </span>
        </li>`;
    })
    .join("");
  if (queueMarkup !== renderedQueueMarkup) {
    queueList.innerHTML = queueMarkup;
    renderedQueueMarkup = queueMarkup;
  }
  if (clearQueueBtn) clearQueueBtn.hidden = queue.length === 0;
}

function renderStatus(status) {
  // Each queued run restarts the server's log numbering at 1. Without clearing
  // the cursor here the second course's lines would all look "already seen"
  // and the log pane would silently stay empty for the rest of the queue.
  const previousJobSeq = currentStatus ? currentStatus.job_seq : undefined;
  if (typeof status.job_seq === "number" && typeof previousJobSeq === "number" && status.job_seq !== previousJobSeq) {
    logEntries = [];
    logCursor = 0;
    logHiddenBefore = 0;
    notifiedJobEnd = false;
  }
  currentStatus = status;
  const state = status.status || "idle";
  jobState.textContent = state.charAt(0).toUpperCase() + state.slice(1);
  jobState.className = `status-pill ${state}`;
  setRunningState(Boolean(status.running), state);

  // Append only the new log lines the server sent for this poll.
  if (Array.isArray(status.log_entries)) {
    applyLogEntries(status.log_entries, status.resync);
    downloadCount = logEntries.filter((entry) =>
      /^Downloading /.test(String(entry.message || "")) || /^Downloading: /.test(String(entry.message || ""))
    ).length;
  } else if (status.logs && status.logs.length) {
    applyLogEntries(
      status.logs.map((line, index) => ({ seq: logCursor + index + 1, time: "", message: String(line), level: "info" })),
      false
    );
  }

  renderProgress(status);
  renderFailedFiles(status);
  renderQueue(status);
  updateDeleteButton();

  // Reset the latch as soon as a new job starts so each run notifies once.
  if (status.running) {
    notifiedJobEnd = false;
  } else {
    notifyJobFinished(status);
  }

  renderLogStream();
  syncLogPaneVisibility();
  if (!logEntries.length && status.error) {
    activityTree.textContent = "Error";
  }

  if (status.running && treeNeedsStateRender()) {
    void updateDownloadState({ force: true, render: true });
  }

  if (status.error) {
    showMessage(status.error);
  }
}

function slugId(value) {
  return String(value || "item").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#039;",
  }[char]));
}

function stripLogPrefix(line) {
  return line.replace(/^\[[^\]]+\]\s*/, "").replace(/^INFO:\s*/, "");
}

function createGroup(title, slug = "") {
  return { title, slug, modules: [], loose: [], logs: [], index: 0, total: 0, status: "running" };
}

function createModule(title, slug = "") {
  return { title, slug, sections: [], loose: [], logs: [] };
}

function createSection(title, slug = "") {
  return { title, slug, items: [], logs: [] };
}

function normalizeName(value) {
  return value.replace(/_/g, " ").replace(/-/g, " ").replace(/\s+/g, " ").trim();
}

function parsePathActivity(message) {
  const match =
    message.match(/Downloading:\s+(.*)$/) ||
    message.match(/Saving page contents to:\s+(.*)$/) ||
    message.match(/^(.*)\s+already downloaded$/);
  if (!match) return null;
  const path = match[1].trim().replace(/^\\\\\?\\/, "");
  const parts = path.split(/[\\/]+/).filter(Boolean);
  return {
    text: parts.slice(-4).join(" / "),
    path,
    parts,
  };
}

function titleForCourseSlug(slug) {
  const downloaded = downloadedActivityGroups.find((group) => group.slug === slug);
  return downloaded?.title || normalizeName(slug);
}

function inferCourseSlug(parts) {
  const slugs = downloadedActivityGroups.map((group) => group.slug).filter(Boolean);
  return slugs.find((slug) => parts.includes(slug)) || "";
}

function findOrCreateModule(course, title, slug) {
  let found = course.modules.find((item) => item.slug === slug || item.title === title);
  if (!found) {
    found = createModule(title, slug);
    course.modules.push(found);
  }
  return found;
}

function findOrCreateSection(module, title, slug) {
  let found = module.sections.find((item) => item.slug === slug || item.title === title);
  if (!found) {
    found = createSection(title, slug);
    module.sections.push(found);
  }
  return found;
}

function buildActivityGroups(lines) {
  const groups = [];
  let course = createGroup("Session");
  let module = createModule("General");
  let section = createSection("General");
  course.modules.push(module);
  module.sections.push(section);
  groups.push(course);

  for (const raw of lines) {
    const message = stripLogPrefix(raw);
    if (!message || message.includes('127.0.0.1 - "')) continue;

    let match = message.match(/Downloading class:\s+(.+?)\s+\((\d+)\s+\/\s+(\d+)\)/);
    if (match) {
      if (course.title !== "Session") {
        course.status = "completed";
      }
      course = createGroup(`${normalizeName(match[1])} (${match[2]}/${match[3]})`, match[1]);
      course.index = Number(match[2]);
      course.total = Number(match[3]);
      course.is_active = true;
      course.logs.push(message);
      module = createModule("General");
      section = createSection("General");
      course.modules.push(module);
      module.sections.push(section);
      groups.push(course);
      continue;
    }

    match = message.match(/Processing module\s+(.+)$/);
    if (match) {
      module = createModule(normalizeName(match[1]), match[1]);
      course.is_active = true;
      module.is_active = true;
      course.logs.push(message);
      module.logs.push(message);
      section = createSection("General");
      module.sections.push(section);
      course.modules.push(module);
      continue;
    }

    match = message.match(/Processing section\s+(.+)$/);
    if (match) {
      section = createSection(normalizeName(match[1]), match[1]);
      course.is_active = true;
      module.is_active = true;
      section.is_active = true;
      course.logs.push(message);
      module.logs.push(message);
      section.logs.push(message);
      module.sections.push(section);
      continue;
    }

    match = message.match(/Processing lecture\s+(.+)$/);
    if (match) {
      section.items.push({ kind: "lecture", text: normalizeName(match[1]), slug: match[1] });
      course.is_active = true;
      module.is_active = true;
      section.is_active = true;
      course.logs.push(message);
      module.logs.push(message);
      section.logs.push(message);
      continue;
    }

    const pathDownload = parsePathActivity(message);
    if (pathDownload) {
      const inferredSlug = inferCourseSlug(pathDownload.parts);
      if (inferredSlug && course.slug !== inferredSlug) {
        if (course.title !== "Session") {
          course.status = "completed";
        }
        course = createGroup(titleForCourseSlug(inferredSlug), inferredSlug);
        groups.push(course);
      }
      const courseIndex = inferredSlug ? pathDownload.parts.indexOf(inferredSlug) : -1;
      const moduleSlug = courseIndex >= 0 ? pathDownload.parts[courseIndex + 1] : "";
      const sectionSlug = courseIndex >= 0 ? pathDownload.parts[courseIndex + 2] : "";
      if (moduleSlug) {
        module = findOrCreateModule(course, normalizeName(moduleSlug), moduleSlug);
      }
      if (sectionSlug) {
        section = findOrCreateSection(module, normalizeName(sectionSlug), sectionSlug);
      }
      course.status = "running";
      course.is_active = true;
      course.logs.push(message);
      module.is_active = true;
      module.logs.push(message);
      section.is_active = true;
      section.items.push({ kind: "file", text: pathDownload.text, path: pathDownload.path, parts: pathDownload.parts, log: message, active: true });
      section.logs.push(message);
      continue;
    }

    if (
      message.includes("Download started") ||
      message.includes("Resume started") ||
      message.includes("Download completed") ||
      message.includes("Expanded specialization") ||
      message.includes("Logged in")
    ) {
      course.loose.push(message);
      course.logs.push(message);
      continue;
    }

    if (message.includes("Unsupported typename") || message.includes("skipped")) {
      section.items.push({ kind: "note", text: message });
      section.logs.push(message);
      continue;
    }
  }

  if (lines.some((line) => stripLogPrefix(line).includes("Download completed"))) {
    course.status = "completed";
  }

  return groups.filter((group) =>
    group.loose.length || group.modules.some((item) =>
      item.loose.length || item.sections.some((sectionItem) => sectionItem.items.length)
    )
  );
}

function renderGroupedLogs(lines) {
  const groups = buildActivityGroups(lines);
  const hasRealCourseLogs = groups.some((group) => group.slug || group.title !== "Session");
  if (!downloadedActivityGroups.length) {
    lastSessionLogGroups = groups;
    currentTreeNodes = [];
    currentSidebarNodes = [];
    activityTree.textContent = "Waiting for site tree manifest.";
    logs.innerHTML = statusMessagesHtml() + renderSessionLogGroups(groups);
    return;
  }
  if (!hasRealCourseLogs) {
    lastSessionLogGroups = groups;
    renderActivityGroups(downloadedActivityGroups);
    return;
  }
  renderActivityGroups(hasRealCourseLogs ? mergeDownloadedActivityGroups(groups) : groups, { preferActive: currentStatus.running });
}

function renderSessionLogGroups(groups) {
  const sessionNode = buildFolderTree(groups)[0];
  if (!sessionNode) return "";
  return `
    <section class="folder-detail">
      <div class="folder-detail-head">
        <div>
          <h3>Session</h3>
          <p>Download logs</p>
        </div>
      </div>
      ${renderNodeLogs(sessionNode)}
    </section>
  `;
}

function mergeDownloadedActivityGroups(groups) {
  if (!downloadedActivityGroups.length) return groups;
  const merged = downloadedActivityGroups.map((group) => ({ ...group }));
  groups.forEach((group) => {
    const existingIndex = group.slug ? merged.findIndex((item) => item.slug === group.slug) : -1;
    if (existingIndex >= 0) {
      const existing = merged[existingIndex];
      merged[existingIndex] = {
        ...existing,
        status: group.status || existing.status,
        logs: mergeUnique(existing.logs || [], group.logs || []),
        loose: mergeUnique(existing.loose || [], group.loose || []),
        is_active: Boolean(group.is_active) || Boolean(existing.is_active),
        index: group.index || existing.index,
        total: group.total || existing.total,
      };
    } else if (!group.slug || !merged.some((item) => item.slug === group.slug)) {
      merged.push(group);
    }
  });
  return merged;
}

function mergeUnique(first, second) {
  return [...first, ...second].filter((item, index, items) => items.indexOf(item) === index);
}

function summarizeActivityGroups(groups) {
  return (groups || []).map((group) => ({
    slug: group.slug || "",
    title: group.title || "",
    modules: (group.modules || []).length,
    sections: (group.modules || []).reduce((total, module) => total + (module.sections || []).length, 0),
    fileCount: group.file_count,
    downloadableCount: group.downloadable_count,
    expectedCount: group.expected_count,
    status: group.status || "",
    active: Boolean(group.is_active),
  }));
}

function renderActivityGroups(groups, options = {}) {
  if (!groups.length) {
    logs.innerHTML = statusMessagesHtml() || "";
    activityTree.textContent = "";
    currentTreeNodes = [];
    currentSidebarNodes = [];
    return;
  }
  hideRecentCoursesLanding({ auto: true });

  currentTreeNodes = buildFolderTree(groups);
  currentSidebarNodes = currentTreeNodes.filter((node) => !isSessionNode(node));
  if (!userChangedExpansion && !autoExpandedInitialTree && currentSidebarNodes.length) {
    expandAllTreeNodes(currentSidebarNodes);
    autoExpandedInitialTree = true;
  }
  activeTreeId = options.preferActive ? findActiveTreeNode(currentSidebarNodes)?.id || "" : "";
  const existingSelection = findTreeNode(currentSidebarNodes, selectedTreeId)?.id;
  selectedTreeId =
    existingSelection ||
    activeTreeId ||
    deepestActiveNode(currentSidebarNodes)?.id ||
    findTreeNode(currentTreeNodes, selectedTreeId)?.id ||
    deepestActiveNode(currentTreeNodes)?.id ||
    currentTreeNodes[0].id;
  ensureSelectedTreeExpanded();
  activityTree.innerHTML = currentSidebarNodes.length
    ? renderTreeNodes(currentSidebarNodes)
    : "";
  renderSelectedTreeNode();
}

function summarizeTreeNodes(nodes) {
  return (nodes || []).map(summarizeTreeNode);
}

function summarizeTreeNode(node) {
  if (!node) return null;
  return {
    id: node.id,
    title: node.title,
    type: node.type,
    children: node.children.length,
    files: nodeFileCount(node),
    expected: node.expectedCount,
    expanded: expandedTreeIds.has(node.id),
    active: node.active,
  };
}

function buildFolderTree(groups) {
  return groups.map((group, groupIndex) => {
    const node = makeTreeNode(`course-${groupIndex}-${slugId(group.slug || group.title)}`, group.title, "course", {
      status: group.status,
      slug: group.slug,
      logs: [...(group.logs || []), ...(group.loose || [])],
      fileCount: group.file_count,
      downloadableCount: group.downloadable_count,
      expectedCount: group.expected_count,
      index: group.index,
      total: group.total,
      orderIndex: group.order_index,
      orderTotal: group.order_total,
      active: group.is_active,
      treeSource: group.tree_source,
    });

    (group.modules || []).forEach((module, moduleIndex) => {
      const moduleNode = makeTreeNode(`${node.id}-folder-${moduleIndex}-${slugId(module.slug || module.title)}`, module.title, "folder", {
        slug: module.slug,
        logs: module.logs || module.loose || [],
        fileCount: module.file_count,
        downloadableCount: module.downloadable_count,
        expectedCount: module.expected_count,
        active: module.is_active,
        treeSource: module.tree_source || group.tree_source,
      });
      node.children.push(moduleNode);

      (module.sections || []).forEach((section, sectionIndex) => {
        const sectionNode = makeTreeNode(`${moduleNode.id}-folder-${sectionIndex}-${slugId(section.slug || section.title)}`, section.title, "folder", {
          slug: section.slug,
          logs: section.logs || [],
          fileCount: section.file_count,
          downloadableCount: section.downloadable_count,
          expectedCount: section.expected_count,
          active: section.is_active,
          treeSource: section.tree_source || module.tree_source || group.tree_source,
          actions: group.slug && section.slug && section.title !== "General"
            ? { course: group.slug, section: section.slug }
            : null,
        });
        moduleNode.children.push(sectionNode);
        (section.items || []).forEach((item, itemIndex) => addItemToTree(sectionNode, item, itemIndex));
      });
    });

    return node;
  });
}

function makeTreeNode(id, title, type, options = {}) {
  return {
    id,
    title,
    type,
    status: options.status || "",
    slug: options.slug || "",
    logs: options.logs || [],
    children: [],
    files: [],
    fileCount: options.fileCount,
    downloadableCount: options.downloadableCount,
    expectedCount: options.expectedCount,
    index: options.index || 0,
    total: options.total || 0,
    orderIndex: options.orderIndex || 0,
    orderTotal: options.orderTotal || 0,
    active: Boolean(options.active),
    treeSource: options.treeSource || "",
    actions: options.actions || null,
  };
}

function addItemToTree(parent, item, itemIndex) {
  if (item.kind === "file" || item.kind === "video" || item.kind === "text" || item.kind === "resource") {
    const parts = item.parts || String(item.path || item.text || "").split(/[\\/]+/).filter(Boolean);
    const usefulParts = trimFileParts(parts, item.text);
    let node = parent;
    usefulParts.slice(0, -1).forEach((part, depth) => {
      const childId = `${node.id}-path-${depth}-${slugId(part)}`;
      let child = node.children.find((candidate) => candidate.id === childId);
      if (!child) {
        child = makeTreeNode(childId, normalizeName(part), "folder");
        node.children.push(child);
      }
      if (item.log && !child.logs.includes(item.log)) child.logs.push(item.log);
      if (item.active) child.active = true;
      node = child;
    });
    if (item.log && !node.logs.includes(item.log)) node.logs.push(item.log);
    if (item.active) node.active = true;
    node.files.push({ ...item, text: usefulParts[usefulParts.length - 1] || item.text || "File" });
    return;
  }
  parent.files.push({ ...item, text: item.text || `Item ${itemIndex + 1}` });
}

function trimFileParts(parts, fallbackText) {
  const fallbackParts = String(fallbackText || "").split(/\s+\/\s+|[\\/]+/).filter(Boolean);
  if (fallbackParts.length > 1) return fallbackParts;
  const fileIndex = parts.findLastIndex((part) => /\.[a-z0-9]{1,8}$/i.test(part));
  const useful = fileIndex >= 0 ? parts.slice(Math.max(0, fileIndex - 5), fileIndex + 1) : parts.slice(-1);
  return useful.length ? useful : fallbackParts;
}

function renderTreeNodes(nodes, depth = 0) {
  return nodes.map((node) => {
    const isOpen = expandedTreeIds.has(node.id);
    const hasChildren = node.children.length > 0;
    const badge = node.type === "course" && node.status
      ? `<span class="tree-status-badge ${escapeHtml(node.status)}">${escapeHtml(statusText(node.status))}</span>`
      : "";
    return `
      <button type="button" class="tree-node ${node.type} ${node.id === selectedTreeId ? "active" : ""}" style="--depth:${depth}" data-node-id="${escapeHtml(node.id)}">
        <span class="tree-toggle" data-toggle-node="${escapeHtml(node.id)}">${hasChildren ? (isOpen ? "▾" : "▸") : ""}</span>
        <span class="tree-label">${escapeHtml(node.title)}</span>
        ${badge}
        <span class="tree-meta">${escapeHtml(nodeProgressText(node))}</span>
      </button>
      ${hasChildren && isOpen ? renderTreeNodes(node.children, depth + 1) : ""}
    `;
  }).join("");
}

function renderSelectedTreeNode() {
  const node = findTreeNode(currentTreeNodes, selectedTreeId) || currentTreeNodes[0];
  if (!node) {
    if (lastSessionLogGroups.length) {
      const sessionNode = buildFolderTree(lastSessionLogGroups)[0];
      logs.innerHTML = statusMessagesHtml() + `
        <section class="folder-detail">
          <div class="folder-detail-head">
            <div>
              <h3>Session</h3>
              <p>Startup logs</p>
            </div>
          </div>
          ${renderNodeLogs(sessionNode)}
        </section>
      `;
      return;
    }
    logs.innerHTML = statusMessagesHtml() || "No download has started.";
    return;
  }

  ensureSelectedTreeExpanded();
  activityTree.innerHTML = currentSidebarNodes.length
    ? renderTreeNodes(currentSidebarNodes)
    : "";
  const percent = node.total ? Math.round((Math.max(node.index - 1, 0) / node.total) * 100) : 0;
  const showLogs = selectedTreeView === "logs" || node.id === activeTreeId || (!node.files.length && !node.children.length && node.logs.length);
  logs.innerHTML = statusMessagesHtml() + `
    <section class="folder-detail">
      <div class="folder-detail-head">
        <div>
          <h3>${escapeHtml(node.title)}</h3>
          <p>${escapeHtml(detailSummary(node))}</p>
        </div>
        <div class="activity-actions">
          ${node.slug && node.type === "course" ? `
            <button type="button" data-action="resume" data-type="course" data-course="${escapeHtml(node.slug)}">Resume</button>
            <button type="button" data-action="retry" data-type="course" data-course="${escapeHtml(node.slug)}">Retry</button>
          ` : ""}
          ${node.actions ? `
            <button type="button" data-action="resume" data-type="section" data-course="${escapeHtml(node.actions.course)}" data-section="${escapeHtml(node.actions.section)}">Resume</button>
            <button type="button" data-action="retry" data-type="section" data-course="${escapeHtml(node.actions.course)}" data-section="${escapeHtml(node.actions.section)}">Retry</button>
          ` : ""}
          <button type="button" class="secondary small" data-view="${showLogs ? "content" : "logs"}">${showLogs ? "Show content" : "Show logs"}</button>
        </div>
      </div>
      ${node.total ? `<div class="progress"><i style="width:${percent}%"></i></div>` : ""}
      ${showLogs ? renderNodeLogs(node) : renderNodeContent(node)}
    </section>
  `;
}

function renderNodeContent(node) {
  const children = node.children.map((child) => `
    <button type="button" class="folder-row" data-open-node="${escapeHtml(child.id)}">
      <span>folder</span>
      <p>${escapeHtml(child.title)}</p>
      <em>${escapeHtml(nodeProgressText(child))}</em>
    </button>
  `).join("");
  const files = node.files.map((item) => `
    <div class="activity-item ${escapeHtml(item.kind || "file")}${item.downloadable === false ? " non-downloadable" : ""}">
      <span>${escapeHtml(itemKindLabel(item.kind || "file"))}</span>
      <p>${renderItemSourceLink(item)}</p>
      <em class="item-status ${escapeHtml(item.status || "")}" title="${escapeHtml(item.reason || "")}">${escapeHtml(itemStatusText(item))}</em>
    </div>
  `).join("");
  return children || files ? children + files : renderNodeLogs(node);
}

function renderItemSourceLink(item) {
  const source = preferredItemSource(item);
  if (!source || !source.path) return escapeHtml(item.text);
  const extra = item.sources && item.sources.length > 1 ? ` (${item.sources.length} files)` : "";
  return `
    <button type="button" class="source-link" data-open-path="${escapeHtml(source.path)}" title="${escapeHtml(source.path)}">
      ${escapeHtml(item.text)}${escapeHtml(extra)}
    </button>
  `;
}

function preferredItemSource(item) {
  const sources = Array.isArray(item.sources) ? item.sources : [];
  return sources.find((source) => source.path) || null;
}

function itemKindLabel(kind) {
  const labels = {
    lecture: "video",
    supplement: "reading",
    quiz: "assignment",
    exam: "assignment",
    phasedPeer: "assignment",
    staffGraded: "assignment",
    ungradedAssignment: "assignment",
    discussionPrompt: "discussion",
    ungradedWidget: "plugin",
    coach: "plugin",
  };
  return labels[kind] || kind || "file";
}

function itemStatusText(item) {
  if (!item.status) return "";
  if (item.status === "downloaded") return "Downloaded";
  if (item.status === "partial") return `Partial ${item.downloaded_count || 0}/${item.expected_count || "?"}`;
  if (item.status === "missing") return "Missing";
  if (item.status === "not-downloadable") return item.reason ? "Not downloadable" : "Info only";
  if (item.status === "pending") return "Checking…";
  return item.status;
}

function renderNodeLogs(node) {
  const logLines = node.logs.length ? node.logs : ["No files yet. New download logs for this folder will appear here."];
  return logLines.map((item) => `<div class="activity-note">${escapeHtml(item)}</div>`).join("");
}

function detailSummary(node) {
  const files = nodeFileCount(node);
  const folders = node.children.length;
  const status = node.status ? statusText(node.status, node.fileCount) : "";
  const source = node.treeSource === "site"
    ? "Site tree"
    : node.treeSource === "folder"
      ? "Folder scan"
      : node.treeSource === "missing"
        ? "Manifest missing"
        : "";
  const unit = node.treeSource === "site" ? "item" : "file";
  return [source, status, folders ? `${folders} folder${folders === 1 ? "" : "s"}` : "", nodeProgressText(node), `${files} ${unit}${files === 1 ? "" : "s"}`]
    .filter(Boolean)
    .join(" · ");
}

function nodeProgressText(node) {
  if (node.type === "course" && (typeof node.expectedCount === "number" || typeof node.fileCount === "number")) {
    const label = itemProgressText(node);
    if (label) return label;
  }
  if (node.total) {
    return `${Math.max(node.index - 1, 0)} done from ${node.total}`;
  }
  const label = itemProgressText(node);
  if (label) return label;
  if (node.status) return statusText(node.status, node.fileCount);
  return "0 done from 0";
}

function itemProgressText(node) {
  const done = nodeFileCount(node);
  const downloadable = typeof node.downloadableCount === "number" && node.downloadableCount > 0
    ? node.downloadableCount
    : 0;
  const expected = typeof node.expectedCount === "number" && node.expectedCount > 0
    ? node.expectedCount
    : 0;
  const total = downloadable || expected || (typeof node.fileCount === "number" ? node.fileCount : done);
  if (!total && !done) return "";
  if (downloadable && expected && downloadable !== expected) {
    return `${done} done from ${downloadable} (${expected})`;
  }
  return `${done} done from ${total}`;
}

function nodeFileCount(node) {
  if (typeof node.fileCount === "number") return node.fileCount;
  return node.files.length + node.children.reduce((total, child) => total + nodeFileCount(child), 0);
}

function findTreeNode(nodes, id) {
  for (const node of nodes) {
    if (node.id === id) return node;
    const child = findTreeNode(node.children, id);
    if (child) return child;
  }
  return null;
}

function deepestActiveNode(nodes) {
  const flat = [];
  const visit = (node) => {
    flat.push(node);
    node.children.forEach(visit);
  };
  nodes.forEach(visit);
  return [...flat].reverse().find((node) => node.logs.length || node.files.length) || flat[flat.length - 1];
}

function findActiveTreeNode(nodes) {
  for (const node of nodes) {
    if (node.active) {
      const child = findActiveTreeNode(node.children);
      return child || node;
    }
    const child = findActiveTreeNode(node.children);
    if (child) return child;
  }
  return null;
}

function isSessionNode(node) {
  return node.title === "Session" && !node.slug;
}

function ensureSelectedTreeExpanded() {
  const path = findTreePath(currentSidebarNodes, selectedTreeId);
  if (!path.length) return;
  path.slice(0, -1).forEach((node) => expandedTreeIds.add(node.id));
}

function expandAllTreeNodes(nodes = currentSidebarNodes) {
  const visit = (node) => {
    if (node.children.length) {
      expandedTreeIds.add(node.id);
      node.children.forEach(visit);
    }
  };
  nodes.forEach(visit);
}

function collapseAllTreeNodes() {
  expandedTreeIds.clear();
}

function findTreePath(nodes, id, path = []) {
  for (const node of nodes) {
    const nextPath = [...path, node];
    if (node.id === id) return nextPath;
    const childPath = findTreePath(node.children, id, nextPath);
    if (childPath.length) return childPath;
  }
  return [];
}

function statusText(status, fileCount = null) {
  if (status === "completed") return "Completed";
  if (status === "downloaded") return "Completed";
  if (status === "partial") return fileCount ? `Partial · ${fileCount}` : "Partial";
  if (status === "missing") return "Not started";
  if (status === "paused") return "Paused";
  if (status === "canceling") return "Canceling";
  if (status === "canceled") return "Canceled";
  if (status === "failed") return "Failed";
  // "manifest-missing" is only kept for older servers: a downloaded course
  // reports "downloaded" from the folder scan, so this label should never
  // appear for a course that is actually on disk.
  if (status === "manifest-missing") return "Downloaded (no manifest)";
  if (status === "manifest") return "Loading…";
  if (status === "pending") return "Loading…";
  if (status === "running") return "Running";
  return "Running";
}

const STATUS_POLL_ACTIVE_MS = 700;
const STATUS_POLL_IDLE_MS = 2500;

function startStatusPolling() {
  // Poll quickly while work is happening so progress looks live, and back off
  // when idle instead of hammering the server forever.
  if (statusTimer) {
    clearInterval(statusTimer);
  }
  const delay = currentStatus && currentStatus.running ? STATUS_POLL_ACTIVE_MS : STATUS_POLL_IDLE_MS;
  statusTimer = setInterval(refreshStatus, delay);
}

async function refreshStatus() {
  // Ask only for entries after our cursor: keeps each poll small during a
  // multi-hour download instead of resending thousands of lines every time.
  const status = await requestJson(`/api/status?since=${logCursor}`);
  renderStatus(status);
  if (status.running) {
    await updateDownloadState({ force: true, render: treeNeedsStateRender() });
  }
  if (!status.running && statusTimer) {
    // Keep polling slowly so the last lines and the final status still land,
    // but stop the moment the job is over and nothing is left to stream.
    clearInterval(statusTimer);
    statusTimer = setInterval(refreshStatus, STATUS_POLL_IDLE_MS);
    await updateDownloadState({ render: !(status.logs && status.logs.length) });
  }
}

function requestNotificationPermission() {
  try {
    if ("Notification" in window && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  } catch {
    /* not supported in this browser */
  }
}

function queueCourseLabel(entry) {
  if (entry.class_name) return entry.class_name;
  const course = String(entry.course || "");
  return courseTitleFromUrl(course) || course || "Course";
}

function parseBulkCourseLinks() {
  if (!bulkLinksInput) return [];
  return bulkLinksInput.value
    .split(/[\r\n,]+/)
    .map((line) => line.trim().replace(/^(?:[-*•]\s+|\d+[.)]\s+)/, ""))
    .map((line) => line.replace(/^<(.+)>$/, "$1").replace(/^(["'])(.*)\1$/, "$2").trim())
    .filter(Boolean);
}

function updateBulkLinkCount() {
  if (!bulkLinksInput || !bulkLinksCount || !bulkQueueBtn) return;
  const count = parseBulkCourseLinks().length;
  const tooMany = count > 50;
  bulkLinksCount.textContent = tooMany
    ? `${count} links — maximum 50 per batch`
    : `${count} link${count === 1 ? "" : "s"} detected · maximum 50`;
  bulkQueueBtn.disabled = count === 0 || tooMany;
  bulkQueueBtn.textContent = count
    ? `${currentStatus?.running ? "Queue" : "Add"} ${count} link${count === 1 ? "" : "s"}`
    : "Add links";
}

async function queueBulkLinks() {
  const courses = parseBulkCourseLinks();
  if (!courses.length || courses.length > 50 || !bulkQueueBtn) return;
  bulkQueueBtn.disabled = true;
  bulkQueueBtn.textContent = "Adding…";
  try {
    const result = await requestJson("/api/queue-batch", {
      method: "POST",
      body: JSON.stringify({ ...authPayload(payloadFromForm()), courses }),
    });
    renderStatus(result.status);
    bulkLinksInput.value = "";
    updateBulkLinkCount();
    if (result.started) {
      courseInput.value = result.started.course || "";
      if (result.started.path) pathInput.value = result.started.path;
      rememberCourseInput();
    }
    hideRecentCoursesLanding();
    requestNotificationPermission();
    startStatusPolling();
    if (result.started) await updateDownloadState({ force: true });
    const waiting = Number(result.queued) || 0;
    showMessage(
      `${result.added} link${result.added === 1 ? "" : "s"} added. ` +
        (result.started
          ? `${queueCourseLabel(result.started)} started${waiting ? `; ${waiting} more queued` : ""}.`
          : `${waiting} course${waiting === 1 ? "" : "s"} queued behind the current download.`),
      true
    );
  } catch (error) {
    showMessage(error.message);
  } finally {
    updateBulkLinkCount();
  }
}

async function enqueueCurrentCourse() {
  const payload = authPayload(payloadFromForm());
  if (!String(payload.course || "").trim()) {
    showMessage("Paste a course URL first.");
    return;
  }
  const endpoint = canResumeCurrentCourse ? "/api/queue-resume" : "/api/queue";
  const result = await requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(payload),
  });
  renderStatus(result.status);
  showMessage(
    result.queued
      ? "Added to the queue. It starts automatically when the current download finishes."
      : "The queue was idle, so the download started now.",
    true
  );
  hideRecentCoursesLanding();
  // Only the input is cleared. The tree and log still belong to the course that
  // is downloading right now, so they must not be reset here.
  courseInput.value = "";
  localStorage.removeItem(COURSE_INPUT_STORAGE_KEY);
  updateClearButtonVisibility();
  hideCourseHistory();
  if (!result.queued) {
    requestNotificationPermission();
    startStatusPolling();
    await updateDownloadState({ force: true });
  }
}

async function removeQueueEntry(entryId) {
  const result = await requestJson("/api/queue-remove", {
    method: "POST",
    body: JSON.stringify({ entry_id: entryId }),
  });
  renderStatus(result.status);
  showMessage("Removed from the queue.", true);
}

async function moveQueueEntry(entryId, offset) {
  const result = await requestJson("/api/queue-move", {
    method: "POST",
    body: JSON.stringify({ entry_id: entryId, offset }),
  });
  renderStatus(result.status);
}

async function clearQueue() {
  const count = Array.isArray(currentStatus?.queue) ? currentStatus.queue.length : 0;
  if (count && !window.confirm(`Remove all ${count} waiting course${count === 1 ? "" : "s"}?`)) return;
  const result = await requestJson("/api/queue-clear", { method: "POST", body: "{}" });
  renderStatus(result.status);
  showMessage(`Removed ${result.removed || 0} course${result.removed === 1 ? "" : "s"} from the queue.`, true);
}

async function startQueuedCourses() {
  if (!startQueueBtn) return;
  startQueueBtn.disabled = true;
  try {
    const result = await requestJson("/api/queue-start", {
      method: "POST",
      body: "{}",
    });
    renderStatus(result.status);
    showMessage("Queue resumed. The remaining courses will run in order.", true);
    requestNotificationPermission();
    startStatusPolling();
  } catch (error) {
    showMessage(error.message);
  } finally {
    startQueueBtn.disabled = false;
  }
}

async function startDownload(endpoint) {
  clearMessage();
  userChangedExpansion = false;
  autoExpandedInitialTree = false;
  expandedTreeIds.clear();
  const result = await requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(authPayload(payloadFromForm())),
  });
  rememberCourseInput();
  renderStatus(result.status);
  showMessage(
    result.queued
      ? "Added to the queue. It will run in order after the current course."
      : `${endpoint === "/api/resume" ? "Resume" : "Download"} started. Keep this server window open until it finishes.`,
    true
  );
  // An explicit download is a hard exit from the list view; the auto-guard the
  // poll uses must not keep the user on it.
  hideRecentCoursesLanding();
  requestNotificationPermission();
  startStatusPolling();
  if (!result.queued) await updateDownloadState({ force: true });
}

async function updateDownloadState(options = {}) {
  if (downloadStatePromise) {
    return downloadStatePromise;
  }
  downloadStatePromise = performDownloadStateUpdate(options)
    .finally(() => {
      downloadStatePromise = null;
    });
  return downloadStatePromise;
}

async function performDownloadStateUpdate(options = {}) {
  const shouldRender = options.render !== false;
  if (currentStatus.running && !options.force) return;
  const now = Date.now();
  if (
    currentStatus.running &&
    downloadedActivityGroups.length &&
    now - lastDownloadStateAt < 10000
  ) {
    if (treeNeedsStateRender()) {
      renderActivityGroups(downloadedActivityGroups);
    }
    return;
  }
  try {
    lastDownloadStateAt = now;
    if (!downloadedActivityGroups.length) {
      try {
        const quickState = await requestJson("/api/download-state", {
          method: "POST",
          body: JSON.stringify({ ...payloadFromForm(), quick: true }),
        });
        if (Array.isArray(quickState.activity_groups) && quickState.activity_groups.length) {
          downloadedActivityGroups = quickState.activity_groups;
          if ((!currentStatus.running && shouldRender) || treeNeedsStateRender()) {
            renderActivityGroups(quickState.activity_groups);
          }
        }
      } catch (quickError) {
      }
    }
    const state = await requestJson("/api/download-state", {
      method: "POST",
      body: JSON.stringify(payloadFromForm()),
    });
    canResumeCurrentCourse = Boolean(state.can_resume);
    currentCourseFolder = state.course_folder || "";
    currentCourseName = state.class_name || "";
    updateDeleteButton();
    if (state.resume_path && pathInput.value !== state.resume_path) {
      pathInput.value = state.resume_path;
    }
    if (Array.isArray(state.activity_groups) && state.activity_groups.length) {
      downloadedActivityGroups = state.activity_groups;
      const treeIsPlaceholder = treeNeedsStateRender();
      if ((!currentStatus.running && shouldRender) || treeIsPlaceholder) {
        renderActivityGroups(state.activity_groups);
      }
    }
  } catch (error) {
    canResumeCurrentCourse = false;
  }
  refreshDownloadButton();
}

async function startItemDownload(action, item) {
  clearMessage();
  const endpoint = action === "resume" ? "/api/resume-item" : "/api/download-item";
  const result = await requestJson(endpoint, {
    method: "POST",
    body: JSON.stringify(authPayload({ ...payloadFromForm(), item })),
  });
  renderStatus(result.status);
  showMessage(`${action === "resume" ? "Resume" : "Retry"} started for ${item.type}.`, true);
  startStatusPolling();
}

async function controlDownload(endpoint, message) {
  clearMessage();
  const result = await requestJson(endpoint, { method: "POST", body: "{}" });
  renderStatus(result.status);
  showMessage(message, true);
  if (!statusTimer && result.status.running) {
    startStatusPolling();
  }
}

function restoreAuthBrowser(config) {
  const stored = localStorage.getItem(AUTH_BROWSER_STORAGE_KEY) || "";
  if (authBrowserSelect && stored && [...authBrowserSelect.options].some((option) => option.value === stored)) {
    authBrowserSelect.value = stored;
  }
  if (authHint && config && config.auth && config.auth.has_saved_cauth) {
    authHint.textContent = "A CAUTH cookie is already saved. Paste a new one below only if the login expires.";
  }
}

async function applyAuthChoice() {
  const payload = authPayload();
  authApplyBtn.disabled = true;
  loginCheckBtn.disabled = true;
  clearMessage();
  try {
    const result = await requestJson("/api/save-cauth", { method: "POST", body: JSON.stringify(payload) });
    setAuthMessage(result.message, result.authenticated, result.user_name);
    if (result.authenticated) {
      rememberAuth(result);
      if (payload.profile) {
        localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, payload.profile);
      } else if (payload.browser && payload.browser !== "manual") {
        localStorage.setItem(AUTH_BROWSER_STORAGE_KEY, payload.browser);
      }
      if (payload.cauth && authCauthInput) {
        authCauthInput.value = "";
      }
      showMessage(result.message, true);
      setAuthHint(result.profile_label
        ? `Signed in via ${result.browser} profile "${result.profile_label}".`
        : `Signed in via ${result.browser || "auto-detect"}.`);
    } else {
      // The attempt failed, so any earlier "Signed in via ..." line is stale and
      // contradicts the error above it. Replace it with the real reason.
      const failure = result.message || AUTH_HINT_MESSAGE;
      showMessage(failure);
      setAuthHint(failure);
    }
  } catch (error) {
    showMessage(error.message);
  } finally {
    authApplyBtn.disabled = false;
    loginCheckBtn.disabled = false;
  }
}

async function init() {
  const config = await requestJson("/api/config");
  versionLabel.textContent = `Version ${config.version}`;
  if (!restoreAuth()) {
    setAuthMessage("Login");
  }
  fillSelect(languageSelect, config.languages, config.defaults.subtitle_language);
  const lastInput = localStorage.getItem(COURSE_INPUT_STORAGE_KEY) || config.defaults.course || "";
  if (lastInput) {
    addToCourseHistory(lastInput);
  }
  courseInput.value = "";
  updateClearButtonVisibility();
  showRecentCoursesLanding();
  pathInput.value = config.defaults.path || "";
  if (!restoreSettingsVisible()) {
    setSettingsVisible(false, true);
  }

  const resolution = config.defaults.video_resolution || "720p";
  const resolutionInput = document.querySelector(`input[name="video_resolution"][value="${resolution}"]`);
  if (resolutionInput) {
    resolutionInput.checked = true;
  }

  restoreAuthBrowser(config);
  await loadBrowserProfiles(config);
  const initialDownloadState = updateDownloadState({ force: true, render: true });
  await refreshStatus();
  await initialDownloadState;
  // Startup shows the hint in the log so it is obvious why downloads may fail;
  // polling later stays quiet.
  await checkAuthOnce(true);
}

async function checkAuthOnce(showResult = true) {
  if (!authCheckPromise) {
    authCheckPromise = requestJson("/api/check-auth", {
      method: "POST",
      body: JSON.stringify(authPayload()),
    })
      .finally(() => {
        authCheckPromise = null;
      });
  }
  const result = await authCheckPromise;
  if (!result.authenticated) {
    // "Login not detected" is an informative state, not an error: it is the
    // normal outcome before the user signs in. Drop any stale success hint so
    // it cannot contradict the banner.
    setAuthMessage(result.message, null, "");
    setAuthHint(result.message);
  } else {
    setAuthMessage(result.message, true, result.user_name);
    rememberAuth(result);
    const sourceLabel = result.browser === "manual"
      ? "the saved CAUTH cookie"
      : result.profile_label
        ? `${result.browser} profile "${result.profile_label}"`
        : result.browser || "auto-detect";
    setAuthHint(`Signed in via ${sourceLabel}.`);
  }
  if (showResult && !result.authenticated) {
    if (isAuthDetectionFailure(result.message)) {
      showMessage(authFailureMessage(result));
    } else {
      showMessage(result.message, result.authenticated);
    }
  }
  await refreshStatus();
  return result;
}

function startAuthPolling() {
  if (authPollTimer) {
    clearInterval(authPollTimer);
  }

  let attempts = 0;
  authPollTimer = setInterval(async () => {
    attempts += 1;
    try {
      const result = await checkAuthOnce(false);
      if (result.authenticated) {
        clearInterval(authPollTimer);
        authPollTimer = null;
        if (loginWindow && !loginWindow.closed) {
          loginWindow.close();
        }
        loginWindow = null;
      }
    } catch {
      // Keep polling quietly while the user finishes the browser login.
    }

    if (attempts >= 40) {
      clearInterval(authPollTimer);
      authPollTimer = null;
      setAuthMessage("Check Auth", false);
    }
  }, 3000);
}

form.addEventListener("submit", async (event) => {
  event.preventDefault();
  rememberCourseInput();
  addToCourseHistory(courseInput.value);
  hideCourseHistory();
  try {
    // While a course is downloading, a pasted link joins the queue - it does
    // not pause the current download and it is not rejected.
    if (currentStatus.running) {
      await enqueueCurrentCourse();
      return;
    }

    if (isCurrentCourseCompleted()) {
      const path = previewFolderPath();
      if (!path) {
        showMessage("Course folder is not available yet.");
        return;
      }
      await requestJson("/api/open-path", { method: "POST", body: JSON.stringify({ path }) });
      return;
    }

    await startDownload(canResumeCurrentCourse ? "/api/resume" : "/api/download");
  } catch (error) {
    showMessage(error.message);
  }
});

courseInput.addEventListener("input", () => {
  rememberCourseInput();
  courseHistoryPage = 0;
  updateClearButtonVisibility();
  renderCourseHistory();
  if (courseInput.value.trim()) {
    hideRecentCoursesLanding();
  } else if (!downloadedActivityGroups.length && !showingCourseLanding) {
    // Only fall back to the list when there is no course being viewed; an empty
    // input while browsing the list must not re-render it on every keystroke.
    showRecentCoursesLanding();
  }
});

if (courseClearBtn) {
  courseClearBtn.addEventListener("click", (event) => {
    event.preventDefault();
    clearCourseInput();
  });
}

function goBackToCourses() {
  // Leaving the detail view drops the course selection so the landing list is
  // the single source of truth again. The tree/log are rebuilt from the folder
  // if the course is picked again, so nothing is lost by clearing them.
  courseInput.value = "";
  localStorage.removeItem(COURSE_INPUT_STORAGE_KEY);
  hideCourseHistory();
  downloadedActivityGroups = [];
  lastSessionLogGroups = [];
  currentTreeNodes = [];
  currentSidebarNodes = [];
  selectedTreeId = "";
  canResumeCurrentCourse = false;
  updateClearButtonVisibility();
  if (recentCoursesSection) recentCoursesSection.hidden = true;
  if (activityBody) activityBody.hidden = true;
  showRecentCoursesLanding();
  const heading = document.querySelector("#recentCoursesHeading");
  if (heading) heading.focus();
}

function pickRecentCourse(url) {
  if (!url) return;
  courseInput.value = url;
  rememberCourseInput();
  addToCourseHistory(url);
  updateClearButtonVisibility();
  hideCourseHistory();
  hideRecentCoursesLanding();
  updateBackButton();
  void updateDownloadState({ force: true, render: true });
}

if (backToCoursesBtn) {
  backToCoursesBtn.addEventListener("click", (event) => {
    event.preventDefault();
    goBackToCourses();
  });
}

document.addEventListener("click", (event) => {
  const card = event.target.closest("[data-recent-pick]");
  if (!card) return;
  if (event.target.closest("[data-history-remove]")) return;
  event.preventDefault();
  pickRecentCourse(card.dataset.recentPick);
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  const card = event.target.closest("[data-recent-pick]");
  if (!card) return;
  event.preventDefault();
  pickRecentCourse(card.dataset.recentPick);
});

courseInput.addEventListener("focus", showCourseHistory);

courseInput.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    hideCourseHistory();
  }
});

document.addEventListener("mousedown", (event) => {
  const dropdown = document.querySelector("#courseHistory");
  if (!dropdown || dropdown.hidden) return;
  if (event.target === courseInput) return;
  if (dropdown.contains(event.target)) return;
  hideCourseHistory();
});

document.addEventListener("click", (event) => {
  const pickButton = event.target.closest("[data-history-pick]");
  if (pickButton) {
    event.preventDefault();
    courseInput.value = pickButton.dataset.historyPick;
    rememberCourseInput();
    addToCourseHistory(courseInput.value);
    hideCourseHistory();
    courseInput.dispatchEvent(new Event("change", { bubbles: true }));
    void updateDownloadState({ force: true, render: true });
    return;
  }
  const removeButton = event.target.closest("[data-history-remove]");
  if (removeButton) {
    event.preventDefault();
    event.stopPropagation();
    removeFromCourseHistory(removeButton.dataset.historyRemove);
    renderCourseHistory();
    if (recentCoursesSection && !recentCoursesSection.hidden) {
      showRecentCoursesLanding();
    }
    return;
  }
  if (event.target.closest("[data-history-prev]")) {
    event.preventDefault();
    if (courseHistoryPage > 0) courseHistoryPage -= 1;
    renderCourseHistory();
    courseInput.focus();
    return;
  }
  if (event.target.closest("[data-history-next]")) {
    event.preventDefault();
    courseHistoryPage += 1;
    renderCourseHistory();
    courseInput.focus();
    return;
  }
});

if (pauseBtn) {
  pauseBtn.addEventListener("click", async () => {
    const paused = currentStatus && currentStatus.status === "paused";
    try {
      await controlDownload(
        paused ? "/api/resume-job" : "/api/pause",
        paused ? "Download resumed." : "Download paused."
      );
    } catch (error) {
      showMessage(error.message);
    }
  });
}

if (clearQueueBtn) {
  clearQueueBtn.addEventListener("click", async () => {
    try {
      await clearQueue();
    } catch (error) {
      showMessage(error.message);
    }
  });
}

if (startQueueBtn) {
  startQueueBtn.addEventListener("click", () => {
    void startQueuedCourses();
  });
}

if (bulkLinksToggleBtn && bulkLinksPanel && bulkLinksInput) {
  bulkLinksToggleBtn.addEventListener("click", () => {
    const show = bulkLinksPanel.hidden;
    bulkLinksPanel.hidden = !show;
    bulkLinksToggleBtn.setAttribute("aria-expanded", String(show));
    bulkLinksToggleBtn.textContent = show ? "Hide multiple links" : "Add multiple links";
    if (show) bulkLinksInput.focus();
  });
  bulkLinksInput.addEventListener("input", updateBulkLinkCount);
  bulkLinksInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.ctrlKey || event.metaKey)) {
      event.preventDefault();
      void queueBulkLinks();
    }
  });
}

if (bulkQueueBtn) {
  bulkQueueBtn.addEventListener("click", () => {
    void queueBulkLinks();
  });
}

if (queueList) {
  queueList.addEventListener("click", async (event) => {
    const button = event.target.closest("button");
    if (!button) return;
    const item = button.closest(".queue-item");
    if (!item) return;
    const entryId = Number(item.dataset.entryId);
    try {
      if (button.classList.contains("queue-remove")) {
        await removeQueueEntry(entryId);
      } else if (button.classList.contains("queue-up")) {
        await moveQueueEntry(entryId, -1);
      } else if (button.classList.contains("queue-down")) {
        await moveQueueEntry(entryId, 1);
      }
    } catch (error) {
      showMessage(error.message);
    }
  });
}

refreshBtn.addEventListener("click", async () => {
  try {
    await refreshStatus();
  } catch (error) {
    showMessage(error.message);
  }
});

cancelBtn.addEventListener("click", async () => {
  cancelBtn.disabled = true;
  try {
    await controlDownload("/api/cancel", "Cancel requested. The current download will stop shortly.");
  } catch (error) {
    showMessage(error.message);
  } finally {
    if (!cancelBtn.hidden && downloadBtn.textContent !== "Canceling") {
      cancelBtn.disabled = false;
    }
  }
});

logs.addEventListener("click", async (event) => {
  const sourceButton = event.target.closest("button[data-open-path]");
  if (sourceButton) {
    try {
      await requestJson("/api/open-path", {
        method: "POST",
        body: JSON.stringify({ path: sourceButton.dataset.openPath }),
      });
    } catch (error) {
      showMessage(error.message);
    }
    return;
  }

  const viewButton = event.target.closest("button[data-view]");
  if (viewButton) {
    selectedTreeView = viewButton.dataset.view;
    renderSelectedTreeNode();
    return;
  }

  const folderButton = event.target.closest("button[data-open-node]");
  if (folderButton) {
    selectedTreeId = folderButton.dataset.openNode;
    selectedTreeView = "content";
    renderSelectedTreeNode();
    return;
  }

  const button = event.target.closest("button[data-action]");
  if (!button) return;

  const item = {
    type: button.dataset.type,
    course: button.dataset.course || "",
    section: button.dataset.section || "",
    lecture: button.dataset.lecture || "",
  };

  try {
    await startItemDownload(button.dataset.action, item);
  } catch (error) {
    showMessage(error.message);
  }
});

selectFolderBtn.addEventListener("click", async () => {
  clearMessage();
  selectFolderBtn.disabled = true;
  try {
    const result = await requestJson("/api/select-folder", {
      method: "POST",
      body: JSON.stringify({ path: pathInput.value }),
    });
    if (result.path) {
      pathInput.value = result.path;
      await updateDownloadState();
    }
  } catch (error) {
    showMessage(error.message);
  } finally {
    selectFolderBtn.disabled = false;
  }
});

let downloadStateTimer = null;
function scheduleDownloadStateUpdate() {
  clearTimeout(downloadStateTimer);
  downloadStateTimer = setTimeout(updateDownloadState, 250);
}

courseInput.addEventListener("input", scheduleDownloadStateUpdate);
pathInput.addEventListener("input", scheduleDownloadStateUpdate);

const THEME_STORAGE_KEY = "courseraDownloader.theme";

function currentTheme() {
  return document.documentElement.getAttribute("data-theme") === "dark" ? "dark" : "light";
}

function applyTheme(theme) {
  const root = document.documentElement;
  if (theme === "dark") {
    root.setAttribute("data-theme", "dark");
  } else {
    root.removeAttribute("data-theme");
  }
  if (themeToggleBtn) {
    const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    themeToggleBtn.setAttribute("aria-label", label);
    themeToggleBtn.title = label;
    themeToggleBtn.setAttribute("aria-pressed", theme === "dark" ? "true" : "false");
  }
}

if (themeToggleBtn) {
  applyTheme(currentTheme());
  themeToggleBtn.addEventListener("click", () => {
    const next = currentTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
    try {
      localStorage.setItem(THEME_STORAGE_KEY, next);
    } catch {
      /* private mode: the theme just will not persist */
    }
  });
}

settingsToggleBtn.addEventListener("click", () => {
  setSettingsVisible(settingsPanel.hasAttribute("hidden"), true);
});

activityTree.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-node-id]");
  if (!button) return;
  const toggle = event.target.closest("[data-toggle-node]");
  if (toggle && toggle.dataset.toggleNode) {
    userChangedExpansion = true;
    if (expandedTreeIds.has(toggle.dataset.toggleNode)) {
      expandedTreeIds.delete(toggle.dataset.toggleNode);
    } else {
      expandedTreeIds.add(toggle.dataset.toggleNode);
    }
  }
  selectedTreeId = button.dataset.nodeId;
  selectedTreeView = "content";
  renderSelectedTreeNode();
});

function updateDeleteButton() {
  const hasCourse = Boolean(currentCourseFolder);
  const running = Boolean(currentStatus && currentStatus.running);
  const failedCount = Array.isArray(currentStatus.failed_files)
    ? currentStatus.failed_files.length
    : 0;

  if (deleteCourseBtn) {
    deleteCourseBtn.hidden = !hasCourse;
    if (hasCourse) {
      deleteCourseBtn.title = running
        ? "Stops the running download, then deletes this course folder"
        : "Delete this course folder from disk";
    }
  }
  if (openCourseBtn) {
    // Opening the folder is useful even while downloading.
    openCourseBtn.hidden = !hasCourse;
  }
  if (retryCourseBtn) {
    const show = hasCourse && !running && (canResumeCurrentCourse || failedCount > 0);
    retryCourseBtn.hidden = !show;
    if (show) {
      retryCourseBtn.title = failedCount
        ? `Retry the ${failedCount} failed file${failedCount === 1 ? "" : "s"} plus anything missing`
        : "Re-run this course; only missing or failed files download";
    }
  }
}

function formatBytesForDialog(bytes) {
  const size = Number(bytes) || 0;
  if (size <= 0) return "0 bytes";
  const units = ["bytes", "KB", "MB", "GB", "TB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(size) / Math.log(1024)));
  return `${(size / Math.pow(1024, index)).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

async function deleteCourse() {
  if (!currentCourseFolder) return;
  const payload = {
    course: courseInput.value.trim(),
    path: pathInput.value.trim(),
    course_folder: currentCourseFolder,
  };

  // Ask the server what will be removed before doing anything destructive.
  let info;
  try {
    info = await requestJson("/api/course-delete-info", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  } catch (error) {
    showMessage(error.message);
    return;
  }
  if (!info.allowed) {
    showMessage(info.reason || "This folder cannot be deleted.");
    return;
  }

  const running = Boolean(info.is_running);
  const lines = [
    `Delete "${currentCourseName || "this course"}"?`,
    "",
    `Folder: ${info.folder}`,
    `Contents: ${info.files} file${info.files === 1 ? "" : "s"} (${formatBytesForDialog(info.bytes)})`,
    "",
  ];
  if (running) {
    lines.push("A download is running for this course. It will be stopped first.");
  } else {
    lines.push("This permanently removes the downloaded files from disk.");
  }
  if (!window.confirm(lines.join("\n"))) return;

  deleteCourseBtn.disabled = true;
  try {
    const result = await requestJson("/api/delete-course", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    currentCourseFolder = "";
    downloadedActivityGroups = [];
    updateDeleteButton();
    renderStatus(result.status || { running: false, status: "idle" });
    showMessage(
      `Deleted ${result.files} file${result.files === 1 ? "" : "s"}${
        result.stopped_download ? " after stopping the download" : ""
      }.`,
      true
    );
    await updateDownloadState({ force: true, render: true });
  } catch (error) {
    showMessage(error.message);
  } finally {
    deleteCourseBtn.disabled = false;
  }
}

if (openCourseBtn) {
  openCourseBtn.addEventListener("click", async () => {
    if (!currentCourseFolder) return;
    try {
      await requestJson("/api/open-path", {
        method: "POST",
        body: JSON.stringify({ path: currentCourseFolder }),
      });
    } catch (error) {
      showMessage(error.message);
    }
  });
}

if (retryCourseBtn) {
  retryCourseBtn.addEventListener("click", async () => {
    retryCourseBtn.disabled = true;
    try {
      // --resume makes the workflow skip complete files and re-download only
      // those with a .partial marker (i.e. the ones that failed).
      await startDownload("/api/resume");
    } catch (error) {
      showMessage(error.message);
    } finally {
      retryCourseBtn.disabled = false;
    }
  });
}

if (retryFailedBtn) {
  retryFailedBtn.addEventListener("click", async () => {
    retryFailedBtn.disabled = true;
    try {
      const result = await requestJson("/api/retry-failed", {
        method: "POST",
        body: "{}",
      });
      if (!result.ok) {
        showMessage(result.reason || "Nothing to retry.");
        return;
      }
      failedFilesDismissed = false;
      showMessage(`Retrying ${result.count} failed file${result.count === 1 ? "" : "s"}…`, true);
      renderStatus(result.status);
      startStatusPolling();
    } catch (error) {
      showMessage(error.message);
    } finally {
      retryFailedBtn.disabled = false;
    }
  });
}

if (dismissFailedBtn) {
  dismissFailedBtn.addEventListener("click", () => {
    failedFilesDismissed = true;
    renderFailedFiles(currentStatus);
  });
}

if (deleteCourseBtn) {
  deleteCourseBtn.addEventListener("click", () => {
    void deleteCourse();
  });
}

expandTreeBtn.addEventListener("click", () => {
  userChangedExpansion = true;
  expandAllTreeNodes();
  renderSelectedTreeNode();
});

collapseTreeBtn.addEventListener("click", () => {
  userChangedExpansion = true;
  collapseAllTreeNodes();
  renderSelectedTreeNode();
});

if (authApplyBtn) {
  if (logLevelFilter) {
    logLevelFilter.addEventListener("change", () => {
      localStorage.setItem("courseraDownloader.logLevel", logLevelFilter.value);
      renderLogStream();
    });
  }
  if (logCopyBtn) {
    logCopyBtn.addEventListener("click", async () => {
      const text = visibleLogEntries()
        .map((entry) => `[${entry.time || ""}] ${entry.message || ""}`)
        .join("\n");
      try {
        await navigator.clipboard.writeText(text);
        logCopyBtn.textContent = "Copied";
        setTimeout(() => {
          logCopyBtn.textContent = "Copy";
        }, 1400);
      } catch {
        // Clipboard can be blocked; fall back to selecting the text.
        logStream.focus();
        showMessage("Could not copy automatically. Select the log text and copy it manually.");
      }
    });
  }
  if (logClearBtn) {
    logClearBtn.addEventListener("click", () => {
      // Only the view is cleared; logCursor stays so the server keeps sending
      // anything new, and nothing is lost from the download itself.
      logEntries = [];
      logHiddenBefore = 0;
      renderLogStream();
    });
  }
  if (logAutoScroll) {
    logAutoScroll.addEventListener("change", () => {
      localStorage.setItem("courseraDownloader.logAutoScroll", logAutoScroll.checked ? "1" : "0");
    });
  }

  authApplyBtn.addEventListener("click", () => {
    void applyAuthChoice();
  });
}

if (authBrowserSelect) {
  authBrowserSelect.addEventListener("change", () => {
    localStorage.setItem(AUTH_BROWSER_STORAGE_KEY, authBrowserSelect.value);
  });
}

if (authProfileSelect) {
  authProfileSelect.addEventListener("change", () => {
    localStorage.setItem(AUTH_PROFILE_STORAGE_KEY, authProfileSelect.value);
  });
}

if (authRefreshBtn) {
  authRefreshBtn.addEventListener("click", async () => {
    authRefreshBtn.disabled = true;
    try {
      await loadBrowserProfiles(null);
      showMessage("Browser profiles refreshed.", true);
    } finally {
      authRefreshBtn.disabled = false;
    }
  });
}

loginCheckBtn.addEventListener("click", async () => {
  clearMessage();
  loginCheckBtn.disabled = true;
  try {
    if (!loginOpened) {
      loginWindow = window.open(
        "https://www.coursera.org/?authMode=login",
        "courseraLogin",
        "width=1100,height=800"
      );
      if (!loginWindow) {
        throw new Error("Popup was blocked. Allow popups for this app, then click Login again.");
      }
      loginOpened = true;
      setAuthMessage("Checking login...", null);
      await refreshStatus();
      startAuthPolling();
      showMessage(cleanDisplayMessage(AUTH_HINT_MESSAGE));
      return;
    }

    const result = await checkAuthOnce(true);
    if (!result.authenticated) {
      setAuthMessage("Check Auth", false);
    }
  } catch (error) {
    setAuthMessage(error.message, false);
    showMessage(error.message);
  } finally {
    loginCheckBtn.disabled = false;
  }
});

updateBulkLinkCount();
init().catch((error) => showMessage(error.message));
