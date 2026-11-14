// Работа с датами в локальном часовом поясе пользователя.
// Даты дней храним строками YYYY-MM-DD, чтобы не зависеть от UTC.

export const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
export const MONTHS_GEN = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
export const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export const WEEKDAYS_SHORT = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
export const WEEKDAYS = ["понедельник", "вторник", "среда", "четверг", "пятница", "суббота", "воскресенье"];
/** «по понедельникам» и т.п. */
export const WEEKDAYS_PLURAL = ["по понедельникам", "по вторникам", "по средам", "по четвергам", "по пятницам", "по субботам", "по воскресеньям"];

const pad = (n: number) => String(n).padStart(2, "0");

/** Date -> YYYY-MM-DD (локальное время) */
export const toKey = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** YYYY-MM-DD -> Date (полдень, чтобы не съезжать при переходе на летнее время) */
export const fromKey = (k: string) => {
  const [y, m, d] = k.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
};

export const todayKey = () => toKey(new Date());

export const addDays = (d: Date, n: number) => {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
};

export const addMonths = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth() + n, 1, 12);

/** Индекс дня недели, где понедельник = 0 */
export const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7;

export const startOfWeek = (d: Date) => addDays(new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12), -weekdayIndex(d));

/** Сетка месяца: недели с понедельника, null — дни вне месяца */
export function monthGrid(year: number, month: number): (Date | null)[][] {
  const first = new Date(year, month, 1, 12);
  const days = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = Array(weekdayIndex(first)).fill(null);
  for (let i = 1; i <= days; i++) cells.push(new Date(year, month, i, 12));
  while (cells.length % 7) cells.push(null);
  const weeks: (Date | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** «13 ноября» */
export const formatDayMonth = (d: Date) => `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;

/** «13 ноября, пятница» */
export const formatLong = (d: Date) => `${formatDayMonth(d)}, ${WEEKDAYS[weekdayIndex(d)]}`;

/** «Сегодня», «Вчера» или «13 ноября» (+ год, если не текущий) */
export function formatRelativeDay(key: string): string {
  const d = fromKey(key);
  const today = todayKey();
  if (key === today) return "Сегодня";
  if (key === toKey(addDays(new Date(), -1))) return "Вчера";
  const base = formatDayMonth(d);
  return d.getFullYear() === new Date().getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

export const formatTime = (iso: string) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** «только что», «5 мин назад», «2 ч назад», «вчера», «13 ноября» */
export function timeAgo(iso: string): string {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "только что";
  if (diff < 3600) return `${Math.floor(diff / 60)} мин назад`;
  if (diff < 86400 && toKey(new Date(iso)) === todayKey()) return `${Math.floor(diff / 3600)} ч назад`;
  return `${formatRelativeDay(toKey(new Date(iso))).toLowerCase()} в ${formatTime(iso)}`.replace(/^сегодня/, "сегодня");
}

/** Склонение: plural(5, ['день','дня','дней']) */
export function plural(n: number, forms: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

/** Собрать момент времени из даты дня и часов/минут (локальный пояс) */
export function combineDateTime(key: string, hours: number, minutes: number) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, hours, minutes, 0, 0);
}

export const browserTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
};
