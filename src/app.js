import { getSummary, groupTraces, makeBuckets } from "./analytics.js";
import { parseLogText } from "./parser.js";

const $ = (selector) => document.querySelector(selector);
const state = {
  events: [],
  visible: [],
  selectedId: null,
  traceId: "",
  descending: true,
  imported: false,
  issues: [],
  filename: "sample incident",
  rowLimit: 250,
};

const dateTime = new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
const dateShort = new Intl.DateTimeFormat(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", hour12: false });
const dateFull = new Intl.DateTimeFormat(undefined, { year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", timeZoneName: "short" });

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
}

function compact(value, length = 15) {
  const string = String(value);
  return string.length > length ? `${string.slice(0, length - 1)}…` : string;
}

function formatWindow(summary) {
  if (!summary.firstTime) return "No events in this view";
  const first = dateShort.format(summary.firstTime);
  const last = dateShort.format(summary.lastTime);
  return first === last ? first : `${first} — ${last}`;
}

function formatDuration(value) {
  if (value === null) return "—";
  return value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`;
}

function setNotice(message = "") {
  const notice = $("#notice");
  notice.textContent = message;
  notice.hidden = !message;
}

function filteredEvents() {
  const query = $("#search-input").value.trim().toLowerCase();
  const service = $("#service-filter").value;
  const level = $("#level-filter").value;
  return state.events.filter((event) => {
    if (state.traceId && event.traceId !== state.traceId) return false;
    if (service && event.service !== service) return false;
    if (level && event.level !== level) return false;
    if (!query) return true;
    return [event.message, event.service, event.traceId, event.spanId, event.requestId, event.level].join(" ").toLowerCase().includes(query);
  }).sort((a, b) => state.descending ? b.time - a.time || b.lineNumber - a.lineNumber : a.time - b.time || a.lineNumber - b.lineNumber);
}

function renderMetrics(events) {
  const summary = getSummary(events);
  $("#metric-events").textContent = summary.count.toLocaleString();
  $("#metric-error-rate").innerHTML = `${summary.errorRate.toFixed(1)}<small>%</small>`;
  $("#metric-errors").textContent = `${summary.errors} ${summary.errors === 1 ? "error" : "errors"}`;
  $("#metric-services").textContent = summary.services.length.toString();
  $("#metric-service-names").textContent = summary.services.length ? summary.services.slice(0, 3).join(" · ") + (summary.services.length > 3 ? ` +${summary.services.length - 3}` : "") : "No services in this view";
  $("#metric-p95").innerHTML = summary.p95 === null ? `—<small> ms</small>` : `${Math.round(summary.p95).toLocaleString()}<small> ms</small>`;
  $("#metric-duration-count").textContent = summary.durationCount ? `From ${summary.durationCount} timed events` : "No duration data";
  $("#metric-window").textContent = formatWindow(summary);
}

function renderTimeline(events) {
  const chart = $("#timeline-chart");
  const axis = $("#chart-axis");
  const buckets = makeBuckets(events);
  if (!buckets.length) {
    chart.innerHTML = "";
    axis.innerHTML = "<span>—</span><span>—</span><span>—</span><span>—</span><span>—</span>";
    $("#timeline-range").textContent = "Events grouped by time";
    return;
  }
  const maximum = Math.max(1, ...buckets.map((bucket) => bucket.count));
  chart.innerHTML = buckets.map((bucket) => {
    const height = bucket.count ? Math.max(6, (bucket.count / maximum) * 94) : 1;
    const errors = bucket.errors > 0 ? " has-errors" : "";
    const title = `${dateFull.format(bucket.start)} · ${bucket.count} events · ${bucket.errors} errors`;
    return `<span class="chart-bar"><i class="chart-bar-inner${errors}" style="--height:${height.toFixed(1)}%" title="${escapeHtml(title)}"></i></span>`;
  }).join("");

  const summary = getSummary(events);
  const first = summary.firstTime;
  const last = summary.lastTime;
  const tickTimes = Array.from({ length: 5 }, (_, index) => first + ((last - first) * index / 4));
  axis.innerHTML = tickTimes.map((time) => `<span>${escapeHtml(dateTime.format(time))}</span>`).join("");
  $("#timeline-range").textContent = first === last ? dateFull.format(first) : `${dateFull.format(first)} → ${dateFull.format(last)}`;
}

function renderEvents(events) {
  const rows = $("#event-rows");
  const empty = $("#empty-state");
  $("#result-count").textContent = `${events.length.toLocaleString()} ${events.length === 1 ? "event" : "events"}`;
  const rendered = events.slice(0, state.rowLimit);
  $("#footer-count").textContent = `Showing ${rendered.length.toLocaleString()} of ${events.length.toLocaleString()} matching events`;
  $("#load-more-button").hidden = events.length <= state.rowLimit;
  $("#stream-badge").textContent = state.imported ? "IMPORTED" : "SAMPLE DATA";
  empty.hidden = events.length !== 0;
  rows.innerHTML = rendered.map((event) => `
    <tr tabindex="0" role="button" aria-label="${escapeHtml(`${event.level} in ${event.service}: ${event.message}`)}" data-event-id="${escapeHtml(event.id)}" class="${event.id === state.selectedId ? "selected" : ""}">
      <td class="time-cell" title="${escapeHtml(dateFull.format(event.time))}">${escapeHtml(dateTime.format(event.time))}</td>
      <td><span class="level-chip level-${escapeHtml(event.level)}">${escapeHtml(event.level)}</span></td>
      <td class="service-name" title="${escapeHtml(event.service)}">${escapeHtml(compact(event.service, 17))}</td>
      <td class="message-cell" title="${escapeHtml(event.message)}">${escapeHtml(event.message)}</td>
      <td>${event.traceId ? `<button class="trace-link" data-trace-id="${escapeHtml(event.traceId)}" title="Filter this trace">${escapeHtml(compact(event.traceId, 12))}</button>` : '<span class="time-cell">—</span>'}</td>
    </tr>`).join("");
}

function renderDetails(event) {
  const container = $("#detail-content");
  const subtitle = $("#detail-subtitle");
  if (!event) {
    subtitle.textContent = "Choose a log event";
    container.innerHTML = `<div class="detail-placeholder"><div class="placeholder-orbit"><span></span></div><p>Select a row to inspect<br />the complete event payload.</p><div class="placeholder-tip">Tip: search for <code>trace-7f3a</code></div></div>`;
    return;
  }
  subtitle.textContent = `${event.level.toUpperCase()} · ${dateFull.format(event.time)}`;
  const fields = [
    ["service", event.service], ["severity", event.level], ["trace id", event.traceId || "—"], ["span id", event.spanId || "—"],
    ["request id", event.requestId || "—"], ["duration", event.durationMs === null ? "—" : formatDuration(event.durationMs)],
  ];
  const fieldMarkup = fields.map(([label, value]) => `<div class="detail-field"><div class="field-label">${escapeHtml(label)}</div><div class="field-value">${escapeHtml(value)}</div></div>`).join("");
  container.innerHTML = `<div class="detail-fields"><div class="detail-field wide"><div class="field-label">message</div><div class="field-value message-value">${escapeHtml(event.message)}</div></div>${fieldMarkup}</div><div class="payload"><div class="payload-head"><span>RAW EVENT</span><button class="copy-button" id="copy-payload">Copy JSON</button></div><pre>${escapeHtml(JSON.stringify(event.raw, null, 2))}</pre></div>`;
  $("#copy-payload").addEventListener("click", async () => {
    await navigator.clipboard.writeText(JSON.stringify(event.raw, null, 2));
    $("#copy-payload").textContent = "Copied";
    window.setTimeout(() => { const button = $("#copy-payload"); if (button) button.textContent = "Copy JSON"; }, 1000);
  });
}

function renderTraces(events) {
  const list = $("#trace-list");
  const empty = $("#trace-empty");
  const traces = groupTraces(events).slice(0, 5);
  empty.hidden = traces.length > 0;
  list.innerHTML = traces.map((trace) => {
    const percent = Math.max(7, (trace.count / traces[0].count) * 100);
    const duration = trace.lastTime - trace.firstTime;
    const serviceCount = trace.services.length;
    return `<button class="trace-row ${trace.traceId === state.traceId ? "active" : ""}" data-select-trace="${escapeHtml(trace.traceId)}" aria-pressed="${trace.traceId === state.traceId}">
      <span class="trace-id" title="${escapeHtml(trace.traceId)}">${escapeHtml(trace.traceId)}</span><span class="trace-total">${trace.count} events</span>
      <span class="trace-meta">${trace.errors ? `${trace.errors} ${trace.errors === 1 ? "error" : "errors"} · ` : ""}${serviceCount} ${serviceCount === 1 ? "service" : "services"} · ${formatDuration(duration)}</span>
      <span class="trace-bar"><i class="${trace.errors ? "has-errors" : ""}" style="width:${percent.toFixed(0)}%"></i></span>
    </button>`;
  }).join("");
}

function updateServiceFilter() {
  const select = $("#service-filter");
  const current = select.value;
  const services = [...new Set(state.events.map((event) => event.service))].sort((a, b) => a.localeCompare(b));
  select.innerHTML = `<option value="">All services</option>${services.map((service) => `<option value="${escapeHtml(service)}">${escapeHtml(service)}</option>`).join("")}`;
  select.value = services.includes(current) ? current : "";
}

function render() {
  state.visible = filteredEvents();
  if (!state.visible.some((event) => event.id === state.selectedId)) state.selectedId = state.visible[0]?.id ?? null;
  renderMetrics(state.visible);
  renderTimeline(state.visible);
  renderEvents(state.visible);
  renderDetails(state.visible.find((event) => event.id === state.selectedId) ?? null);
  renderTraces(state.visible);
  $("#clear-trace-button").style.visibility = state.traceId ? "visible" : "hidden";
}

function loadText(text, filename, imported) {
  const result = parseLogText(text);
  state.events = result.events;
  state.issues = result.issues;
  state.filename = filename;
  state.imported = imported;
  state.rowLimit = 250;
  state.traceId = "";
  state.selectedId = null;
  updateServiceFilter();
  if (result.events.length && result.issues.length) {
    const issueDetails = result.issues.slice(0, 4).join(" · ");
    const remaining = result.issues.length - Math.min(result.issues.length, 4);
    setNotice(`Loaded ${result.events.length} events. ${result.issues.length} line${result.issues.length === 1 ? " was" : "s were"} skipped: ${issueDetails}${remaining ? ` · +${remaining} more` : ""}`);
  } else if (!result.events.length && result.lineCount) {
    setNotice("No usable events found. Include a timestamp and message in JSONL, or use ISO timestamps in supported text logs.");
  } else {
    setNotice("");
  }
  $(".eyebrow").innerHTML = `<span class="live-dot"></span> INCIDENT WORKSPACE <span class="eyebrow-separator">·</span> ${escapeHtml(filename).toUpperCase()}`;
  render();
}

async function loadSample() {
  try {
    const response = await fetch("./samples/incident.jsonl");
    if (!response.ok) throw new Error("Sample data could not be loaded.");
    loadText(await response.text(), "SAMPLE DATA", false);
  } catch {
    setNotice("Sample logs could not be loaded. Import a .jsonl or .log file to get started.");
    render();
  }
}

async function importFile(file) {
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) {
    setNotice("This file is larger than the 20 MB import limit. Split it into smaller time windows and import one at a time.");
    return;
  }
  loadText(await file.text(), file.name, true);
}

function resetView() {
  $("#search-input").value = "";
  $("#service-filter").value = "";
  $("#level-filter").value = "";
  state.traceId = "";
  state.descending = true;
  state.rowLimit = 250;
  $("#sort-button").textContent = "↓";
  $("#sort-button").setAttribute("aria-label", "Sort newest first");
  render();
}

function selectEvent(id) {
  state.selectedId = id;
  renderEvents(state.visible);
  renderDetails(state.visible.find((event) => event.id === id) ?? null);
}

function downloadEvents() {
  const rows = state.visible.map((event) => JSON.stringify(event.raw)).join("\n");
  const blob = new Blob([rows + (rows ? "\n" : "")], { type: "application/x-ndjson" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "tracelens-export.jsonl";
  anchor.click();
  URL.revokeObjectURL(url);
}

function closeDialog() {
  $("#shortcut-dialog").hidden = true;
  $("#help-button").focus();
}

$("#open-file-button").addEventListener("click", () => $("#file-input").click());
$("#file-input").addEventListener("change", (event) => {
  const file = event.target.files?.[0];
  event.target.value = "";
  importFile(file);
});
$("#drop-zone").addEventListener("click", () => $("#file-input").click());
$("#drop-zone").addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); $("#file-input").click(); } });
$("#drop-zone").addEventListener("dragover", (event) => { event.preventDefault(); $("#drop-zone").classList.add("dragging"); });
$("#drop-zone").addEventListener("dragleave", () => $("#drop-zone").classList.remove("dragging"));
$("#drop-zone").addEventListener("drop", (event) => { event.preventDefault(); $("#drop-zone").classList.remove("dragging"); importFile(event.dataTransfer.files?.[0]); });
$("#search-input").addEventListener("input", render);
$("#service-filter").addEventListener("change", render);
$("#level-filter").addEventListener("change", render);
$("#reset-button").addEventListener("click", resetView);
$("#clear-filters-button").addEventListener("click", resetView);
$("#clear-trace-button").addEventListener("click", () => { state.traceId = ""; render(); });
$("#sort-button").addEventListener("click", () => {
  state.descending = !state.descending;
  $("#sort-button").textContent = state.descending ? "↓" : "↑";
  $("#sort-button").setAttribute("aria-label", state.descending ? "Sort newest first" : "Sort oldest first");
  render();
});
$("#download-button").addEventListener("click", downloadEvents);
$("#load-more-button").addEventListener("click", () => { state.rowLimit += 250; renderEvents(state.visible); });
$("#help-button").addEventListener("click", () => { $("#shortcut-dialog").hidden = false; $("#close-help").focus(); });
$("#close-help").addEventListener("click", closeDialog);
$("#shortcut-dialog").addEventListener("click", (event) => { if (event.target === $("#shortcut-dialog")) closeDialog(); });
$("#event-rows").addEventListener("click", (event) => {
  const traceButton = event.target.closest("[data-trace-id]");
  if (traceButton) {
    event.stopPropagation();
    state.traceId = traceButton.dataset.traceId;
    render();
    return;
  }
  const row = event.target.closest("[data-event-id]");
  if (row) selectEvent(row.dataset.eventId);
});
$("#event-rows").addEventListener("keydown", (event) => {
  const row = event.target.closest("[data-event-id]");
  if (row && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); selectEvent(row.dataset.eventId); }
});
$("#trace-list").addEventListener("click", (event) => {
  const row = event.target.closest("[data-select-trace]");
  if (!row) return;
  state.traceId = state.traceId === row.dataset.selectTrace ? "" : row.dataset.selectTrace;
  render();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !$("#shortcut-dialog").hidden) { closeDialog(); return; }
  const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(document.activeElement?.tagName);
  if (typing || event.metaKey || event.ctrlKey || event.altKey) return;
  if (event.key === "/") { event.preventDefault(); $("#search-input").focus(); }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    const current = state.visible.findIndex((item) => item.id === state.selectedId);
    const direction = event.key === "ArrowDown" ? 1 : -1;
    const next = Math.max(0, Math.min(Math.min(state.visible.length, state.rowLimit) - 1, current + direction));
    if (state.visible[next]) { event.preventDefault(); selectEvent(state.visible[next].id); document.querySelector(`[data-event-id="${CSS.escape(state.selectedId)}"]`)?.focus(); }
  }
  if (event.key === "Enter" && state.selectedId) renderDetails(state.visible.find((item) => item.id === state.selectedId));
});

await loadSample();
