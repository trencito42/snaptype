export interface DateFormatOptions {
  format?: string;
  offset?: string; // e.g. "+1d", "-2w", "+1m", "+1y"
  timezone?: string;
  locale?: string;
}

export function formatDateTime(now: Date = new Date(), options: DateFormatOptions = {}): string {
  let targetDate = new Date(now.getTime());

  if (options.offset) {
    targetDate = applyDateOffset(targetDate, options.offset);
  }

  const formatStr = options.format || 'YYYY-MM-DD';
  return applyDateFormat(targetDate, formatStr, options.timezone, options.locale || 'en-US');
}

export function applyDateOffset(date: Date, offsetStr: string): Date {
  const result = new Date(date.getTime());
  const trimmed = offsetStr.trim().toLowerCase();

  if (trimmed === 'tomorrow' || trimmed === '+1d') {
    result.setDate(result.getDate() + 1);
    return result;
  }
  if (trimmed === 'yesterday' || trimmed === '-1d') {
    result.setDate(result.getDate() - 1);
    return result;
  }

  const match = trimmed.match(/^([+-]?\d+)\s*([dhwmy])$/);
  if (!match) return result;

  const value = parseInt(match[1], 10);
  const unit = match[2];

  switch (unit) {
    case 'h':
      result.setHours(result.getHours() + value);
      break;
    case 'd':
      result.setDate(result.getDate() + value);
      break;
    case 'w':
      result.setDate(result.getDate() + value * 7);
      break;
    case 'm':
      result.setMonth(result.getMonth() + value);
      break;
    case 'y':
      result.setFullYear(result.getFullYear() + value);
      break;
  }

  return result;
}

export function applyDateFormat(date: Date, format: string, timezone?: string, locale: string = 'en-US'): string {
  // If timezone is specified, shift to that timezone
  let d = date;
  if (timezone) {
    try {
      const invDate = new Date(date.toLocaleString('en-US', { timeZone: timezone }));
      if (!isNaN(invDate.getTime())) {
        d = invDate;
      }
    } catch {
      // fallback to original date if timezone is invalid
    }
  }

  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const hours24 = d.getHours();
  const hours12 = hours24 % 12 || 12;
  const minutes = d.getMinutes();
  const seconds = d.getSeconds();
  const ampm = hours24 >= 12 ? 'PM' : 'AM';

  const pad = (n: number) => n.toString().padStart(2, '0');

  // Month names
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  const dayNames = [
    'Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'
  ];

  return format
    .replace(/\bYYYY\b/g, year.toString())
    .replace(/\bYY\b/g, year.toString().slice(-2))
    .replace(/\bMMMM\b/g, monthNames[month - 1])
    .replace(/\bMMM\b/g, monthNames[month - 1].slice(0, 3))
    .replace(/\bMM\b/g, pad(month))
    .replace(/\bM\b/g, month.toString())
    .replace(/\bdddd\b/g, dayNames[d.getDay()])
    .replace(/\bddd\b/g, dayNames[d.getDay()].slice(0, 3))
    .replace(/\bDD\b/g, pad(day))
    .replace(/\bD\b/g, day.toString())
    .replace(/\bHH\b/g, pad(hours24))
    .replace(/\bH\b/g, hours24.toString())
    .replace(/\bhh\b/g, pad(hours12))
    .replace(/\bh\b/g, hours12.toString())
    .replace(/\bmm\b/g, pad(minutes))
    .replace(/\bm\b/g, minutes.toString())
    .replace(/\bss\b/g, pad(seconds))
    .replace(/\bs\b/g, seconds.toString())
    .replace(/\bA\b/g, ampm)
    .replace(/\ba\b/g, ampm.toLowerCase());
}

