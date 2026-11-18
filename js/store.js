/* Хранилище: состояние, миграции, PIN, экспорт/импорт, merge с облаком. */

import { normalizePeriods } from './cycle.js';

export const STORAGE_KEY = 'vika.cycle.v1';
export const PIN_KEY = 'vika.pin.v1';
export const SESSION_KEY = 'vika.session.v1';

let unlockedNow = false;

export function defaultState() {
  return {
    version: 1,
    profile: {
      name: 'Вика',
      cycleLength: 28,
      periodLength: 5,
      tipsEnabled: true,
      lockEnabled: false,
      lockTimeout: 0,
      createdAt: new Date().toISOString(),
    },
    periods: [],
    days: {},
    migraines: {},
    updatedAt: new Date().toISOString(),
  };
}

export function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultState();
    const parsed = JSON.parse(raw);
    return migrate(parsed);
  } catch (err) {
    console.warn('[store] load failed', err);
    return defaultState();
  }
}

export function migrate(input) {
  const base = defaultState();
  if (!input || typeof input !== 'object') return base;
  const s = {
    ...base,
    ...input,
    profile: { ...base.profile, ...(input.profile || {}) },
    periods: normalizePeriods(Array.isArray(input.periods) ? input.periods : []),
    days: sanitizeDays(input.days),
    migraines: sanitizeMigraines(input.migraines),
  };
  s.version = 1;
  return s;
}

function sanitizeDays(days) {
  const out = {};
  if (!days || typeof days !== 'object') return out;
  for (const [iso, v] of Object.entries(days)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !v || typeof v !== 'object') continue;
    out[iso] = {
      flow: typeof v.flow === 'string' ? v.flow : '',
      symptoms: Array.isArray(v.symptoms) ? v.symptoms.filter((x) => typeof x === 'string').slice(0, 20) : [],
      note: typeof v.note === 'string' ? v.note.slice(0, 500) : '',
    };
  }
  return out;
}

function sanitizeMigraines(migs) {
  const out = {};
  if (!migs || typeof migs !== 'object') return out;
  for (const [iso, v] of Object.entries(migs)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || !v || typeof v !== 'object') continue;
    out[iso] = {
      pain: Number.isFinite(Number(v.pain)) ? Math.max(0, Math.min(3, Number(v.pain))) : 0,
      meds: Array.isArray(v.meds) ? v.meds.filter((x) => typeof x === 'string').slice(0, 8) : [],
      note: typeof v.note === 'string' ? v.note.slice(0, 500) : '',
    };
  }
  return out;
}

export function saveState(state) {
  try {
    state.updatedAt = new Date().toISOString();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    return true;
  } catch (err) {
    console.warn('[store] save failed', err);
    return false;
  }
}

/* ── PIN ─────────────────────────────────────────────────── */

async function digest(text) {
  if (crypto?.subtle) {
    const data = new TextEncoder().encode('vika::' + text);
    const buf = await crypto.subtle.digest('SHA-256', data);
    return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
  }
  // fallback для http:// на локальной сети
  let h = 0;
  const s = 'vika::' + text;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return 'fallback-' + Math.abs(h).toString(36);
}

export async function setPin(pin) {
  const hash = await digest(pin);
  localStorage.setItem(PIN_KEY, hash);
}

export function hasPin() {
  return Boolean(localStorage.getItem(PIN_KEY));
}

export async function verifyPin(pin) {
  const stored = localStorage.getItem(PIN_KEY);
  if (!stored) return false;
  return stored === await digest(pin);
}

export function clearPin() {
  localStorage.removeItem(PIN_KEY);
  sessionStorage.removeItem(SESSION_KEY);
  unlockedNow = false;
}

export function markUnlocked(timeoutMinutes = 0) {
  if (timeoutMinutes > 0) {
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ until: Date.now() + timeoutMinutes * 60000 }));
  } else {
    // «Сразу»: разблокировано до перезагрузки страницы
    sessionStorage.removeItem(SESSION_KEY);
    unlockedNow = true;
  }
}

export function isUnlocked() {
  if (unlockedNow) return true;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return false;
    const { until } = JSON.parse(raw);
    if (!until) return false;
    return Date.now() < until;
  } catch {
    return false;
  }
}

export function lockSession() {
  unlockedNow = false;
  sessionStorage.removeItem(SESSION_KEY);
}

export function touchSession(timeoutMinutes = 0) {
  if (!timeoutMinutes) return;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return;
    const { until } = JSON.parse(raw);
    if (!until) return;
    sessionStorage.setItem(SESSION_KEY, JSON.stringify({ until: Date.now() + timeoutMinutes * 60000 }));
  } catch {}
}

export function clearState() {
  localStorage.removeItem(STORAGE_KEY);
}

/* ── merge ───────────────────────────────────────────────── */

export function mergeStates(local, remote) {
  if (!remote) return local;
  const a = migrate(local);
  const b = migrate(remote);

  const periodsById = new Map();
  for (const p of b.periods) periodsById.set(p.id, p);
  for (const p of a.periods) {
    const prev = periodsById.get(p.id);
    if (!prev) { periodsById.set(p.id, p); continue; }
    // более «закрытая» запись важнее
    const prevScore = (prev.end ? 2 : 0) + (prev.note ? 1 : 0);
    const curScore = (p.end ? 2 : 0) + (p.note ? 1 : 0);
    if (curScore >= prevScore) periodsById.set(p.id, { ...prev, ...p });
  }

  const days = { ...b.days };
  for (const [iso, v] of Object.entries(a.days)) {
    const old = days[iso];
    if (!old) { days[iso] = v; continue; }
    days[iso] = {
      flow: v.flow || old.flow,
      symptoms: [...new Set([...(old.symptoms || []), ...(v.symptoms || [])])],
      note: v.note || old.note,
    };
  }

  const migraines = { ...b.migraines };
  for (const [iso, v] of Object.entries(a.migraines)) {
    const old = migraines[iso];
    if (!old) { migraines[iso] = v; continue; }
    migraines[iso] = {
      pain: Math.max(old.pain || 0, v.pain || 0),
      meds: [...new Set([...(old.meds || []), ...(v.meds || [])])],
      note: v.note || old.note,
    };
  }

  return {
    ...a,
    profile: { ...b.profile, ...a.profile },
    periods: normalizePeriods([...periodsById.values()]),
    days,
    migraines,
    updatedAt: new Date().toISOString(),
  };
}

/* ── export / import ─────────────────────────────────────── */

export function exportJSON(state) {
  return JSON.stringify({ app: 'vika-cycle', version: 1, exportedAt: new Date().toISOString(), data: state }, null, 2);
}

export function importJSON(text) {
  const parsed = JSON.parse(text);
  const raw = parsed?.data || parsed;
  if (!raw || typeof raw !== 'object') throw new Error('bad-format');
  if (!raw.profile && !raw.periods && !raw.migraines) throw new Error('bad-format');
  return migrate(raw);
}
