/* Движок цикла: статистика, фазы, прогноз, карта дней календаря. */

import { addDays, diffDays, toISO, fromISO, clampISO } from './dates.js';

export const PHASES = {
  menstrual: {
    key: 'menstrual', label: 'Менструация', plural: 'менструальная фаза',
    color: '#D9765F', soft: '#F6D9D2', deep: '#9C3F2C', icon: 'drop',
    short: 'Покой, тепло и железо.',
    about: 'Организм теряет кровь и железо, ресурса меньше. Задача — бережность, тепло и восстановление.',
  },
  follicular: {
    key: 'follicular', label: 'Фолликулярная фаза', plural: 'фолликулярная фаза',
    color: '#7E9C87', soft: '#DDE8DF', deep: '#44604D', icon: 'leaf',
    short: 'Энергия растёт.',
    about: 'Эстроген повышается, силы и настроение растут. Хорошее время для нагрузки и новых дел.',
  },
  ovulation: {
    key: 'ovulation', label: 'Овуляция', plural: 'окно овуляции',
    color: '#8E7CB4', soft: '#E4DCF3', deep: '#584879', icon: 'spark',
    short: 'Пик фертильности.',
    about: 'Выход яйцеклетки: максимальная вероятность зачатия и самый высокий уровень энергии.',
  },
  luteal: {
    key: 'luteal', label: 'Лютеиновая фаза', plural: 'лютеиновая фаза',
    color: '#C9A87C', soft: '#F0E4D2', deep: '#7A5D38', icon: 'moon',
    short: 'Замедляемся мягко.',
    about: 'Прогестерон растёт, появляются ПМС-симптомы. Помогают магний, сон и снижение темпа.',
  },
};

const PHASE_ORDER = ['menstrual', 'follicular', 'ovulation', 'luteal'];

export function normalizePeriods(raw = []) {
  const list = raw
    .filter((p) => p && typeof p.start === 'string')
    .map((p) => ({
      id: p.id || 'p_' + p.start,
      start: p.start,
      end: p.end && p.end >= p.start ? p.end : null,
      note: p.note || '',
    }))
    .sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));

  const merged = [];
  for (const p of list) {
    const prev = merged[merged.length - 1];
    if (prev) {
      const prevEnd = prev.end || prev.start;
      if (p.start <= prevEnd) {
        if (!prev.end || !p.end) prev.end = null;
        else prev.end = prev.end > p.end ? prev.end : p.end;
        continue;
      }
    }
    merged.push({ ...p });
  }
  return merged;
}

function weightedMean(values) {
  if (!values.length) return null;
  let sum = 0, wsum = 0;
  values.forEach((v, i) => {
    const w = 1 + i * 0.2;
    sum += v * w; wsum += w;
  });
  return sum / wsum;
}

export function cycleStats(periods, settings = {}) {
  const gaps = [];
  for (let i = 1; i < periods.length; i++) {
    const gap = diffDays(periods[i - 1].start, periods[i].start);
    if (gap >= 15 && gap <= 90) gaps.push(gap);
  }
  const recentGaps = gaps.slice(-6);

  let usedGaps = recentGaps;
  if (recentGaps.length >= 4) {
    const sorted = [...recentGaps].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const filtered = recentGaps.filter((g) => Math.abs(g - median) <= 10);
    if (filtered.length >= 3) usedGaps = filtered;
  }

  const avgCycleRaw = weightedMean(usedGaps);
  const fallbackCycle = Number(settings.cycleLength) || 28;
  const avgCycle = avgCycleRaw ? Math.round(avgCycleRaw) : fallbackCycle;

  const durations = periods
    .filter((p) => p.end)
    .map((p) => diffDays(p.start, p.end) + 1)
    .filter((d) => d >= 1 && d <= 14)
    .slice(-6);
  const avgPeriodRaw = weightedMean(durations);
  const fallbackPeriod = Number(settings.periodLength) || 5;
  const avgPeriod = avgPeriodRaw ? Math.round(avgPeriodRaw) : fallbackPeriod;

  const spread = usedGaps.length > 1 ? Math.max(...usedGaps) - Math.min(...usedGaps) : 0;
  const regularity = !usedGaps.length ? 'unknown' : spread <= 3 ? 'regular' : spread <= 7 ? 'moderate' : 'irregular';

  return {
    cycleLength: Math.min(60, Math.max(15, avgCycle)),
    periodLength: Math.min(12, Math.max(1, avgPeriod)),
    cyclesTracked: gaps.length,
    gaps: recentGaps,
    durations,
    spread,
    regularity,
    source: avgCycleRaw ? 'history' : 'default',
    usedGaps,
  };
}

