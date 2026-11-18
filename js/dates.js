/* Дата-хелперы. Все даты — локальные, в формате YYYY-MM-DD. */

export const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

export function toISO(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function fromISO(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function todayISO() {
  return toISO(new Date());
}

export function addDays(iso, n) {
  const d = fromISO(iso);
  d.setDate(d.getDate() + n);
  return toISO(d);
}

export function diffDays(a, b) {
  return Math.round((fromISO(b) - fromISO(a)) / 86400000);
}

export function clampISO(iso, min, max) {
  if (iso < min) return min;
  if (iso > max) return max;
  return iso;
}

export function weekdayShort(iso) {
  return ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'][fromISO(iso).getDay()];
}

const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const MONTHS_NOM = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
const MONTHS_PREP = ['январе', 'феврале', 'марте', 'апреле', 'мае', 'июне', 'июле', 'августе', 'сентябре', 'октябре', 'ноябре', 'декабре'];

export function fmtDate(iso, { year = false, cap = false } = {}) {
  const d = fromISO(iso);
  const m = MONTHS_GEN[d.getMonth()];
  const base = `${d.getDate()} ${m}${year ? ' ' + d.getFullYear() : ''}`;
  return cap ? base.charAt(0).toUpperCase() + base.slice(1) : base;
}

export function fmtMonth(year, month) {
  return `${MONTHS_NOM[month]} ${year}`;
}

export function fmtMonthPrep(year, month) {
  return `${MONTHS_PREP[month]} ${year}`;
}

export function fmtRange(aISO, bISO) {
  const a = fromISO(aISO), b = fromISO(bISO);
  if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
    return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
  }
  return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} — ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
}

export function monthMatrix(year, month) {
  const first = new Date(year, month, 1);
  const offset = (first.getDay() + 6) % 7; // Пн = 0
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells = [];
  for (let i = 0; i < offset; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push(toISO(new Date(year, month, d)));
  }
  while (cells.length % 7 !== 0) cells.push(null);
  return cells;
}

export function plural(n, one, few, many) {
  const abs = Math.abs(n) % 100;
  const n1 = abs % 10;
  if (abs > 10 && abs < 20) return many;
  if (n1 === 1) return one;
  if (n1 >= 2 && n1 <= 4) return few;
  return many;
}

export function daysWord(n) {
  return plural(n, 'день', 'дня', 'дней');
}

export function greeting(date = new Date()) {
  const h = date.getHours();
  if (h < 5) return 'Доброй ночи';
  if (h < 12) return 'Доброе утро';
  if (h < 17) return 'Добрый день';
  if (h < 23) return 'Добрый вечер';
  return 'Доброй ночи';
}

export function relDay(iso, baseISO = todayISO()) {
  const d = diffDays(baseISO, iso);
  if (d === 0) return 'сегодня';
  if (d === 1) return 'завтра';
  if (d === -1) return 'вчера';
  if (d > 1 && d < 7) return `через ${d} ${daysWord(d)}`;
  if (d < -1 && d > -7) return `${Math.abs(d)} ${daysWord(Math.abs(d))} назад`;
  return fmtDate(iso);
}
