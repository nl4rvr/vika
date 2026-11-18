/* ============================================================
   Вика — цикл и мигрени
   Vanilla ES modules, без сборки. Готово к GitHub Pages.
   ============================================================ */

import {
  todayISO, fmtDate, fmtMonth, monthMatrix, addDays, diffDays,
  daysWord, greeting, relDay, fromISO, ISO_RE,
} from './js/dates.js';
import {
  currentCycle, buildDayMap, cycleHistory, PHASES, PHASE_ORDER, FERTILITY_TEXT,
} from './js/cycle.js';
import {
  TIP_COUNTS, tipsForDay, tipsByPhase, CATEGORIES, PHASE_LABEL,
} from './js/tips.js';
import {
  loadState, saveState, mergeStates, exportJSON, importJSON,
  hasPin, setPin, verifyPin, clearPin, markUnlocked, isUnlocked,
  lockSession, touchSession, clearState,
} from './js/store.js';import { createSync } from './js/firebase.js';
import { precacheFromPage, clearOldCaches } from './js/pwa.js';

/* ── утилиты ─────────────────────────────────────────────── */

const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (v = '') => String(v)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const ICON = (name, cls = '') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${name}"/></svg>`;

const WEEK = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

const MEDS = [
  { id: 'eksenza1', label: 'Эксенза — 1 пшик', short: 'Эксенза ×1', kind: 'eksenza', puffs: 1 },
  { id: 'eksenza2', label: 'Эксенза — 2 пшика', short: 'Эксенза ×2', kind: 'eksenza', puffs: 2 },
  { id: 'nurofen', label: 'Нурофен', short: 'Нурофен', kind: 'nurofen', puffs: 0 },
  { id: 'none', label: 'Ничего не принимала', short: 'Без препаратов', kind: 'none', puffs: 0 },
];

const PAIN = [
  { v: 1, label: 'Слабая' },
  { v: 2, label: 'Средняя' },
  { v: 3, label: 'Сильная' },
];

const FLOWS = [
  { v: 'light', label: 'Скудные' },
  { v: 'medium', label: 'Обычные' },
  { v: 'heavy', label: 'Обильные' },
];

const SYMPTOMS = [
  'Тянет живот', 'Поясница', 'Усталость', 'Отёки', 'Головная боль',
  'Тошнота', 'Грудь', 'Раздражительность', 'Вздутие', 'Хорошее настроение',
];

const QUICK_TAGS = [
  'Недосып', 'Погода', 'Стресс', 'Голод', 'Менструация', 'Кофеин',
  'Яркий свет', 'Запахи', 'Обезвоживание', 'Пропуск еды',
];

const TABS = ['today', 'cycle', 'migraine'];

/* ── состояние ───────────────────────────────────────────── */

let state = loadState();
const sync = createSync();

const now = new Date();
const ui = {
  route: 'today',
  sheet: null,
  draft: null,
  cycleMonth: { y: now.getFullYear(), m: now.getMonth() },
  migMonth: { y: now.getFullYear(), m: now.getMonth() },
  tipOffset: 0,
  tipsPhase: null,
  tipsCat: 'all',
  installPrompt: null,
  pinBuffer: '',
  pinError: '',
  pinIntent: null, // 'set' | 'off' | 'change'
  pinStage: null,  // 'verify' | 'new'
  lastDay: todayISO(),
};

function cycleData() {
  return currentCycle(state, todayISO());
}

function persist(opts = {}) {
  saveState(state);
  sync.push(state);
  if (opts.sheetOnly && ui.sheet) renderSheet();
  else render();
}

function toast(msg) {
  const el = $('#toast');
  if (!el) return;
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => el.classList.remove('show'), 2500);
}

/* ── шапка ───────────────────────────────────────────────── */

function header(c) {
  const name = state.profile.name || 'Вика';
  let sub = 'Рада видеть. Начнём с первого дня месячных.';
  if (c.hasData) {
    if (c.isLate) sub = `Цикл длиннее обычного на ${c.lateDays} ${daysWord(c.lateDays)} — это бывает.`;
    else sub = `${PHASE_LABEL[c.phase]} · ${c.day}-й день цикла`;
  }
  return `
    <header class="top">
      <div>
        <p class="hello-date">${esc(fmtDate(todayISO(), { cap: true }))}</p>
        <h1 class="hello-title">${esc(greeting())}, <em>${esc(name)}</em></h1>
        <p class="hello-sub">${esc(sub)}</p>
      </div>
      <div class="top-actions">
        <button class="icon-btn" data-act="sheet" data-sheet="settings" aria-label="Настройки">${ICON('settings')}</button>
      </div>
    </header>`;
}

/* ── кольцо прогресса ────────────────────────────────────── */