export function currentCycle(state, today = toISO(new Date())) {
  const periods = normalizePeriods(state.periods);
  const stats = cycleStats(periods, state.profile || {});
  const len = stats.cycleLength;
  const plen = stats.periodLength;

  const past = periods.filter((p) => p.start <= today);
  const last = past[past.length - 1] || null;

  if (!last) {
    return {
      hasData: false, periods, stats, today, cycleLength: len, periodLength: plen,
      day: 1, phase: 'follicular', phases: buildPhases(1, len, plen), phaseList: phaseSegments(len, plen),
      nextStart: null, daysToNext: null, ovuDate: null,
      fertileStart: null, fertileEnd: null, fertility: 'unknown',
      isLate: false, lateDays: 0, activePeriod: null, dayIndexInCycle: 0,
    };
  }

  const day = diffDays(last.start, today) + 1;
  const activePeriod = last.end ? null : last;
  const ovuDate = addDays(last.start, len - 14);
  const fertileStart = addDays(ovuDate, -5);
  const fertileEnd = addDays(ovuDate, 1);

  let nextStart = addDays(last.start, len);
  const isLate = nextStart < today;
  const lateDays = isLate ? diffDays(nextStart, today) : 0;
  const daysToNext = diffDays(today, nextStart);

  const phases = buildPhases(day, len, plen);
  const current = phases.find((p) => day >= p.from && day <= p.to) || phases[phases.length - 1];

  return {
    hasData: true, periods, stats, today, cycleLength: len, periodLength: plen,
    day, phase: current.key, phases, phaseList: phaseSegments(len, plen),
    lastStart: last.start, lastEnd: last.end,
    nextStart, daysToNext, ovuDate, fertileStart, fertileEnd,
    cycleEnd: addDays(last.start, len - 1),
    fertility: fertilityLevel(today, ovuDate, fertileStart, fertileEnd),
    isLate, lateDays, activePeriod, dayIndexInCycle: day - 1,
    historical: diffDays(last.start, last.end || addDays(last.start, plen - 1)) + 1,
  };
}

function buildPhases(dayOfCycle, len, plen) {
  const ovu = len - 14;
  const safeOvu = Math.max(plen + 1, Math.min(len - 8, ovu));
  const ovuStart = Math.max(plen + 1, safeOvu - 1);
  const ovuEnd = Math.min(len, safeOvu + 1);

  const segs = [
    { key: 'menstrual', from: 1, to: plen },
    { key: 'follicular', from: plen + 1, to: ovuStart - 1 },
    { key: 'ovulation', from: ovuStart, to: ovuEnd },
    { key: 'luteal', from: ovuEnd + 1, to: len },
  ];
  return segs
    .filter((s) => s.to >= s.from)
    .map((s) => ({ ...s, ...PHASES[s.key] }));
}

export function phaseSegments(len, plen) {
  return buildPhases(1, len, plen);
}

export function fertilityLevel(iso, ovuDateISO, fertileStartISO, fertileEndISO) {
  if (!ovuDateISO) return 'unknown';
  const dOvu = Math.abs(diffDays(iso, ovuDateISO));
  if (iso >= fertileStartISO && iso <= fertileEndISO) {
    if (dOvu <= 1) return 'peak';
    return 'high';
  }
  if (iso > fertileEndISO) return 'low';
  return 'low';
}

export const FERTILITY_TEXT = {
  peak: { label: 'Пик', note: 'День овуляции или рядом — вероятность зачатия максимальная.', pct: 88 },
  high: { label: 'Повышенная', note: 'Фертильное окно: зачатие возможно.', pct: 55 },
  low: { label: 'Низкая', note: 'Вне фертильного окна зачатие маловероятно.', pct: 12 },
  unknown: { label: 'Нет данных', note: 'Добавьте дату начала месячных для расчёта.', pct: 0 },
};

