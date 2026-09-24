const LEVELS = new Map([
  ["fatal", "fatal"], ["critical", "fatal"], ["crit", "fatal"], ["emergency", "fatal"], ["alert", "fatal"],
  ["error", "error"], ["err", "error"], ["exception", "error"],
  ["warn", "warn"], ["warning", "warn"],
  ["info", "info"], ["information", "info"], ["notice", "info"],
  ["debug", "debug"], ["trace", "trace"], ["verbose", "trace"],
]);

const first = (...values) => values.find((value) => value !== undefined && value !== null && value !== "");

function normalizeLevel(value) {
  const normalized = String(value ?? "info").trim().toLowerCase();
  return LEVELS.get(normalized) ?? "info";
}

function getEvent(raw, lineNumber, rawLine) {
  const attributes = raw.attributes && typeof raw.attributes === "object" ? raw.attributes : {};
  const resource = raw.resource && typeof raw.resource === "object" ? raw.resource : {};
  const resourceAttributes = resource.attributes && typeof resource.attributes === "object" ? resource.attributes : {};
  const timestamp = first(raw.timestamp, raw.time, raw["@timestamp"], raw.datetime, raw.ts, attributes.timestamp);
  const timestampText = String(timestamp ?? "").trim();
  const hasZone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(timestampText);
  const normalizedTimestamp = typeof timestamp === "number" && Math.abs(timestamp) < 100_000_000_000
    ? timestamp * 1000
    : !hasZone && /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}/.test(timestampText)
      ? `${timestampText.replace(" ", "T")}Z`
      : timestamp;
  const date = new Date(normalizedTimestamp);
  if (!timestamp || Number.isNaN(date.getTime())) return { error: `line ${lineNumber}: missing or invalid timestamp` };

  const message = first(raw.message, raw.msg, raw.body, raw.event, attributes.message, rawLine);
  const service = first(raw.service, raw.service_name, raw.logger, raw["service.name"], attributes["service.name"], resource["service.name"], resourceAttributes["service.name"], "unknown");
  const traceId = first(raw.trace_id, raw.traceId, raw["trace.id"], attributes.trace_id, attributes.traceId, attributes["trace.id"], "");
  const spanId = first(raw.span_id, raw.spanId, raw["span.id"], attributes.span_id, attributes.spanId, "");
  const requestId = first(raw.request_id, raw.requestId, raw["request.id"], attributes.request_id, attributes.requestId, "");
  const duration = Number(first(raw.duration_ms, raw.durationMs, raw.elapsed_ms, raw.response_time_ms, attributes.duration_ms, attributes.elapsed_ms));

  return {
    event: {
      id: `${lineNumber}-${date.getTime()}`,
      timestamp: date.toISOString(),
      time: date.getTime(),
      level: normalizeLevel(first(raw.level, raw.severity, raw["log.level"], attributes.level, attributes.severity)),
      service: String(service),
      message: String(message),
      traceId: String(traceId),
      spanId: String(spanId),
      requestId: String(requestId),
      durationMs: Number.isFinite(duration) && duration >= 0 ? duration : null,
      raw,
      lineNumber,
    },
  };
}

function parsePlainLine(line, lineNumber) {
  const match = line.match(/^(\S+\s+\S+)\s+(?:\[([^\]]+)\]\s+)?(TRACE|DEBUG|INFO|WARN(?:ING)?|ERROR|FATAL|CRITICAL)\s+(?:\[([^\]]+)\]\s+)?(.*)$/i);
  if (!match) return { error: `line ${lineNumber}: not valid JSON or a supported text log` };
  const [, timestamp, firstLabel, rawLevel, secondLabel, message] = match;
  const raw = { timestamp, level: rawLevel, service: secondLabel || firstLabel || "unknown", message };
  return getEvent(raw, lineNumber, line);
}

export function parseLogText(text) {
  const events = [];
  const issues = [];
  const lines = String(text).replace(/^\uFEFF/, "").split(/\r?\n/);

  lines.forEach((line, index) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return;

    let parsed;
    if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
      try {
        const raw = JSON.parse(trimmed);
        if (raw === null || Array.isArray(raw) || typeof raw !== "object") {
          parsed = { error: `line ${index + 1}: expected a JSON object` };
        } else {
          parsed = getEvent(raw, index + 1, trimmed);
        }
      } catch {
        parsed = parsePlainLine(trimmed, index + 1);
      }
    } else {
      parsed = parsePlainLine(trimmed, index + 1);
    }

    if (parsed.event) events.push(parsed.event);
    else issues.push(parsed.error);
  });

  return { events, issues, lineCount: lines.filter((line) => line.trim() && !line.trim().startsWith("#")).length };
}

export function levelRank(level) {
  return ({ fatal: 5, error: 4, warn: 3, info: 2, debug: 1, trace: 0 })[level] ?? 0;
}
