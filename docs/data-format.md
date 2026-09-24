# Supported log formats

TraceLens accepts newline-delimited JSON (JSONL/NDJSON) and a deliberately small plain-text format. Each non-empty line is treated as one event. Blank lines and lines beginning with `#` are ignored.

## JSONL

Each line must be a JSON object with a timestamp and a message. Fields can use the common spellings below; unrecognized fields remain available in the raw-event inspector.

```json
{"timestamp":"2026-09-25T09:12:00.110Z","level":"error","service":"checkout-api","message":"payment authorization timed out","trace_id":"trace-7f3a","span_id":"span-005","duration_ms":405}
```

| Meaning | Accepted fields |
| --- | --- |
| Timestamp | `timestamp`, `time`, `@timestamp`, `datetime`, `ts` |
| Severity | `level`, `severity`, `log.level` |
| Message | `message`, `msg`, `body`, `event` |
| Service | `service`, `service_name`, `logger`, `service.name` |
| Trace ID | `trace_id`, `traceId`, `trace.id` |
| Span ID | `span_id`, `spanId`, `span.id` |
| Request ID | `request_id`, `requestId`, `request.id` |
| Duration (milliseconds) | `duration_ms`, `durationMs`, `elapsed_ms`, `response_time_ms` |

The timestamp, level, message and service fields may also be nested under an `attributes` object. OpenTelemetry-style `resource.attributes["service.name"]` is recognized for service names. Timestamps with a timezone are respected. ISO-like timestamps without one are interpreted as UTC.

## Plain text

The supported form is an ISO date, a 24-hour time, a severity, an optional bracketed service name, then the message:

```text
2026-09-25 09:12:00 ERROR [checkout-api] payment authorization timed out
2026-09-25 09:12:01 INFO [edge-gateway] response sent
```

Plain-text rows have no trace, span, request or duration metadata, so those fields remain empty. Arbitrary formats (for example, multiline stack traces or formats with unstructured timestamps) are not guessed. Unsupported and malformed lines are counted in the import notice rather than silently dropped.

## Import behavior

- Files are limited to 20 MB per import.
- Invalid JSON, missing timestamps and unsupported lines are skipped with a line number in the import diagnostics.
- Rows are capped at 250 on screen at first; choose **Show 250 more** to reveal additional matches.
- The source JSON object is retained in memory for inspection and JSONL export.
- Nothing is persisted to local storage or sent to a server.