/* Прогноз следующих циклов для календаря */
export function futureCycles(cycle, count = 4) {
  if (!cycle.hasData) return [];
  const out = [];
  const starts = [cycle.lastStart];
  for (let i = 1; i <= count; i++) starts.push(addDays(cycle.lastStart, cycle.cycleLength * i));
  starts.forEach((start, i) => {
    if (i === 0) return;
    const end = addDays(start, cycle.periodLength - 1);
    const ovu = addDays(start, cycle.cycleLength - 14);
    out.push({
      start, end,
      periodStart: start, periodEnd: end,
      ovuDate: ovu,
      fertileStart: addDays(ovu, -5),
      fertileEnd: addDays(ovu, 1),
      index: i,
    });
  });
  return out;
}

/* Карта статусов дней для календаря цикла */
export function buildDayMap(cycle, fromISO, toISOStr) {
  const map = new Map();
  const put = (iso, key, val) => {
    if (iso < fromISO || iso > toISOStr) return;
    const cur = map.get(iso) || {};
    map.set(iso, { ...cur, [key]: val });
  };

  for (const p of cycle.periods) {
    const end = p.end || addDays(p.start, Math.max(0, cycle.periodLength - 1));
    for (let d = p.start; d <= end; d = addDays(d, 1)) {
      if (d > cycle.today) break;
      put(d, 'period', true);
    }
  }

  if (!cycle.hasData) return map;

  const late = cycle.isLate;

  // Прогноз будущих циклов. Если цикл запаздывает, первый «будущий» уже не актуален.
  for (const f of futureCycles(cycle, 6)) {
    if (late && f.index === 1) continue;
    for (let d = f.periodStart; d <= f.periodEnd; d = addDays(d, 1)) put(d, 'predicted', true);
    if (f.start > cycle.today) {
      for (let d = f.fertileStart; d <= f.fertileEnd; d = addDays(d, 1)) put(d, 'fertile', true);
      put(f.ovuDate, 'ovulation', true);
    }
  }

  // Текущий цикл: фертильное окно и овуляция
  for (let d = cycle.fertileStart; d <= cycle.fertileEnd; d = addDays(d, 1)) put(d, 'fertile', true);
  put(cycle.ovuDate, 'ovulation', true);

  // Ожидаемые, но не наступившие месячные
  if (cycle.nextStart) {
    if (late) {
      // Показываем разумное окно ожидания, а не бесконечную полосу
      const from = addDays(cycle.today, -9);
      const start = cycle.nextStart > from ? cycle.nextStart : from;
      for (let d = start; d <= cycle.today; d = addDays(d, 1)) put(d, 'overdue', true);
    } else {
      for (let d = cycle.nextStart; d <= addDays(cycle.nextStart, cycle.periodLength - 1); d = addDays(d, 1)) {
        put(d, 'predicted', true);
      }
    }
  }

  // Фактические данные перекрывают прогноз
  for (const v of map.values()) {
    if (v.period) {
      v.predicted = false; v.overdue = false; v.fertile = false; v.ovulation = false;
    }
  }
  return map;
}

export function cycleHistory(periods) {
  const out = [];
  for (let i = 0; i < periods.length; i++) {
    const p = periods[i];
    const next = periods[i + 1];
    const dur = p.end ? diffDays(p.start, p.end) + 1 : null;
    out.push({
      ...p,
      duration: dur,
      length: next ? diffDays(p.start, next.start) : null,
    });
  }
  return out.reverse();
}

export function revisePeriods(periods, today) {
  // Не даём открытому периоду «висеть» бесконечно: если он старше 14 дней и
  // после него нет новых записей — закрываем расчётной длительностью.
  const out = periods.map((p) => ({ ...p }));
  const open = out.filter((p) => !p.end);
  if (open.length <= 1) return out;
  // все, кроме последнего открытого, закрываем днём перед следующим началом
  const sorted = [...out].sort((a, b) => (a.start < b.start ? -1 : 1));
  for (let i = 0; i < sorted.length - 1; i++) {
    const p = sorted[i];
    if (p.end) continue;
    const next = sorted[i + 1];
    if (!next) continue;
    const prevEnd = addDays(next.start, -1);
    if (prevEnd >= p.start) p.end = prevEnd;
  }
  return out;
}

export { PHASE_ORDER, clampISO, toISO, fromISO, addDays, diffDays };
