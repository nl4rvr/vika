/* ============================================================
   Firebase: конфиг, вход по e-mail/паролю, синхронизация.

   Без заполненного конфига приложение полностью локальное и
   даже не загружает SDK Firebase — работает офлайн с первого раза.
   ============================================================ */

/* ── Конфиг проекта vika-cycle ──────────────────────────────────
   Firebase Console → Project settings → General → Your apps → vika-pwa
   ─────────────────────────────────────────────────────────────── */
export const FIREBASE_CONFIG = {
  apiKey: 'AIzaSyAulmhNt631JxlF10ZjSOVZD-InzFesrdc',
  authDomain: 'vika-cycle.firebaseapp.com',
  projectId: 'vika-cycle',
  storageBucket: 'vika-cycle.firebasestorage.app',
  messagingSenderId: '166508150369',
  appId: '1:166508150369:web:ec9a18a88b83fd56fcb420',
};

const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';

export function hasFirebaseConfig() {
  const c = FIREBASE_CONFIG;
  return Boolean(
    c.apiKey && c.projectId && c.appId
    && !c.apiKey.startsWith('PASTE')
    && !c.apiKey.includes('ВСТАВЬТЕ')
  );
}

export function createSync() {
  const listeners = new Set();
  const state = {
    configured: hasFirebaseConfig(),
    status: hasFirebaseConfig() ? 'idle' : 'offline', // idle | connecting | ready | signed-out | error | offline
    user: null,
    error: null,
    lastSync: null,
    busy: false,
  };

  let auth = null;
  let db = null;
  let uid = null;
  let sdk = null;
  let pushTimer = null;
  let pending = null;

  const emit = () => listeners.forEach((fn) => fn({ ...state }));

  function set(patch) {
    Object.assign(state, patch);
    emit();
  }

  async function loadSdk() {
    if (sdk) return sdk;
    const [appMod, authMod, dbMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    sdk = { appMod, authMod, dbMod };
    return sdk;
  }

  async function boot() {
    if (!state.configured) return { ...state };
    set({ status: 'connecting' });
    try {
      const { appMod, authMod, dbMod } = await loadSdk();
      const app = appMod.initializeApp(FIREBASE_CONFIG);
      auth = authMod.getAuth(app);
      db = dbMod.getFirestore(app);
      await authMod.setPersistence(auth, authMod.browserLocalPersistence).catch(() => {});
      authMod.onAuthStateChanged(auth, (user) => {
        if (user) {
          uid = user.uid;
          set({ user: { uid: user.uid, email: user.email }, status: 'ready', error: null });
        } else {
          uid = null;
          set({ user: null, status: 'signed-out' });
        }
      });
      set({ status: 'idle' });
    } catch (err) {
      console.warn('[sync] boot failed', err);
      set({ status: 'error', error: err?.code || err?.message || 'init-failed' });
    }
    return { ...state };
  }

  async function signIn(email, password) {
    if (!state.configured || !auth) throw new Error('Облако не настроено');
    set({ busy: true, error: null });
    try {
      const cred = await sdk.authMod.signInWithEmailAndPassword(auth, email.trim(), password);
      uid = cred.user.uid;
      set({ user: { uid, email: cred.user.email }, status: 'ready', busy: false });
      return true;
    } catch (err) {
      const map = {
        'auth/invalid-credential': 'Неверный e-mail или пароль',
        'auth/invalid-login-credentials': 'Неверный e-mail или пароль',
        'auth/user-not-found': 'Аккаунт не найден',
        'auth/wrong-password': 'Неверный пароль',
        'auth/invalid-email': 'Проверьте e-mail',
        'auth/too-many-requests': 'Слишком много попыток. Подождите пару минут',
        'auth/network-request-failed': 'Нет сети — попробуйте позже',
        'auth/operation-not-allowed': 'В Firebase не включён вход по e-mail/паролю',
      };
      const msg = map[err?.code] || 'Не удалось войти. Проверьте данные';
      set({ busy: false, error: msg });
      throw new Error(msg);
    }
  }

  async function logOut() {
    try { if (auth) await sdk.authMod.signOut(auth); } catch {}
    uid = null;
    set({ user: null, status: 'signed-out' });
  }

  const docRef = () => (uid && db ? sdk.dbMod.doc(db, 'users', uid, 'app', 'state') : null);

  async function pull() {
    const ref = docRef();
    if (!ref) return null;
    try {
      const snap = await sdk.dbMod.getDoc(ref);
      if (!snap.exists()) return null;
      return snap.data()?.payload || null;
    } catch (err) {
      console.warn('[sync] pull failed', err);
      set({ error: 'Не удалось загрузить данные из облака' });
      return null;
    }
  }

  async function push(payload) {
    const ref = docRef();
    if (!ref) return false;
    pending = payload;
    if (pushTimer) return true;
    pushTimer = setTimeout(async () => {
      pushTimer = null;
      const data = pending;
      pending = null;
      try {
        await sdk.dbMod.setDoc(ref, { payload: data, updatedAt: sdk.dbMod.serverTimestamp() });
        set({ lastSync: Date.now(), error: null });
      } catch (err) {
        console.warn('[sync] push failed', err);
        set({ error: 'Не удалось сохранить в облако' });
      }
    }, 900);
    return true;
  }

  return {
    state,
    boot,
    pull,
    push,
    signIn,
    logOut,
    subscribe(fn) { listeners.add(fn); fn({ ...state }); return () => listeners.delete(fn); },
  };
}
