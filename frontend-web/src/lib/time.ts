export function parseBackendDate(value: string): Date {
  const trimmed = value.trim();
  const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(trimmed);
  return new Date(hasTimezone ? trimmed : `${trimmed}Z`);
}

export function timeAgo(value: string, suffix = ""): string {
  const date = parseBackendDate(value);
  const diff = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000));

  if (diff < 60) return `just now${suffix}`;
  if (diff < 3600) return `${Math.floor(diff / 60)}m${suffix}`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h${suffix}`;
  if (diff < 604800) return `${Math.floor(diff / 86400)}d${suffix}`;
  return date.toLocaleDateString();
}

export function localTime(value: string): string {
  return parseBackendDate(value).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}
