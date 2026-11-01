// Online rooms on Firebase RTDB (project ghostbusters-eu-gzowo, europe-west1): quick play and 4-letter codes, presence, host election, state, host and event channels.
const SDK = 'https://www.gstatic.com/firebasejs/10.12.5';
const CONFIG = {
  apiKey: 'AIzaSyDrP0t5k-hXho0fvot7Xat5e-oCbuJZ774',
  authDomain: 'ghostbusters-eu-gzowo.firebaseapp.com',
  databaseURL: 'https://ghostbusters-eu-gzowo-default-rtdb.europe-west1.firebasedatabase.app',
  projectId: 'ghostbusters-eu-gzowo',
  appId: '1:156938290573:web:fd119974b3a1163a75a9c4',
};
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
const MAX = 4;
let sdkP = null;

function loadSdk() {
  if (!sdkP) sdkP = Promise.all([import(`${SDK}/firebase-app.js`), import(`${SDK}/firebase-database.js`)]).then(([app, db]) => ({ app, db }));
  return sdkP;
}

const PID = Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => (b % 36).toString(36)).join('') + Date.now().toString(36).slice(-6);
const ordered = (players) => Object.entries(players || {}).sort((a, b) => (a[1].joined || 0) - (b[1].joined || 0) || (a[0] < b[0] ? -1 : 1)).map(([k]) => k);

export class Room {
  static async connect(realm = '') {
    const { app, db } = await loadSdk();
    const fbApp = app.getApps().length ? app.getApp() : app.initializeApp(CONFIG);
    return new Room(db, db.getDatabase(fbApp), realm);
  }

  constructor(F, db, realm) {
    this.F = F; this.db = db;
    this.L = realm === 'test' ? 'tlobbies' : 'lobbies';
    this.R = realm === 'test' ? 'trooms' : 'rooms';
    this.pid = PID;
    this.code = null; this.players = {}; this.order = []; this.host = null; this.index = 0;
    this.offset = 0; this.handlers = {}; this.unsubs = []; this.pub = false; this.joinedAt = 0;
    this.unsubs.push(F.onValue(F.ref(db, '.info/serverTimeOffset'), (s) => { this.offset = s.val() || 0; }));
    this.connected = false;
    this.unsubs.push(F.onValue(F.ref(db, '.info/connected'), (s) => { this.connected = !!s.val(); this.fire('conn', this.connected); }));
  }

  now() { return Date.now() + this.offset; }
  on(type, fn) { (this.handlers[type] ||= []).push(fn); }
  fire(type, ...a) { for (const f of this.handlers[type] || []) { try { f(...a); } catch (e) { console.warn('[room]', type, e); } } }
  ref(path) { return this.F.ref(this.db, `${this.R}/${this.code}/${path}`); }
  get isHost() { return this.host === this.pid; }

  newCode() { let c = ''; for (let i = 0; i < 4; i++) c += LETTERS[(Math.random() * LETTERS.length) | 0]; return c; }

  async openLobbies() {
    const F = this.F;
    const snap = await F.get(F.query(F.ref(this.db, this.L), F.orderByChild('t'), F.startAt(this.now() - 40000)));
    const out = [];
    snap.forEach((c) => { const v = c.val(); if (v && v.pub && v.n > 0 && v.n < MAX && v.ph !== 'done') out.push({ code: c.key, ...v }); });
    return out.sort((a, b) => b.n - a.n);
  }

  async quickPlay(profile) {
    for (const l of await this.openLobbies()) { const r = await this.join(l.code, profile).catch(() => null); if (r) return r; }
    return this.create(profile, true);
  }

  async create(profile, pub = false) {
    const F = this.F;
    for (let i = 0; i < 8; i++) {
      const code = this.newCode();
      const s = await F.get(F.ref(this.db, `${this.R}/${code}/players`));
      if (s.exists()) continue;
      await F.remove(F.ref(this.db, `${this.R}/${code}`)).catch(() => {});
      this.pub = pub;
      return this.join(code, profile, true);
    }
    throw new Error('no free room code');
  }