function ring(pct, color) {
  const R = 52;
  const C = 2 * Math.PI * R;
  const p = Math.min(1, Math.max(0, pct));
  const off = C * (1 - p);
  const ang = 2 * Math.PI * p;
  const hx = 60 + R * Math.cos(ang);
  const hy = 60 + R * Math.sin(ang);
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle class="track" cx="60" cy="60" r="${R}"/>
    <circle class="prog" cx="60" cy="60" r="${R}" stroke="${color}"
      stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${off.toFixed(2)}"/>
    ${p > 0.01 ? `<circle cx="${hx.toFixed(2)}" cy="${hy.toFixed(2)}" r="4.6" fill="${color}" stroke="#FFFCF8" stroke-width="2.6"/>` : ''}
  </svg>`;
}

function miniRing(pct, color) {
  const R = 15;
  const C = 2 * Math.PI * R;
  const p = Math.min(1, Math.max(0, pct));
  return `<div class="ring-mini">
    <svg viewBox="0 0 40 40" aria-hidden="true">
      <circle class="track" cx="20" cy="20" r="${R}"/>
      <circle class="prog" cx="20" cy="20" r="${R}" stroke="${color}"
        stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - p)).toFixed(2)}"/>
    </svg>
    <div class="ring-mini-num">${Math.round(p * 100)}<small>%</small></div>
  </div>`;
}

/* ── экран «Сегодня» ─────────────────────────────────────── */

function viewToday() {
  const c = cycleData();
  const today = todayISO();
  const todayLog = state.days[today] || {};
  const todayMig = state.migraines[today];

  return `
    <div class="view">
      ${header(c)}
      ${c.hasData ? heroCard(c) : onboardingCard()}
      ${c.hasData ? quickActions(c) : ''}
      ${todayNoteCard(c, todayLog)}
      ${tipCard(c)}
      ${weekStrip(c)}
      ${migraineMiniCard(todayMig)}
      ${c.hasData ? cycleFacts(c) : ''}
    </div>`;
}

function onboardingCard() {
  return `
    <section class="card tint-coral hero">
      <span class="phase-chip"><i class="dot"></i>Начало положено</span>
      <div class="ring-wrap">
        ${ring(0.02, '#D9765F')}
        <div class="ring-center">
          <div class="ring-day">День цикла</div>
          <div class="ring-glyph">${ICON('drop')}</div>
          <div class="ring-cap">Отметьте первый день месячных</div>
        </div>
      </div>
      <div class="actions" style="margin-top:20px">
        <button class="action coral" data-act="start-today">
          <span class="a-ico">${ICON('drop')}</span>
          <span><span class="a-t">Начать сегодня</span><span class="a-s">первый день</span></span>
        </button>
        <button class="action lav" data-act="sheet" data-sheet="period">
          <span class="a-ico">${ICON('cycle')}</span>
          <span><span class="a-t">Другая дата</span><span class="a-s">вручную</span></span>
        </button>
      </div>
      <p class="tiny muted" style="margin-top:14px;line-height:1.5">Данные хранятся только у вас — в браузере и, если подключите, в вашем Firebase.</p>
    </section>`;
}

function heroCard(c) {
  const ph = PHASES[c.phase];
  const pct = Math.min(1, c.day / c.cycleLength);
  const fert = FERTILITY_TEXT[c.fertility];
  const nextValue = c.isLate
    ? `<span style="color:var(--coral-deep)">${c.lateDays} ${daysWord(c.lateDays)}</span>`
    : `${Math.max(0, c.daysToNext)} <small>${daysWord(Math.max(0, c.daysToNext))}</small>`;
  const nextCaption = c.isLate ? `ожидались ${fmtDate(c.nextStart)}` : `ожидаются ${fmtDate(c.nextStart)}`;
  const nextLabel = c.isLate ? 'Задержка' : 'Следующие';

  return `
    <section class="card hero">
      <span class="phase-chip">
        <i class="dot" style="background:${ph.color};box-shadow:0 0 0 4px ${ph.soft}"></i>
        ${esc(ph.label)}
      </span>
      <div class="ring-wrap">
        ${ring(pct, ph.color)}
        <div class="ring-center">
          <div class="ring-day">День цикла</div>
          <div class="ring-num">${c.day}<small>${c.day > c.cycleLength ? '' : '/' + c.cycleLength}</small></div>
          <div class="ring-cap">${c.isLate ? 'Цикл длиннее обычного' : esc(ph.short)}</div>
        </div>
      </div>
      <div class="hero-stats">
        <div class="stat">
          <div class="stat-label">${ICON('cycle')} ${nextLabel}</div>
          <div class="stat-value">${nextValue}</div>
          <div class="tiny muted" style="margin-top:2px">${esc(nextCaption)}</div>
        </div>
        <div class="stat">
          <div class="stat-label">${ICON('spark')} Зачатие</div>
          <div class="stat-value">${esc(fert.label)}</div>
          <div class="score-bar"><i style="width:${fert.pct}%"></i></div>
        </div>
      </div>
      <p class="tiny muted" style="margin-top:12px;line-height:1.45">${esc(fert.note)}</p>
    </section>`;
}

function quickActions(c) {
  const active = activeInState();
  const primary = active
    ? { act: 'end-today', icon: 'check', t: 'Месячные закончились', s: `идут с ${fmtDate(active.start)}`, cls: 'sage' }
    : { act: 'start-today', icon: 'drop', t: 'Начались месячные', s: 'отметить сегодня', cls: 'coral' };
  return `
    <section class="actions">
      <button class="action ${primary.cls}" data-act="${primary.act}">
        <span class="a-ico">${ICON(primary.icon)}</span>
        <span><span class="a-t">${esc(primary.t)}</span><span class="a-s">${esc(primary.s)}</span></span>
      </button>
      <button class="action sand" data-act="sheet" data-sheet="period">
        <span class="a-ico">${ICON('note')}</span>
        <span><span class="a-t">Детали дня</span><span class="a-s">симптомы</span></span>
      </button>
    </section>`;
}

function todayNoteCard(c, log) {
  const syms = Array.isArray(log.symptoms) ? log.symptoms : [];
  if (!log.flow && !syms.length && !log.note) return '';
  const flowLabel = FLOWS.find((f) => f.v === log.flow)?.label || '';
  return `
    <section class="card flat">
      <div class="card-head">
        <div class="card-title">${ICON('check')} Отмечено сегодня</div>
        <button class="link-btn" data-act="sheet" data-sheet="period">Изменить</button>
      </div>
      <div class="chips">
        ${flowLabel ? `<span class="chip on coral">${esc(flowLabel)}</span>` : ''}
        ${syms.map((s) => `<span class="chip">${esc(s)}</span>`).join('')}
      </div>
      ${log.note ? `<p class="tiny muted" style="margin-top:10px;line-height:1.5">${esc(log.note)}</p>` : ''}
    </section>`;
}

function tipCard(c) {
  if (!state.profile.tipsEnabled) return '';
  const phase = c.hasData ? c.phase : 'follicular';
  const list = tipsForDay(phase, todayISO(), c.day || 1);
  if (!list.length) return '';
  const idx = ui.tipOffset % list.length;
  const tip = list[idx];
  const ph = PHASES[phase];

  return `
    <section class="card tip">
      <div class="tip-head">
        <div class="tip-label" style="color:${ph.deep}">${ICON('spark')} Рекомендация дня</div>
        <button class="link-btn" data-act="sheet" data-sheet="tips">Все советы</button>
      </div>
      <h2 class="tip-title">${esc(tip.title)}</h2>
      <p class="tip-text">${esc(tip.text)}</p>
      <div class="tip-meta">
        <span class="chip-mini">${esc(tip.category)}</span>
        <span class="chip-mini">${esc(PHASE_LABEL[phase])}</span>
      </div>
      <div class="tip-foot">
        <button class="link-btn" data-act="tip-next">Ещё совет ${ICON('arrow')}</button>
        <div class="tip-dots">
          ${list.map((_, i) => `<i class="${i === idx ? 'on' : ''}"></i>`).join('')}
        </div>
      </div>
    </section>`;
}

function weekStrip(c) {
  const start = todayISO();
  const end = addDays(start, 6);
  const map = buildDayMap(c, start, end);
  const items = [];
  for (let i = 0; i < 7; i++) {
    const iso = addDays(start, i);
    const info = map.get(iso) || {};
    items.push({
      iso,
      phase: phaseForDate(c, iso),
      predicted: Boolean(info.predicted || info.overdue),
      period: Boolean(info.period),
    });
  }
  return `
    <section class="card flat">
      <div class="card-head">
        <div class="card-title">${ICON('cycle')} Ближайшая неделя</div>
        <button class="link-btn" data-act="go" data-route="cycle">Календарь</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(7,1fr);gap:5px">
        ${items.map((d) => {
          const ph = PHASES[d.phase] || PHASES.follicular;
          const isToday = d.iso === start;
          return `<button data-act="day" data-date="${d.iso}"
            style="display:flex;flex-direction:column;align-items:center;gap:5px;padding:8px 2px;border-radius:14px;background:${isToday ? 'rgba(255,255,255,.85)' : 'transparent'};box-shadow:${isToday ? 'var(--shadow-s)' : 'none'}">
            <span style="font-size:10px;font-weight:700;letter-spacing:.05em;color:var(--hint);text-transform:uppercase">${WEEK[(fromISO(d.iso).getDay() + 6) % 7]}</span>
            <span style="width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-size:12px;font-weight:700;color:${ph.deep};background:${ph.soft};box-shadow:${d.predicted ? `inset 0 0 0 1.6px ${ph.color}` : 'none'}">${fromISO(d.iso).getDate()}</span>
            <span style="width:4px;height:4px;border-radius:50%;background:${ph.color}"></span>
          </button>`;
        }).join('')}
      </div>
    </section>`;
}

function migraineMiniCard(log) {
  const today = todayISO();
  if (!log) {
    return `
      <section class="card flat" style="display:flex;align-items:center;gap:13px">
        <span style="width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:var(--lav-soft);color:var(--lav-deep);font-size:20px;flex-shrink:0">${ICON('migraine')}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:14px;font-weight:650">Голова сегодня не отмечена</div>
          <div class="tiny muted" style="margin-top:2px">Отметьте состояние — это пара секунд</div>
        </div>
        <button class="icon-btn small" data-act="sheet" data-sheet="migraine" data-date="${today}" aria-label="Отметить мигрень">${ICON('plus')}</button>
      </section>`;
  }
  const sev = log.pain || 0;
  const meds = (log.meds || []).filter((m) => m !== 'none');
  const medText = meds.length
    ? meds.map((id) => MEDS.find((m) => m.id === id)?.short || id).join(' · ')
    : 'Без препаратов';
  return `
    <section class="card flat" style="display:flex;align-items:center;gap:13px">
      <span style="width:42px;height:42px;border-radius:14px;display:grid;place-items:center;background:${sev ? 'var(--coral-soft)' : 'var(--sage-soft)'};color:${sev ? 'var(--coral-deep)' : 'var(--sage-deep)'};font-size:20px;flex-shrink:0">${ICON('migraine')}</span>
      <div style="flex:1;min-width:0">
        <div style="font-size:14px;font-weight:650">${sev ? `Голова болела · ${PAIN.find((p) => p.v === sev)?.label.toLowerCase()}` : 'Голова не болела'}</div>
        <div class="tiny muted" style="margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(medText)}${log.note ? ' · ' + esc(log.note) : ''}</div>
      </div>
      <button class="icon-btn small" data-act="sheet" data-sheet="migraine" data-date="${today}" aria-label="Изменить">${ICON('note')}</button>
    </section>`;
}

function cycleFacts(c) {
  const reg = c.stats.regularity;
  const regLabel = reg === 'regular' ? 'Стабильный' : reg === 'moderate' ? 'Умеренный' : reg === 'irregular' ? 'Неровный' : '—';
  return `
    <section class="card flat">
      <div class="card-head">
        <div class="card-title">${ICON('info')} Ваши параметры</div>
        <span class="card-cap">${c.stats.source === 'history' ? 'по вашим записям' : 'по умолчанию'}</span>
      </div>
      <div class="facts">
        <div class="fact"><b>${c.cycleLength}</b><span>средняя длина цикла</span></div>
        <div class="fact"><b>${c.periodLength}</b><span>дней менструации</span></div>
        <div class="fact"><b>${c.stats.cyclesTracked}</b><span>циклов в истории</span></div>
        <div class="fact"><b>${regLabel}</b><span>характер ритма</span></div>
      </div>
      ${c.stats.cyclesTracked ? `<p class="tiny muted" style="margin-top:12px;line-height:1.5">Прогноз строится по последним ${Math.min(6, c.stats.cyclesTracked)} циклам. Чем больше отметок, тем точнее расчёт.</p>` : ''}
    </section>`;
}

/* ── экран «Цикл» ────────────────────────────────────────── */

function viewCycle() {
  const c = cycleData();
  const { y, m } = ui.cycleMonth;
  const cells = monthMatrix(y, m);
  const firstIso = cells.find(Boolean) || todayISO();
  const lastIso = [...cells].reverse().find(Boolean) || todayISO();
  const map = buildDayMap(c, firstIso, lastIso);
  const today = todayISO();
  const history = cycleHistory(c.periods).slice(0, 5);

  return `
    <div class="view">
      ${header(c)}
      <section class="card">
        <div class="cal-head">
          <div class="cal-month">${fmtMonth(y, m)}</div>
          <div class="cal-nav">
            <button data-act="month" data-cal="cycle" data-dir="-1" aria-label="Предыдущий месяц">${ICON('left')}</button>
            <button data-act="month" data-cal="cycle" data-dir="1" aria-label="Следующий месяц">${ICON('right')}</button>
          </div>
        </div>
        <div class="cal-grid">
          ${WEEK.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
          ${cells.map((iso) => {
            if (!iso) return `<div class="cal-cell cal-empty"></div>`;
            const info = map.get(iso) || {};
            const cls = [
              'cal-day',
              iso === today ? 'today' : '',
              info.period ? 'd-period' : '',
              info.predicted ? 'd-predicted' : '',
              info.overdue ? 'd-overdue' : '',
              info.fertile ? 'd-fertile' : '',
              info.ovulation ? 'd-ovulation' : '',
              state.migraines[iso]?.pain ? 'd-migraine' : '',
            ].filter(Boolean).join(' ');
            return `<div class="cal-cell">
              <button class="${cls}" data-act="day" data-date="${iso}" aria-label="${esc(fmtDate(iso))}">
                ${fromISO(iso).getDate()}
              </button>
            </div>`;
          }).join('')}
        </div>
        <div class="cal-legend">
          <span class="legend-item"><i class="legend-swatch sw-period"></i>Месячные</span>
          <span class="legend-item"><i class="legend-swatch sw-pred"></i>Прогноз</span>
          <span class="legend-item"><i class="legend-swatch sw-fert"></i>Фертильные дни</span>
          <span class="legend-item"><i class="legend-swatch sw-ovu"></i>Овуляция</span>
          <span class="legend-item"><i class="legend-swatch sw-pain"></i>Мигрень</span>
        </div>
      </section>

      ${c.hasData ? phaseCard(c) : ''}

      ${history.length ? `
      <section class="card flat">
        <div class="card-head">
          <div class="card-title">${ICON('note')} История</div>
          <button class="link-btn" data-act="sheet" data-sheet="history">Вся история</button>
        </div>
        <div class="phase-list">
          ${history.slice(0, 3).map((p) => `
            <div class="phase-row">
              <span class="phase-swatch" style="background:var(--coral-soft);color:var(--coral-deep)">${ICON('drop')}</span>
              <div>
                <div class="p-t">${esc(fmtDate(p.start))}${p.end ? ' — ' + esc(fmtDate(p.end)) : ' — идут'}</div>
                <div class="p-s">${p.duration ? `${p.duration} ${daysWord(p.duration)}` : 'не завершены'}${p.length ? ` · цикл ${p.length} ${daysWord(p.length)}` : ''}</div>
              </div>
              <button class="icon-btn small" data-act="sheet" data-sheet="period" data-id="${p.id}" aria-label="Изменить">${ICON('right')}</button>
            </div>`).join('')}
        </div>
      </section>` : ''}
    </div>`;
}

function phaseCard(c) {
  return `
    <section class="card">
      <div class="card-head">
        <div class="card-title">${ICON('cycle')} Фазы цикла</div>
        <span class="card-cap">${c.cycleLength} ${daysWord(c.cycleLength)}</span>
      </div>
      <div class="phase-list">
        ${c.phaseList.map((p) => {
          const isCur = c.hasData && c.day >= p.from && c.day <= p.to;
          return `<div class="phase-row ${isCur ? 'current' : ''}">
            <span class="phase-swatch" style="background:${p.soft};color:${p.deep}">${ICON(p.icon)}</span>
            <div style="min-width:0">
              <div class="p-t">${esc(p.label)}${isCur ? ' · сейчас' : ''}</div>
              <div class="p-s">${esc(p.short)}</div>
            </div>
            <div class="p-when">${p.from}–${p.to}<br>день</div>
          </div>`;
        }).join('')}
      </div>
    </section>`;
}

/* ── экран «Мигрени» ─────────────────────────────────────── */

function viewMigraine() {
  const c = cycleData();
  const { y, m } = ui.migMonth;
  const cells = monthMatrix(y, m);
  const stats = migraineMonthStats(y, m);
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const log = Object.entries(state.migraines)
    .filter(([iso]) => {
      const d = fromISO(iso);
      return d.getMonth() === m && d.getFullYear() === y;
    })
    .sort((a, b) => (a[0] < b[0] ? 1 : -1));

  return `
    <div class="view">
      ${header(c)}
      <section class="card">
        <div class="card-head">
          <div class="card-title">${ICON('migraine')} Дневник мигреней</div>
          <button class="icon-btn small accent" data-act="sheet" data-sheet="migraine" data-date="${todayISO()}" aria-label="Добавить запись">${ICON('plus')}</button>
        </div>
        <div class="hero-mini-row">
          ${miniRing(stats.painDays / daysInMonth, 'var(--coral)')}
          <div>
            <div class="hero-mini-t">${stats.painDays ? `${stats.painDays} ${daysWord(stats.painDays)} с головной болью` : 'Месяц без приступов'}</div>
            <div class="hero-mini-s">${esc(fmtMonth(y, m))} · ${stats.painDays ? `${Math.round((stats.painDays / daysInMonth) * 100)}% дней месяца` : 'ни одной записи о боли'}</div>
          </div>
        </div>
        <div class="stats-3">
          <div class="stat-mini hot"><b>${stats.painDays}</b><span>дней с болью</span></div>
          <div class="stat-mini lav"><b>${stats.eksenzaPuffs}</b><span>${stats.eksenzaPuffs === 1 ? 'пшик' : 'пшика'} Эксензы</span></div>
          <div class="stat-mini sage"><b>${stats.nurofen}</b><span>Нурофен, раз</span></div>
        </div>
        ${stats.eksenzaPuffs ? `<p class="tiny muted" style="margin-top:12px;line-height:1.5">${esc(eksenzaNote(stats))}</p>` : ''}
      </section>

      <section class="card">
        <div class="cal-head">
          <div class="cal-month">${fmtMonth(y, m)}</div>
          <div class="cal-nav">
            <button data-act="month" data-cal="mig" data-dir="-1" aria-label="Предыдущий месяц">${ICON('left')}</button>
            <button data-act="month" data-cal="mig" data-dir="1" aria-label="Следующий месяц">${ICON('right')}</button>
          </div>
        </div>
        <div class="cal-grid">
          ${WEEK.map((d) => `<div class="cal-dow">${d}</div>`).join('')}
          ${cells.map((iso) => {
            if (!iso) return `<div class="cal-cell cal-empty"></div>`;
            const rec = state.migraines[iso];
            const pain = rec?.pain || 0;
            const meds = (rec?.meds || []).filter((x) => x !== 'none');
            const hasEx = meds.some((x) => x.startsWith('eksenza'));
            const hasNur = meds.includes('nurofen');
            const cls = ['cal-day', iso === todayISO() ? 'today' : '', pain ? 'd-migraine' : '', pain ? `pain-${pain}` : ''].filter(Boolean).join(' ');
            return `<div class="cal-cell">
              <button class="${cls}" data-act="sheet" data-sheet="migraine" data-date="${iso}" aria-label="${esc(fmtDate(iso))}">
                ${fromISO(iso).getDate()}
                ${(hasEx || hasNur) ? `<span class="med-dots">${hasEx ? '<i class="md ex"></i>' : ''}${hasNur ? '<i class="md nu"></i>' : ''}</span>` : ''}
              </button>
            </div>`;
          }).join('')}
        </div>
        <div class="cal-legend">
          <span class="legend-item"><i class="legend-swatch" style="background:var(--sage-soft)"></i>Слабая</span>
          <span class="legend-item"><i class="legend-swatch" style="background:var(--sand-soft)"></i>Средняя</span>
          <span class="legend-item"><i class="legend-swatch" style="background:var(--coral-soft)"></i>Сильная</span>
          <span class="legend-item"><i class="legend-swatch" style="background:var(--lav)"></i>Эксенза</span>
          <span class="legend-item"><i class="legend-swatch" style="background:var(--sage)"></i>Нурофен</span>
        </div>
      </section>

      <section class="card flat">
        <div class="card-head">
          <div class="card-title">${ICON('note')} Записи месяца</div>
          <span class="card-cap">${log.length ? `${log.length} ${daysWord(log.length)}` : 'пусто'}</span>
        </div>
        ${log.length ? `<div class="mig-log">${log.map(([iso, rec]) => migraineRow(iso, rec)).join('')}</div>`
          : `<div class="empty">
              <div class="empty-ico">${ICON('migraine')}</div>
              <h3>Пока чисто</h3>
              <p>Нажмите на день в календаре, чтобы отметить боль и препараты.</p>
            </div>`}
      </section>
    </div>`;
}

function migraineRow(iso, rec) {
  const pain = rec.pain || 0;
  const meds = (rec.meds || []).filter((x) => x !== 'none');
  const medText = meds.length
    ? meds.map((id) => MEDS.find((m) => m.id === id)?.short || id).join(' · ')
    : 'без препаратов';
  const sevCls = pain ? `sev-${pain}` : 'sev-0';
  const sevText = pain ? PAIN.find((p) => p.v === pain)?.label : 'Не болела';
  return `<div class="mig-log-item">
    <div class="mig-date"><b>${fromISO(iso).getDate()}</b><span>${WEEK[(fromISO(iso).getDay() + 6) % 7]}</span></div>
    <div class="mig-info">
      <b>${esc(medText)}</b>
      <span>${rec.note ? esc(rec.note) : 'без заметки'}</span>
    </div>
    <span class="mig-sev ${sevCls}">${esc(sevText)}</span>
  </div>`;
}

function migraineMonthStats(y, m) {
  let painDays = 0, eksenzaPuffs = 0, eksenzaDays = 0, nurofen = 0;
  for (const [iso, rec] of Object.entries(state.migraines)) {
    const d = fromISO(iso);
    if (d.getMonth() !== m || d.getFullYear() !== y) continue;
    if (rec.pain) painDays++;
    const meds = rec.meds || [];
    if (meds.includes('eksenza1')) { eksenzaPuffs += 1; eksenzaDays++; }
    if (meds.includes('eksenza2')) { eksenzaPuffs += 2; eksenzaDays++; }
    if (meds.includes('nurofen')) nurofen++;
  }
  return { painDays, eksenzaPuffs, eksenzaDays, nurofen };
}

function eksenzaNote(stats) {
  if (stats.eksenzaPuffs >= 10) {
    return 'Эксенза использовалась часто. Если приступов больше 10 в месяц или препарат нужен чаще 2–3 дней в неделю, обсудите профилактику с неврологом.';
  }
  if (stats.eksenzaDays / 4.3 > 2) {
    return 'Препараты от мигрени нежелательно использовать чаще 2–3 дней в неделю: это может усиливать головную боль.';
  }
  return 'Расход Эксензы под контролем. Продолжайте отмечать приступы — так видна динамика.';
}

/* ── инфо о дне ──────────────────────────────────────────── */

function dayInfo(c, iso) {
  if (!c.hasData) {
    return { phase: 'follicular', predicted: false, overdue: false, fertile: false, ovulation: false, period: false, cycleDay: null };
  }
  const info = buildDayMap(c, iso, iso).get(iso) || {};
  return {
    phase: phaseForDate(c, iso),
    predicted: Boolean(info.predicted),
    overdue: Boolean(info.overdue),
    fertile: Boolean(info.fertile),
    ovulation: Boolean(info.ovulation),
    period: Boolean(info.period),
    cycleDay: diffDays(c.lastStart, iso) + 1,
  };
}

function phaseForDate(c, iso) {
  if (!c.hasData) return 'follicular';
  const len = c.cycleLength;
  const raw = diffDays(c.lastStart, iso) + 1;
  if (raw >= 1 && raw <= len) {
    return c.phases.find((p) => raw >= p.from && raw <= p.to)?.key || 'luteal';
  }
  // дни за пределами обычной длины текущего цикла: до сегодня — затянувшаяся лютеиновая,
  // дальше — цикл повторяется по прогнозу
  if (raw > len && iso <= c.today) return 'luteal';
  const idx = ((raw - 1) % len) + 1;
  return c.phases.find((p) => idx >= p.from && idx <= p.to)?.key || 'luteal';
}

/* ── рендер ──────────────────────────────────────────────── */

function render() {
  const view = $('#view');
  if (!view) return;
  let html = '';
  if (ui.route === 'cycle') html = viewCycle();
  else if (ui.route === 'migraine') html = viewMigraine();
  else html = viewToday();
  view.innerHTML = html;

  $$('.tab').forEach((t) => {
    if (t.dataset.tab === ui.route) t.setAttribute('aria-current', 'page');
    else t.removeAttribute('aria-current');
  });
  document.title = ui.route === 'migraine' ? 'Мигрени — Вика'
    : ui.route === 'cycle' ? 'Цикл — Вика'
    : 'Вика — цикл и мигрени';

  if (ui.sheet) renderSheet();
}

/* ── шторка ──────────────────────────────────────────────── */

function openSheet(type, data = {}) {
  ui.sheet = { type, ...data };
  ui.draft = null;
  ui.pinBuffer = '';
  ui.pinError = '';
  if (type !== 'pin') {
    ui.pinIntent = null;
    ui.pinStage = null;
  }
  const layer = $('#sheet-layer');
  layer.classList.add('open');
  layer.setAttribute('aria-hidden', 'false');
  document.body.classList.add('sheet-open');
  renderSheet();
}

function closeSheet() {
  ui.sheet = null;
  ui.draft = null;
  ui.pinBuffer = '';
  ui.pinIntent = null;
  const layer = $('#sheet-layer');
  layer.classList.remove('open');
  layer.setAttribute('aria-hidden', 'true');
  document.body.classList.remove('sheet-open');
}

function renderSheet() {
  if (!ui.sheet) return;
  const layer = $('#sheet-layer');
  const out = sheetContent();
  if (!out) return;
  layer.querySelector('.sheet-kicker').textContent = out.kicker || '';
  layer.querySelector('.sheet-title').textContent = out.title || '';
  layer.querySelector('.sheet-sub').textContent = out.sub || '';
  const body = layer.querySelector('.sheet-body');
  body.innerHTML = out.body;
  if (out.after) out.after();
}

function sheetContent() {
  switch (ui.sheet.type) {
    case 'period': return sheetPeriod();
    case 'day': return sheetDay();
    case 'migraine': return sheetMigraine();
    case 'settings': return sheetSettings();
    case 'history': return sheetHistory();
    case 'tips': return sheetTips();
    case 'install': return sheetInstall();
    case 'pin': return sheetPin();
    default: return null;
  }
}

/* ── шторка: месячные ────────────────────────────────────── */

function sheetPeriod() {
  const c = cycleData();
  const today = todayISO();
  const id = ui.sheet.id;
  const existing = id
    ? state.periods.find((x) => x.id === id)
    : c.periods.find((x) => {
        const end = x.end || addDays(x.start, c.periodLength - 1);
        return today >= x.start && today <= end;
      }) || activeInState();

  if (!ui.draft) {
    ui.draft = {
      start: existing?.start || today,
      end: existing?.end || '',
      ongoing: existing ? !existing.end : true,
      flow: state.days[existing?.start || today]?.flow || '',
      symptoms: [...(state.days[existing?.start || today]?.symptoms || [])],
      note: state.days[existing?.start || today]?.note || '',
    };
  }
  const d = ui.draft;
  const isNew = !existing;

  return {
    kicker: isNew ? 'Новая запись' : 'Менструация',
    title: isNew ? 'Начало месячных' : 'Детали месячных',
    sub: isNew ? 'Дата и самочувствие — остальное посчитается' : 'Можно поправить даты и симптомы',
    body: `
      <div class="field">
        <div class="field-label">Первый день</div>
        <input class="input" type="date" max="${today}" value="${esc(d.start)}" data-draft="start">
      </div>
      <div class="field">
        <div class="field-label">Последний день <span>${d.ongoing ? 'ещё идут' : ''}</span></div>
        <div class="seg two">
          <button class="${d.ongoing ? 'on' : ''}" data-act="ongoing" data-v="1">Ещё идут</button>
          <button class="${!d.ongoing ? 'on' : ''}" data-act="ongoing" data-v="0">Закончились</button>
        </div>
        ${!d.ongoing ? `<input class="input" type="date" min="${esc(d.start)}" max="${today}" value="${esc(d.end || today)}" data-draft="end" style="margin-top:8px">` : ''}
      </div>
      <div class="field">
        <div class="field-label">Выделения <span>для первого дня</span></div>
        <div class="chips">
          ${FLOWS.map((f) => `<button class="chip ${d.flow === f.v ? 'on coral' : ''}" data-act="flow" data-v="${f.v}">${f.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Симптомы <span>можно несколько</span></div>
        <div class="chips">
          ${SYMPTOMS.map((s) => `<button class="chip ${d.symptoms.includes(s) ? 'on' : ''}" data-act="sym" data-v="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Заметка <span>необязательно</span></div>
        <textarea class="textarea" data-draft="note" placeholder="Например: сильная боль в первый день, помогла грелка">${esc(d.note)}</textarea>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-primary coral" data-act="save-period">Сохранить</button>
        ${existing ? `<button class="btn btn-danger" data-act="delete-period" data-id="${existing.id}" aria-label="Удалить запись">${ICON('trash')}</button>` : ''}
      </div>
      <p class="note-line">${ICON('info')} Средняя длина цикла и менструации пересчитываются по вашим записям автоматически.</p>
    `,
  };
}

/* ── шторка: день цикла ──────────────────────────────────── */

function sheetDay() {
  const c = cycleData();
  const iso = ui.sheet.date || todayISO();
  const info = dayInfo(c, iso);
  const future = iso > todayISO();
  const covering = c.periods.find((p) => {
    const end = p.end || addDays(p.start, c.periodLength - 1);
    return iso >= p.start && iso <= end;
  });
  const openPeriod = activeInState();

  if (!ui.draft) {
    const log = state.days[iso] || {};
    ui.draft = {
      flow: log.flow || '',
      symptoms: [...(log.symptoms || [])],
      note: log.note || '',
    };
  }
  const d = ui.draft;

  const chips = [];
  if (info.period) chips.push(`<span class="chip on coral">${ICON('drop')} Месячные</span>`);
  if (info.overdue) chips.push(`<span class="chip" style="border-color:rgba(217,118,95,.35);color:var(--coral-deep)">Ожидались месячные</span>`);
  if (info.predicted) chips.push(`<span class="chip">Прогноз месячных</span>`);
  if (info.fertile) chips.push(`<span class="chip on lav">${ICON('spark')} Фертильный день</span>`);
  if (info.ovulation) chips.push(`<span class="chip on lav">Овуляция</span>`);
  if (state.migraines[iso]?.pain) chips.push(`<span class="chip on">${ICON('migraine')} Мигрень</span>`);

  return {
    kicker: `${PHASE_LABEL[info.phase]}${info.cycleDay > 0 ? ` · ${info.cycleDay}-й день` : ''}`,
    title: fmtDate(iso, { cap: true }),
    sub: relDay(iso),
    body: `
      ${chips.length ? `<div class="chips" style="margin-top:6px">${chips.join('')}</div>` : ''}
      ${!info.period && !future ? `
        <div class="field">
          <div class="field-label">Месячные</div>
          <div class="actions">
            <button class="action coral" data-act="start-here" data-date="${iso}">
              <span class="a-ico">${ICON('drop')}</span>
              <span><span class="a-t">Начать здесь</span><span class="a-s">первый день</span></span>
            </button>
            <button class="action sage" data-act="end-here" data-date="${iso}" ${openPeriod ? '' : 'disabled style="opacity:.45"'}>
              <span class="a-ico">${ICON('check')}</span>
              <span><span class="a-t">Закончить здесь</span><span class="a-s">последний день</span></span>
            </button>
          </div>
        </div>` : ''}
      ${info.period && covering ? `
        <div class="field">
          <div class="day-summary">
            <div class="day-summary-row"><span>Запись</span><b>${esc(fmtDate(covering.start))}${covering.end ? ' — ' + esc(fmtDate(covering.end)) : ' — идут'}</b></div>
            ${covering.end ? `<div class="day-summary-row"><span>Длительность</span><b>${diffDays(covering.start, covering.end) + 1} ${daysWord(diffDays(covering.start, covering.end) + 1)}</b></div>` : ''}
          </div>
          <button class="btn btn-ghost btn-block" style="margin-top:10px;border:1.4px solid var(--line-strong)" data-act="sheet" data-sheet="period" data-id="${covering.id}">Изменить запись</button>
        </div>` : ''}
      ${!future ? `
      <div class="field">
        <div class="field-label">Выделения</div>
        <div class="chips">
          ${FLOWS.map((f) => `<button class="chip ${d.flow === f.v ? 'on coral' : ''}" data-act="flow" data-v="${f.v}">${f.label}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Симптомы</div>
        <div class="chips">
          ${SYMPTOMS.map((s) => `<button class="chip ${d.symptoms.includes(s) ? 'on' : ''}" data-act="sym" data-v="${esc(s)}">${esc(s)}</button>`).join('')}
        </div>
      </div>
      <div class="field">
        <div class="field-label">Заметка</div>
        <textarea class="textarea" data-draft="note" placeholder="Коротко о дне">${esc(d.note)}</textarea>
      </div>
      <div class="sheet-actions">
        <button class="btn btn-primary" data-act="save-day" data-date="${iso}">Сохранить день</button>
      </div>` : `<p class="note-line" style="margin-top:18px">${ICON('info')} Будущие дни рассчитываются автоматически. Отметить их можно, когда они наступят.</p>`}
      <button class="btn btn-ghost btn-block" style="margin-top:10px" data-act="sheet" data-sheet="migraine" data-date="${iso}">
        ${ICON('migraine')} Головная боль в этот день
      </button>
    `,
  };
}

/* ── шторка: мигрень ─────────────────────────────────────── */

function sheetMigraine() {
  const iso = ui.sheet.date || todayISO();
  const rec = state.migraines[iso];

  if (!ui.draft) {
    ui.draft = {
      pain: rec?.pain || 0,
      touched: Boolean(rec),
      meds: [...(rec?.meds || [])],
      note: rec?.note || '',
    };
  }
  const d = ui.draft;

  return {
    kicker: 'Дневник мигреней',
    title: fmtDate(iso, { cap: true }),
    sub: relDay(iso),
    body: `
      <div class="field">
        <div class="field-label">Была ли головная боль</div>
        <div class="seg two">
          <button class="${d.touched && d.pain === 0 ? 'on' : ''}" data-act="pain" data-v="0">Не болела</button>
          <button class="${d.pain > 0 ? 'on danger' : ''}" data-act="pain" data-v="1">Болела</button>
        </div>
      </div>

      ${d.pain > 0 ? `
      <div class="field">
        <div class="field-label">Интенсивность</div>
        <div class="seg">
          ${PAIN.map((p) => `<button class="${d.pain === p.v ? 'on danger' : ''}" data-act="pain" data-v="${p.v}">${p.label}</button>`).join('')}
        </div>
      </div>` : ''}

      <div class="field">
        <div class="field-label">Препараты <span>можно несколько</span></div>
        <div class="med-row">
          ${MEDS.map((m) => `<button class="med ${d.meds.includes(m.id) ? 'on' : ''} ${m.kind === 'none' ? 'plain' : ''}" data-act="med" data-v="${m.id}">
            ${ICON(m.kind === 'nurofen' ? 'pill' : m.kind === 'eksenza' ? 'drop' : 'check')} ${esc(m.label)}
          </button>`).join('')}
        </div>
      </div>

      <div class="field">
        <div class="field-label">Заметка <span>триггер или наблюдение</span></div>
        <textarea class="textarea" data-draft="note" placeholder="Например: недосып, погода, стресс">${esc(d.note)}</textarea>
        <div class="quick-tags">
          ${QUICK_TAGS.map((t) => `<button data-act="tag" data-v="${esc(t)}">+ ${esc(t)}</button>`).join('')}
        </div>
      </div>

      <div class="sheet-actions">
        <button class="btn btn-primary" data-act="save-migraine" data-date="${iso}">Сохранить</button>
        ${rec ? `<button class="btn btn-danger" data-act="delete-migraine" data-date="${iso}" aria-label="Удалить запись">${ICON('trash')}</button>` : ''}
      </div>
      <p class="note-line">${ICON('info')} Если приступов больше 10 в месяц или Эксенза нужна чаще 2–3 дней в неделю — обсудите с неврологом профилактическое лечение.</p>
    `,
  };
}

/* ── шторка: настройки ───────────────────────────────────── */

function sheetSettings() {
  const p = state.profile;
  const s = sync.state;
  const pinOn = hasPin();

  let syncBlock = '';
  if (!s.configured) {
    syncBlock = `
      <div class="settings-group">
        <div class="setting-row">
          <div>
            <div class="s-t">Локальный режим</div>
            <div class="s-s">Данные только на этом устройстве. Чтобы включить облако, вставьте конфиг Firebase в js/firebase.js — инструкция в README.md.</div>
          </div>
          <span class="status-line" style="margin:0"><i class="dot off"></i></span>
        </div>
      </div>`;
  } else if (s.user) {
    syncBlock = `
      <div class="settings-group">
        <div class="setting-row">
          <div>
            <div class="s-t">Облако подключено</div>
            <div class="s-s">${esc(s.user.email || 'аккаунт Вики')}</div>
          </div>
          <span class="status-line" style="margin:0"><i class="dot"></i>синхронно</span>
        </div>
        <div class="setting-row">
          <div><div class="s-t">Загрузить из облака</div><div class="s-s">Объединить с данными на устройстве</div></div>
          <button class="icon-btn small" data-act="sync-pull" aria-label="Загрузить">${ICON('refresh')}</button>
        </div>
        <div class="setting-row">
          <div><div class="s-t">Выйти из аккаунта</div><div class="s-s">Локальные данные останутся</div></div>
          <button class="icon-btn small" data-act="sync-logout" aria-label="Выйти">${ICON('arrow')}</button>
        </div>
      </div>`;
  } else {
    syncBlock = `
      <div class="settings-group">
        <div class="setting-row" style="display:block">
          <div class="s-t" style="margin-bottom:6px">Вход в облако</div>
          <div class="s-s" style="margin-bottom:10px">Один аккаунт Firebase — только для вас. Создаётся в консоли за минуту.</div>
          <input class="input" type="email" inputmode="email" autocomplete="username" placeholder="e-mail" data-sync="email" style="max-width:none;text-align:left;margin-bottom:8px">
          <input class="input" type="password" autocomplete="current-password" placeholder="пароль" data-sync="password" style="max-width:none;text-align:left">
          <button class="btn btn-primary btn-block" style="margin-top:10px" data-act="sync-login" ${s.busy ? 'disabled' : ''}>${s.busy ? 'Вхожу…' : 'Войти'}</button>
          ${s.error ? `<p class="tiny" style="color:var(--coral-deep);margin-top:8px">${esc(s.error)}</p>` : ''}
        </div>
      </div>`;
  }

  return {
    kicker: 'Настройки',
    title: 'Личные параметры',
    sub: 'Всё можно изменить в любой момент',
    body: `
      <div class="settings-sec">
        <p class="eyebrow" style="margin:0 0 8px 4px">Профиль</p>
        <div class="settings-group">
          <div class="setting-row">
            <div><div class="s-t">Имя</div></div>
            <input class="input" type="text" value="${esc(p.name)}" data-set="name" maxlength="24" style="max-width:150px">
          </div>
          <div class="setting-row">
            <div><div class="s-t">Длина цикла</div><div class="s-s">Запасное значение, пока мало записей</div></div>
            <input class="input" type="number" min="15" max="60" value="${p.cycleLength}" data-set="cycleLength" inputmode="numeric">
          </div>
          <div class="setting-row">
            <div><div class="s-t">Дней менструации</div><div class="s-s">Тоже запасное значение</div></div>
            <input class="input" type="number" min="1" max="12" value="${p.periodLength}" data-set="periodLength" inputmode="numeric">
          </div>
          <div class="setting-row">
            <div><div class="s-t">Советы на сегодня</div><div class="s-s">Показывать рекомендации по фазе</div></div>
            <button class="toggle ${p.tipsEnabled ? 'on' : ''}" data-act="toggle-tips" aria-label="Показывать советы" aria-pressed="${p.tipsEnabled}"></button>
          </div>
          <div class="setting-row">
            <div><div class="s-t">Библиотека советов</div><div class="s-s">${TIP_COUNTS.menstrual + TIP_COUNTS.follicular + TIP_COUNTS.ovulation + TIP_COUNTS.luteal} рекомендаций по фазам</div></div>
            <button class="icon-btn small" data-act="sheet" data-sheet="tips" aria-label="Открыть">${ICON('arrow')}</button>
          </div>
        </div>
      </div>

      <div class="settings-sec">
        <p class="eyebrow" style="margin:0 0 8px 4px">Приватность</p>
        <div class="settings-group">
          <div class="setting-row">
            <div><div class="s-t">PIN-код</div><div class="s-s">Защита при открытии приложения</div></div>
            <button class="toggle ${pinOn ? 'on' : ''}" data-act="toggle-pin" aria-label="PIN-код" aria-pressed="${pinOn}"></button>
          </div>
          ${pinOn ? `
          <div class="setting-row">
            <div><div class="s-t">Автоблокировка</div><div class="s-s">Через сколько минут бездействия</div></div>
            <select class="input" data-set="lockTimeout" style="max-width:130px;text-align:center">
              <option value="0" ${p.lockTimeout === 0 ? 'selected' : ''}>При запуске</option>
              <option value="1" ${p.lockTimeout === 1 ? 'selected' : ''}>1 мин</option>
              <option value="5" ${p.lockTimeout === 5 ? 'selected' : ''}>5 мин</option>
              <option value="15" ${p.lockTimeout === 15 ? 'selected' : ''}>15 мин</option>
            </select>
          </div>
          <div class="setting-row">
            <div><div class="s-t">Изменить PIN</div></div>
            <button class="link-btn" data-act="change-pin">Сменить</button>
          </div>` : ''}
        </div>
        <p class="tiny muted" style="margin:10px 4px 0;line-height:1.5">PIN хранится как хеш только на этом устройстве и не отправляется в Firebase.</p>
      </div>

      <div class="settings-sec">
        <p class="eyebrow" style="margin:0 0 8px 4px">Синхронизация</p>
        ${syncBlock}
      </div>

      <div class="settings-sec">
        <p class="eyebrow" style="margin:0 0 8px 4px">Данные</p>
        <div class="settings-group">
          <div class="setting-row">
            <div><div class="s-t">Экспорт</div><div class="s-s">Файл JSON со всей историей</div></div>
            <button class="icon-btn small" data-act="export" aria-label="Экспорт">${ICON('download')}</button>
          </div>
          <div class="setting-row">
            <div><div class="s-t">Импорт</div><div class="s-s">Восстановить из файла</div></div>
            <label class="icon-btn small" style="cursor:pointer" aria-label="Импорт">
              ${ICON('upload')}
              <input type="file" accept="application/json,.json" data-import hidden>
            </label>
          </div>
          <div class="setting-row">
            <div><div class="s-t">Установить приложение</div><div class="s-s">Добавить на экран «Домой»</div></div>
            <button class="icon-btn small" data-act="install" aria-label="Установить">${ICON('plus')}</button>
          </div>
          <div class="setting-row">
            <div><div class="s-t" style="color:var(--coral-deep)">Очистить всё</div><div class="s-s">Удалить историю с этого устройства</div></div>
            <button class="icon-btn small" data-act="reset" aria-label="Очистить">${ICON('trash')}</button>
          </div>
        </div>
      </div>

      <p class="legal">
        <b>Вика</b> — личный дневник. Приложение не ставит диагнозы и не заменяет консультацию врача.<br>
        Прогнозы рассчитываются по вашим записям и могут смещаться. Для контрацепции используйте надёжный метод.
      </p>
    `,
  };
}

/* ── шторка: PIN ─────────────────────────────────────────── */

function sheetPin() {
  const intent = ui.pinIntent;
  const stage = ui.pinStage; // 'verify' | 'new'
  const title = intent === 'off'
    ? 'Отключить PIN'
    : stage === 'new'
      ? 'Новый PIN'
      : intent === 'change'
        ? 'Текущий PIN'
        : 'PIN-код';
  const sub = intent === 'off' || stage === 'verify'
    ? 'Введите текущий PIN'
    : 'Четыре цифры, которые легко вспомнить';

  return {
    kicker: 'Приватность',
    title,
    sub,
    body: `
      <div class="pin-dots" id="sheet-pin-dots" style="margin:18px 0 16px">
        ${[0, 1, 2, 3].map((i) => `<span class="${i < ui.pinBuffer.length ? 'on' : ''}"></span>`).join('')}
      </div>
      <div class="keypad" id="sheet-keypad">
        ${[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => `<button data-pin="${n}">${n}</button>`).join('')}
        <button class="key-blank" disabled></button>
        <button data-pin="0">0</button>
        <button data-pin="del" aria-label="Удалить">${ICON('close')}</button>
      </div>
      <p class="lock-error" id="sheet-pin-error" style="text-align:center;margin-top:14px">${esc(ui.pinError)}</p>
      <div class="sheet-actions">
        <button class="btn btn-ghost" data-act="close">Отмена</button>
      </div>
    `,
  };
}

/* ── шторка: история ─────────────────────────────────────── */

function sheetHistory() {
  const c = cycleData();
  const list = cycleHistory(c.periods);
  return {
    kicker: 'История',
    title: 'Все записи',
    sub: list.length ? `${list.length} ${daysWord(list.length)} с месячными` : 'Пока пусто',
    body: list.length ? `<div class="mig-log">${list.map((p) => `
      <div class="mig-log-item">
        <div class="mig-date"><b>${fromISO(p.start).getDate()}</b><span>${WEEK[(fromISO(p.start).getDay() + 6) % 7]}</span></div>
        <div class="mig-info">
          <b>${esc(fmtDate(p.start))}${p.end ? ' — ' + esc(fmtDate(p.end)) : ' — идут'}</b>
          <span>${p.duration ? `${p.duration} ${daysWord(p.duration)}` : 'не завершены'}${p.length ? ` · цикл ${p.length} ${daysWord(p.length)}` : ''}${p.note ? ' · ' + esc(p.note) : ''}</span>
        </div>
        <button class="icon-btn small" data-act="sheet" data-sheet="period" data-id="${p.id}" aria-label="Изменить">${ICON('note')}</button>
      </div>`).join('')}</div>`
      : `<div class="empty"><div class="empty-ico">${ICON('cycle')}</div><h3>Пока нет записей</h3><p>Отметьте начало месячных — история начнёт собираться.</p></div>`,
  };
}

/* ── шторка: библиотека советов ──────────────────────────── */

function sheetTips() {
  const c = cycleData();
  const phase = ui.tipsPhase || (c.hasData ? c.phase : 'follicular');
  ui.tipsPhase = phase;
  const cats = CATEGORIES[phase] || [];
  const list = tipsByPhase(phase, ui.tipsCat);
  const ph = PHASES[phase];

  return {
    kicker: 'Библиотека',
    title: 'Рекомендации',
    sub: `${TIP_COUNTS[phase]} советов для этой фазы`,
    body: `
      <div class="tips-tabs" style="margin-top:6px">
        ${PHASE_ORDER.map((k) => `<button class="${phase === k ? 'on' : ''}" data-act="tips-phase" data-v="${k}">${esc(PHASE_LABEL[k])}</button>`).join('')}
      </div>
      <div class="tips-tabs" style="margin-top:8px">
        <button class="${ui.tipsCat === 'all' ? 'on' : ''}" data-act="tips-cat" data-v="all">Все</button>
        ${cats.map((cat) => `<button class="${ui.tipsCat === cat ? 'on' : ''}" data-act="tips-cat" data-v="${esc(cat)}">${esc(cat)}</button>`).join('')}
      </div>
      <p class="tiny muted" style="margin:14px 2px 0;line-height:1.5">${esc(ph.short)}</p>
      <div class="tip-list">
        ${list.map((t) => `<div class="tip-item"><h4>${esc(t.title)}</h4><p>${esc(t.text)}</p></div>`).join('')}
      </div>
      <p class="note-line">${ICON('info')} Рекомендации носят общий информационный характер и не заменяют назначения врача.</p>
    `,
  };
}

/* ── шторка: установка ───────────────────────────────────── */

function sheetInstall() {
  const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const steps = isIOS ? [
    ['Откройте в Safari', 'Chrome на iOS не умеет добавлять PWA на экран «Домой»'],
    ['Нажмите «Поделиться»', 'Квадрат со стрелкой вверх внизу экрана'],
    ['Выберите «На экран Домой»', 'Прокрутите список действий'],
    ['Нажмите «Добавить»', 'Иконка появится на рабочем столе'],
  ] : [
    ['Откройте в Chrome', 'Меню из трёх точек справа сверху'],
    ['«Установить приложение»', 'Или «Добавить на главный экран»'],
    ['Подтвердите', 'Иконка появится среди приложений'],
  ];
  return {
    kicker: 'Установка',
    title: 'На экран «Домой»',
    sub: 'Работает офлайн и без браузерной панели',
    body: `
      <div class="settings-group" style="margin-top:8px">
        ${steps.map(([t, s]) => `<div class="setting-row"><div><div class="s-t">${esc(t)}</div><div class="s-s">${esc(s)}</div></div></div>`).join('')}
      </div>
      <p class="note-line">${ICON('info')} Открывайте приложение с иконки — тогда оно запускается в полноэкранном режиме и работает офлайн.</p>
      <p class="note-line">${ICON('lock')} Ваши данные не покидают устройство, пока вы сами не подключите Firebase.</p>
    `,
  };
}

/* ── действия с данными ──────────────────────────────────── */

function activeInState() {
  const today = todayISO();
  const past = state.periods.filter((p) => p.start <= today);
  const last = past[past.length - 1];
  return last && !last.end ? last : null;
}

function startToday() {
  const c = cycleData();
  if (c.activePeriod) {
    toast('Месячные уже отмечены. Завершите их кнопкой «Закончились».');
    return;
  }
  const today = todayISO();
  const existing = state.periods.find((p) => p.start === today);
  if (existing) {
    existing.end = null;
  } else {
    state.periods.push({ id: 'p_' + today, start: today, end: null, note: '' });
    state.periods.sort((a, b) => (a.start < b.start ? -1 : 1));
  }
  const day = state.days[today] || {};
  state.days[today] = { ...day, flow: day.flow || 'medium' };
  persist();
  toast(`Отмечено: первый день, ${fmtDate(today)}`);
}

function endToday() {
  const active = activeInState();
  if (!active) { toast('Нет активной записи месячных.'); return; }
  const today = todayISO();
  if (today < active.start) { toast('Дата окончания раньше начала.'); return; }
  active.end = today;
  persist();
  const dur = diffDays(active.start, active.end) + 1;
  toast(`Записано: ${dur} ${daysWord(dur)} менструации`);
}

function startPeriodAt(iso) {
  if (iso > todayISO()) { toast('Будущие дни отметить нельзя.'); return; }
  const c = cycleData();
  if (c.periods.some((p) => {
    const end = p.end || addDays(p.start, c.periodLength - 1);
    return iso >= p.start && iso <= end;
  })) { toast('В этот день уже отмечены месячные.'); return; }

  const active = activeInState();
  if (active && iso > active.start) {
    // новая менструация: закрываем предыдущую запись днём раньше и создаём новую
    const prevEnd = addDays(iso, -1);
    if (prevEnd >= active.start) active.end = prevEnd;
    state.periods.push({ id: 'p_' + iso + '_' + Math.random().toString(36).slice(2, 6), start: iso, end: null, note: '' });
  } else if (active) {
    active.start = iso;
  } else {
    state.periods.push({ id: 'p_' + iso + '_' + Math.random().toString(36).slice(2, 6), start: iso, end: null, note: '' });
  }
  state.periods.sort((a, b) => (a.start < b.start ? -1 : 1));
  persist();
  closeSheet();
  toast(`Начало месячных: ${fmtDate(iso)}`);
}

function endPeriodAt(iso) {
  const open = [...state.periods].reverse().find((p) => !p.end && p.start <= iso);
  if (!open) { toast('Нечего завершать в этот день.'); return; }
  open.end = iso;
  persist();
  closeSheet();
  toast(`Окончание: ${fmtDate(iso)}`);
}

function savePeriodFromDraft() {
  const d = ui.draft;
  if (!d) return;
  const start = ISO_RE.test(d.start) ? d.start : todayISO();
  let end = d.ongoing ? null : (ISO_RE.test(d.end) ? d.end : '');
  if (end && end < start) end = start;
  if (end && end > todayISO()) { toast('Дата окончания в будущем.'); return; }

  const existing = ui.sheet.id
    ? state.periods.find((p) => p.id === ui.sheet.id)
    : state.periods.find((p) => p.start === start) || activeInState();
  if (existing) {
    existing.start = start;
    existing.end = end || null;
  } else {
    state.periods.push({
      id: 'p_' + start + '_' + Math.random().toString(36).slice(2, 6),
      start, end: end || null, note: '',
    });
  }
  state.periods.sort((a, b) => (a.start < b.start ? -1 : 1));

  const log = state.days[start] || {};
  state.days[start] = {
    ...log,
    flow: d.flow || log.flow || '',
    symptoms: d.symptoms || [],
    note: d.note || '',
  };

  persist();
  closeSheet();
  toast('Сохранено');
}

function saveDayFromDraft(iso) {
  const d = ui.draft;
  if (!d || !ISO_RE.test(iso)) return;
  const log = state.days[iso] || {};
  state.days[iso] = {
    ...log,
    flow: d.flow || '',
    symptoms: d.symptoms || [],
    note: d.note || '',
  };
  persist();
  closeSheet();
  toast('День сохранён');
}

function saveMigraineFromDraft(iso) {
  const d = ui.draft;
  if (!d || !ISO_RE.test(iso)) return;
  const meds = d.meds.filter((m) => m !== 'none');
  const hasContent = d.pain > 0 || meds.length || d.note.trim() || d.touched;
  if (!hasContent) {
    delete state.migraines[iso];
    persist();
    closeSheet();
    return;
  }
  state.migraines[iso] = {
    pain: d.pain || 0,
    meds,
    note: d.note.trim(),
  };
  persist();
  closeSheet();
  toast(d.pain ? 'Запись сохранена' : 'Отмечено: голова не болела');
}

/* ── облако ──────────────────────────────────────────────── */

async function doLogin() {
  const email = $('[data-sync="email"]')?.value || '';
  const pass = $('[data-sync="password"]')?.value || '';
  if (!email || !pass) { toast('Введите e-mail и пароль'); return; }
  try {
    await sync.signIn(email, pass);
    const remote = await sync.pull();
    if (remote) {
      state = mergeStates(state, remote);
      saveState(state);
      toast('Данные синхронизированы');
    } else {
      await sync.push(state);
      toast('Облако подключено');
    }
    render();
    renderSheet();
  } catch (err) {
    toast(err.message);
    renderSheet();
  }
}

async function doPull() {
  const remote = await sync.pull();
  if (!remote) { toast('В облаке пока нет данных'); return; }
  state = mergeStates(state, remote);
  saveState(state);
  render();
  renderSheet();
  toast('Загружено из облака');
}

/* ── экспорт / импорт / сброс ────────────────────────────── */

function downloadExport() {
  const blob = new Blob([exportJSON(state)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `vika-cycle-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  toast('Файл сохранён');
}

async function handleImport(file) {
  try {
    const text = await file.text();
    const imported = importJSON(text);
    if (!confirm('Заменить текущие данные импортированными?')) return;
    state = imported;
    persist();
    closeSheet();
    toast('Данные восстановлены');
  } catch {
    toast('Не удалось прочитать файл');
  }
}

function resetAll() {
  if (!confirm('Удалить всю историю на этом устройстве? Это нельзя отменить.')) return;
  clearState();
  clearPin();
  lockSession();
  state = loadState();
  closeSheet();
  render();
  toast('Данные удалены');
}

/* ── установка ───────────────────────────────────────────── */

async function installApp() {
  if (ui.installPrompt) {
    ui.installPrompt.prompt();
    try {
      const res = await ui.installPrompt.userChoice;
      if (res.outcome === 'accepted') toast('Устанавливаем…');
    } catch {}
    ui.installPrompt = null;
    return;
  }
  openSheet('install');
}

/* ── PIN-логика ──────────────────────────────────────────── */

function pinKey(key) {
  if (key === 'del') ui.pinBuffer = ui.pinBuffer.slice(0, -1);
  else if (/^\d$/.test(key) && ui.pinBuffer.length < 4) ui.pinBuffer += key;
  ui.pinError = '';

  const inSheet = ui.sheet?.type === 'pin';
  $$(inSheet ? '#sheet-pin-dots span' : '#pin-dots span').forEach((s, i) => s.classList.toggle('on', i < ui.pinBuffer.length));
  const err = $(inSheet ? '#sheet-pin-error' : '#lock-error');
  if (err) err.textContent = ui.pinError;

  if (ui.pinBuffer.length === 4) setTimeout(completePin, 120);
}

async function completePin() {
  const pin = ui.pinBuffer;
  ui.pinBuffer = '';

  if (ui.sheet?.type === 'pin') {
    if (ui.pinIntent === 'off') {
      if (await verifyPin(pin)) {
        clearPin();
        lockSession();
        ui.pinIntent = null;
        ui.pinError = '';
        closeSheet();
        toast('PIN отключён');
        render();
      } else {
        ui.pinError = 'Неверный PIN';
        renderSheet();
      }
      return;
    }

    // Смена PIN: сначала проверяем текущий, затем просим новый
    if (ui.pinIntent === 'change' && ui.pinStage === 'verify') {
      if (!(await verifyPin(pin))) {
        ui.pinError = 'Неверный текущий PIN';
        renderSheet();
        return;
      }
      ui.pinStage = 'new';
      ui.pinError = '';
      renderSheet();
      return;
    }

    await setPin(pin);
    markUnlocked(state.profile.lockTimeout);
    ui.pinIntent = null;
    ui.pinStage = null;
    ui.pinError = '';
    closeSheet();
    toast('PIN установлен');
    render();
    return;
  }

  // экран блокировки
  if (await verifyPin(pin)) {
    markUnlocked(state.profile.lockTimeout);
    $('#lock').hidden = true;
    ui.pinError = '';
    render();
  } else {
    ui.pinError = 'Неверный PIN';
    $$('#pin-dots span').forEach((s) => s.classList.remove('on'));
    const err = $('#lock-error');
    if (err) err.textContent = ui.pinError;
    const lock = $('#lock');
    lock.classList.add('shake');
    setTimeout(() => lock.classList.remove('shake'), 420);
  }
}

function showLock() {
  const lock = $('#lock');
  lock.hidden = false;
  $('#lock-name').textContent = state.profile.name || 'Вика';
  $$('#pin-dots span').forEach((s) => s.classList.remove('on'));
  $('#lock-error').textContent = '';
}

/* ── события ─────────────────────────────────────────────── */

function onClick(e) {
  const tab = e.target.closest('.tab');
  if (tab) {
    setRoute(tab.dataset.tab);
    return;
  }
  if (e.target.closest('[data-sheet-close]')) { closeSheet(); return; }

  const pinBtn = e.target.closest('[data-pin]');
  if (pinBtn) { pinKey(pinBtn.dataset.pin); return; }

  const keyBtn = e.target.closest('#keypad [data-key]');
  if (keyBtn) { pinKey(keyBtn.dataset.key); return; }

  const el = e.target.closest('[data-act]');
  if (!el) return;
  const act = el.dataset.act;

  switch (act) {
    case 'sheet':
      openSheet(el.dataset.sheet, { date: el.dataset.date, id: el.dataset.id });
      break;
    case 'close':
      closeSheet();
      break;
    case 'go':
      setRoute(el.dataset.route);
      break;
    case 'tip-next':
      ui.tipOffset = (ui.tipOffset + 1) % 3;
      render();
      break;
    case 'start-today':
      startToday();
      break;
    case 'end-today':
      endToday();
      break;
    case 'month': {
      const dir = Number(el.dataset.dir);
      const target = el.dataset.cal === 'cycle' ? ui.cycleMonth : ui.migMonth;
      let m = target.m + dir;
      let y = target.y;
      if (m < 0) { m = 11; y--; }
      if (m > 11) { m = 0; y++; }
      if (el.dataset.cal === 'cycle') ui.cycleMonth = { y, m };
      else ui.migMonth = { y, m };
      render();
      break;
    }
    case 'day':
      openSheet('day', { date: el.dataset.date });
      break;
    case 'start-here':
      startPeriodAt(el.dataset.date);
      break;
    case 'end-here':
      endPeriodAt(el.dataset.date);
      break;
    case 'ongoing':
      if (ui.draft) {
        const on = el.dataset.v === '1';
        ui.draft.ongoing = on;
        if (!on && !ui.draft.end) ui.draft.end = ui.draft.start;
        renderSheet();
      }
      break;
    case 'flow':
      if (ui.draft) {
        ui.draft.flow = ui.draft.flow === el.dataset.v ? '' : el.dataset.v;
        renderSheet();
      }
      break;
    case 'sym': {
      if (!ui.draft) break;
      const v = el.dataset.v;
      const i = ui.draft.symptoms.indexOf(v);
      if (i >= 0) ui.draft.symptoms.splice(i, 1);
      else ui.draft.symptoms.push(v);
      renderSheet();
      break;
    }
    case 'save-period':
      savePeriodFromDraft();
      break;
    case 'delete-period': {
      const id = el.dataset.id;
      if (!id || !confirm('Удалить эту запись о месячных?')) break;
      state.periods = state.periods.filter((p) => p.id !== id);
      persist();
      closeSheet();
      toast('Запись удалена');
      break;
    }
    case 'save-day':
      saveDayFromDraft(el.dataset.date);
      break;
    case 'pain':
      if (ui.draft) {
        const v = Number(el.dataset.v);
        ui.draft.pain = v;
        ui.draft.touched = true;
        if (v === 0) ui.draft.meds = [];
        renderSheet();
      }
      break;
    case 'med': {
      if (!ui.draft) break;
      const v = el.dataset.v;
      const arr = ui.draft.meds;
      if (v === 'none') {
        ui.draft.meds = arr.includes('none') ? [] : ['none'];
      } else {
        ui.draft.meds = arr.filter((x) => x !== 'none');
        const i = ui.draft.meds.indexOf(v);
        if (i >= 0) ui.draft.meds.splice(i, 1);
        else {
          ui.draft.meds.push(v);
          if (ui.draft.pain === 0) { ui.draft.pain = 1; ui.draft.touched = true; }
        }
      }
      renderSheet();
      break;
    }
    case 'tag': {
      if (!ui.draft) break;
      const v = el.dataset.v;
      const note = ui.draft.note.trim();
      if (note.toLowerCase().includes(v.toLowerCase())) break;
      ui.draft.note = note ? `${note}, ${v.toLowerCase()}` : v;
      renderSheet();
      break;
    }
    case 'save-migraine':
      saveMigraineFromDraft(el.dataset.date);
      break;
    case 'delete-migraine': {
      const iso = el.dataset.date;
      if (!iso || !confirm('Удалить запись об этом дне?')) break;
      delete state.migraines[iso];
      persist();
      closeSheet();
      toast('Запись удалена');
      break;
    }
    case 'tips-phase':
      ui.tipsPhase = el.dataset.v;
      ui.tipsCat = 'all';
      renderSheet();
      break;
    case 'tips-cat':
      ui.tipsCat = el.dataset.v;
      renderSheet();
      break;
    case 'toggle-tips':
      state.profile.tipsEnabled = !state.profile.tipsEnabled;
      persist();
      toast(state.profile.tipsEnabled ? 'Советы включены' : 'Советы скрыты');
      break;
    case 'toggle-pin':
      ui.pinBuffer = '';
      ui.pinError = '';
      ui.pinStage = null;
      ui.pinIntent = hasPin() ? 'off' : 'set';
      openSheet('pin');
      break;
    case 'change-pin':
      ui.pinIntent = hasPin() ? 'change' : 'set';
      ui.pinStage = hasPin() ? 'verify' : null;
      ui.pinBuffer = '';
      ui.pinError = '';
      openSheet('pin');
      break;
    case 'export':
      downloadExport();
      break;
    case 'install':
      installApp();
      break;
    case 'reset':
      resetAll();
      break;
    case 'sync-login':
      doLogin();
      break;
    case 'sync-logout':
      sync.logOut().then(() => {
        renderSheet();
        toast('Вы вышли из облака');
      });
      break;
    case 'sync-pull':
      doPull();
      break;
    default:
      break;
  }
}

function onChange(e) {
  const t = e.target;

  if (t.matches('[data-import]') && t.files?.[0]) {
    handleImport(t.files[0]);
    return;
  }

  const key = t.dataset.set;
  if (key) {
    if (key === 'name') state.profile.name = t.value.trim().slice(0, 24) || 'Вика';
    if (key === 'cycleLength') state.profile.cycleLength = Math.min(60, Math.max(15, Number(t.value) || 28));
    if (key === 'periodLength') state.profile.periodLength = Math.min(12, Math.max(1, Number(t.value) || 5));
    if (key === 'lockTimeout') state.profile.lockTimeout = Math.max(0, Number(t.value) || 0);
    persist({ sheetOnly: true });
    if (key === 'name' || key === 'cycleLength' || key === 'periodLength') render();
    toast('Сохранено');
  }
}

function onInput(e) {
  const t = e.target;
  if (t.matches('[data-draft]') && ui.draft) {
    ui.draft[t.dataset.draft] = t.value;
  }
}

function bind() {
  document.addEventListener('click', onClick);
  document.addEventListener('change', onChange);
  document.addEventListener('input', onInput);

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && ui.sheet) closeSheet();
    if (ui.sheet?.type === 'pin' && /^\d$/.test(e.key)) pinKey(e.key);
    if (ui.sheet?.type === 'pin' && e.key === 'Backspace') pinKey('del');
  });

  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    ui.installPrompt = e;
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      if (hasPin() && !state.profile.lockTimeout) lockSession();
      return;
    }
    const t = todayISO();
    if (t !== ui.lastDay) { ui.lastDay = t; render(); }
    if (hasPin() && !isUnlocked()) showLock();
    else touchSession(state.profile.lockTimeout);
  });
  window.addEventListener('online', () => toast('Снова онлайн'));
  window.addEventListener('offline', () => toast('Офлайн — данные сохранятся на устройстве'));
}

/* ── роутинг ─────────────────────────────────────────────── */

function setRoute(route) {
  if (!TABS.includes(route)) route = 'today';
  ui.route = route;
  if (location.hash !== '#' + route) {
    history.replaceState(null, '', '#' + route);
  }
  window.scrollTo({ top: 0 });
  render();
}

function routeFromHash() {
  const h = (location.hash || '').replace('#', '');
  ui.route = TABS.includes(h) ? h : 'today';
}

/* ── запуск ──────────────────────────────────────────────── */

async function boot() {
  bind();
  routeFromHash();
  window.addEventListener('hashchange', () => {
    routeFromHash();
    window.scrollTo({ top: 0 });
    render();
  });

  if (hasPin() && !isUnlocked()) showLock();
  render();

  sync.subscribe((s) => {
    if (ui.sheet?.type === 'settings') renderSheet();
    if (s.status === 'error') console.warn('[sync]', s.error);
  });

  try {
    const s = await sync.boot();
    if (s.user) {
      const remote = await sync.pull();
      if (remote) {
        state = mergeStates(state, remote);
        saveState(state);
        render();
      } else {
        await sync.push(state);
      }
    }
  } catch (err) {
    console.warn('[boot] cloud', err);
  }

  ui.lastDay = todayISO();
  setInterval(() => {
    const t = todayISO();
    if (t !== ui.lastDay) { ui.lastDay = t; render(); }
  }, 60000);
}

/* Офлайн-оболочка: сначала кэшируем файлы из окна, потом регистрируем SW.
   Так офлайн-режим включается даже там, где install в SW капризничает. */
async function setupOffline() {
  if (!('serviceWorker' in navigator) || !location.protocol.startsWith('http')) return;

  try {
    await clearOldCaches();
    await precacheFromPage();
  } catch (err) {
    console.warn('[pwa] precache', err);
  }

  try {
    const reg = await navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' });
    if (reg.waiting) reg.waiting.postMessage('skip-waiting');
  } catch (err) {
    console.warn('[sw]', err);
  }
}

if (document.readyState === 'complete') setupOffline();
else window.addEventListener('load', setupOffline, { once: true });

boot();
