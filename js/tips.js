/* Библиотека рекомендаций: нормализация, выбор на день, категории. */

import menstrual from '../data/tips/menstrual.js';
import follicular from '../data/tips/follicular.js';
import ovulation from '../data/tips/ovulation.js';
import luteal from '../data/tips/luteal.js';

const RAW = { menstrual, follicular, ovulation, luteal };

export const PHASE_LABEL = {
  menstrual: 'Менструация',
  follicular: 'Фолликулярная фаза',
  ovulation: 'Овуляция',
  luteal: 'Лютеиновая фаза',
};

export const PHASE_COLOR = {
  menstrual: 'var(--coral)',
  follicular: 'var(--sage)',
  ovulation: 'var(--lav)',
  luteal: 'var(--sand)',
};

export const TIPS = Object.fromEntries(
  Object.entries(RAW).map(([phase, list]) => [
    phase,
    list.map(([category, title, text], i) => ({
      id: `${phase}-${i}`,
      phase,
      category,
      title,
      text,
    })),
  ])
);

export const ALL_TIPS = Object.values(TIPS).flat();

export const CATEGORIES = {
  menstrual: ['Питание', 'Тепло', 'Вода', 'Сон', 'Боль', 'Гигиена', 'Уход', 'Эмоции', 'Вдвоём', 'Работа', 'Наблюдение', 'Практика', 'Дом'],
  follicular: ['Питание', 'Энергия', 'Сон', 'Кожа', 'Уход', 'Работа', 'Эмоции', 'Вдвоём', 'Наблюдение', 'Профилактика', 'Практика', 'Дом'],
  ovulation: ['Питание', 'Энергия', 'Сон', 'Кожа', 'Уход', 'Вдвоём', 'Эмоции', 'Работа', 'Наблюдение', 'Профилактика', 'Практика', 'Дом'],
  luteal: ['Питание', 'ПМС', 'Вода', 'Сон', 'Тепло', 'Кожа', 'Стресс', 'Эмоции', 'Вдвоём', 'Наблюдение', 'Профилактика', 'Практика', 'Дом'],
};

/* Детерминированный псевдослучайный индекс: один и тот же совет в один день. */
function hash(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function tipsForDay(phase, iso, cycleDay = 1) {
  const list = TIPS[phase] || TIPS.follicular;
  if (!list.length) return [];
  const seed = hash(`${phase}|${iso}|${cycleDay}`);
  const a = seed % list.length;
  const b = (seed >>> 8) % list.length;
  const c = (seed >>> 16) % list.length;
  const picked = [];
  for (const idx of [a, b, c]) {
    if (!picked.some((t) => t.id === list[idx].id)) picked.push(list[idx]);
    if (picked.length === 3) break;
  }
  let guard = 0;
  while (picked.length < 3 && guard < list.length) {
    const cand = list[(a + guard * 7 + 3) % list.length];
    if (!picked.some((t) => t.id === cand.id)) picked.push(cand);
    guard++;
  }
  return picked;
}

export function tipsByPhase(phase, category = 'all') {
  const list = TIPS[phase] || [];
  return category === 'all' ? list : list.filter((t) => t.category === category);
}

export function tipOfDay(phase, iso) {
  const list = TIPS[phase] || TIPS.follicular;
  return list[hash(`${phase}|${iso}|hero`) % list.length];
}

export const TIP_COUNTS = Object.fromEntries(
  Object.entries(TIPS).map(([k, v]) => [k, v.length])
);
