import { levelRank } from "./parser.js";

export function getSummary(events) {
  const services = [...new Set(events.map((event) => event.service))].sort((a, b) => a.localeCompare(b));
  const errors = events.filter((event) => levelRank(event.level) >= 4).length;
  const durations = events.map((event) => event.durationMs).filter((value) => value !== null).sort((a, b) => a - b);
  const percentileIndex = durations.length ? Math.ceil(durations.length * 0.95) - 1 : -1;
  const times = events.map((event) => event.time).sort((a, b) => a - b);
  return {
    count: events.length,
    errors,
    errorRate: events.length ? (errors / events.length) * 100 : 0,
    services,
    p95: percentileIndex >= 0 ? durations[percentileIndex] : null,
    durationCount: durations.length,
    firstTime: times[0] ?? null,
    lastTime: times.at(-1) ?? null,
  };
}

export function groupTraces(events) {
  const groups = new Map();
  for (const event of events) {
    if (!event.traceId) continue;
    const group = groups.get(event.traceId) ?? { traceId: event.traceId, count: 0, errors: 0, services: new Set(), firstTime: event.time, lastTime: event.time };
    group.count += 1;
    group.errors += levelRank(event.level) >= 4 ? 1 : 0;
    group.services.add(event.service);
    group.firstTime = Math.min(group.firstTime, event.time);
    group.lastTime = Math.max(group.lastTime, event.time);
    groups.set(event.traceId, group);
  }
  return [...groups.values()]
    .map((group) => ({ ...group, services: [...group.services].sort((a, b) => a.localeCompare(b)) }))
    .sort((a, b) => b.errors - a.errors || b.count - a.count || b.lastTime - a.lastTime);
}

export function makeBuckets(events, bucketCount = 40) {
  if (!events.length) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const event of events) {
    min = Math.min(min, event.time);
    max = Math.max(max, event.time);
  }
  const span = Math.max(max - min, 1000);
  const bucketSize = span / bucketCount;
  const buckets = Array.from({ length: bucketCount }, (_, index) => ({
    index,
    count: 0,
    errors: 0,
    start: min + (index * bucketSize),
  }));
  for (const event of events) {
    const index = Math.min(bucketCount - 1, Math.floor((event.time - min) / bucketSize));
    buckets[index].count += 1;
    if (levelRank(event.level) >= 4) buckets[index].errors += 1;
  }
  return buckets;
}
