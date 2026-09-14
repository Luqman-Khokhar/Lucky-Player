const oneDecimal = new Intl.NumberFormat(undefined, { maximumFractionDigits: 1 });
const integer = new Intl.NumberFormat();
const BYTE_UNITS = ['B', 'KB', 'MB', 'GB', 'TB'];

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  const exponent = Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  return `${oneDecimal.format(bytes / 1024 ** exponent)} ${BYTE_UNITS[exponent]}`;
}

export function formatCount(count: number, singular: string, plural = `${singular}s`): string {
  return `${integer.format(count)} ${count === 1 ? singular : plural}`;
}

export function formatDate(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatScanTime(ms: number | null, now = Date.now()): string {
  if (!ms) return 'Not scanned yet';
  const minutes = Math.round((now - ms) / 60_000);
  if (minutes < 1) return 'Scanned just now';
  if (minutes < 60) return `Scanned ${minutes} min ago`;
  return `Scanned ${formatDate(ms)}`;
}

/** Uses the short side so portrait videos read as 1080p, not 1920p. */
export function resolutionLabel(width: number, height: number): string {
  const lines = Math.min(width, height) || Math.max(width, height);
  if (!lines) return '';
  if (lines >= 2160) return '4K';
  if (lines >= 1440) return '1440p';
  if (lines >= 1080) return '1080p';
  if (lines >= 720) return '720p';
  return `${lines}p`;
}