  async join(code, profile, fresh = false) {
    const F = this.F;
    code = String(code || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4);
    if (code.length !== 4) throw new Error('Codes have 4 letters');
    const ps = await F.get(F.ref(this.db, `${this.R}/${code}/players`));
    const n = ps.exists() ? Object.keys(ps.val()).length : 0;
    if (!fresh && n === 0) throw new Error('No room with that code');
    if (n >= MAX) throw new Error('That room is full');
    if (!fresh && (await F.get(F.ref(this.db, `${this.R}/${code}/host/m/won`))).val()) throw new Error('That bust is over. Start a new room');
    this.code = code;
    const me = this.ref(`players/${this.pid}`);
    await F.onDisconnect(me).remove();
    await F.onDisconnect(this.ref(`st/${this.pid}`)).remove();
    await F.set(me, { nick: String(profile.nick || 'BUSTER').slice(0, 12), char: String(profile.char || 'jurek').slice(0, 12), joined: F.serverTimestamp() });
    const after = await F.get(this.ref('players'));
    if (ordered(after.val()).indexOf(this.pid) >= MAX) { await F.remove(me).catch(() => {}); this.code = null; throw new Error('That room is full'); }
    this.joinedAt = this.now();
    this.listen();
    return { code, fresh };
  }

  listen() {
    const F = this.F;
    const sub = (u) => this.unsubs.push(u);
    sub(F.onValue(this.ref('players'), (s) => {
      this.players = s.val() || {};
      this.order = ordered(this.players);
      const prev = this.host;
      this.host = this.order[0] || null;
      this.index = Math.max(0, this.order.indexOf(this.pid));
      this.fire('players', this.players, this.order);
      if (prev !== this.host) this.fire('host', this.host, prev);
      if (this.isHost) this.beat();
    }));
    sub(F.onChildAdded(this.ref('st'), (s) => this.fire('state', s.key, s.val())));
    sub(F.onChildChanged(this.ref('st'), (s) => this.fire('state', s.key, s.val())));
    sub(F.onChildRemoved(this.ref('st'), (s) => this.fire('gone', s.key)));
    sub(F.onValue(this.ref('host/g'), (s) => this.fire('ghosts', s.val())));
    sub(F.onValue(this.ref('host/m'), (s) => this.fire('mission', s.val())));
    sub(F.onValue(this.ref('host/car'), (s) => this.fire('car', s.val())));
    sub(F.onChildAdded(this.ref('ev'), (s) => { const v = s.val(); if (v && (v.t || 0) >= this.joinedAt - 2000 && v.by !== this.pid) this.fire('event', v, s.key); }));
    this.beatTimer = setInterval(() => { if (this.isHost) { this.beat(); this.trim(); } }, 8000);
  }

  beat(ph) {
    if (!this.code || !this.isHost) return;
    if (ph) this.phase = ph;
    const F = this.F;
    const lob = F.ref(this.db, `${this.L}/${this.code}`);
    F.set(lob, { n: this.order.length, t: this.now(), pub: !!this.pub, ph: this.phase || 'play' }).catch(() => {});
    if (!this.lobbyDc) { this.lobbyDc = true; F.onDisconnect(lob).remove(); }
  }

  async trim() {
    const F = this.F;
    try {
      const old = await F.get(F.query(this.ref('ev'), F.orderByChild('t'), F.endAt(this.now() - 12000), F.limitToFirst(200)));
      const up = {}; old.forEach((c) => { up[c.key] = null; });
      if (Object.keys(up).length) await F.update(this.ref('ev'), up);
    } catch {}
  }

  setState(v) { if (this.code) return this.F.set(this.ref(`st/${this.pid}`), v).catch(() => {}); }
  setHost(path, v) { if (this.code) return this.F.set(this.ref(`host/${path}`), v).catch(() => {}); }
  emit(k, data = {}) { if (this.code) return this.F.push(this.ref('ev'), { ...data, k, by: this.pid, t: this.F.serverTimestamp() }).catch(() => {}); }

  async claim(path, value, canTake) {
    const r = await this.F.runTransaction(this.ref(path), (cur) => (cur == null || cur === value || (canTake && canTake(cur)) ? value : undefined));
    return r.committed;
  }

  async release(path, value) { await this.F.runTransaction(this.ref(path), (cur) => (cur === value ? null : undefined)); }

  async leave() {
    clearInterval(this.beatTimer);
    for (const u of this.unsubs.splice(0)) { try { u(); } catch {} }
    if (this.code) {
      const F = this.F;
      try { await F.remove(this.ref(`players/${this.pid}`)); await F.remove(this.ref(`st/${this.pid}`)); } catch {}
      if (this.isHost && this.order.length <= 1) { try { await F.remove(F.ref(this.db, `${this.L}/${this.code}`)); await F.remove(F.ref(this.db, `${this.R}/${this.code}`)); } catch {} }
    }
    this.code = null;
  }
}
