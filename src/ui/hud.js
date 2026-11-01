// Minimal HUD: objective, context prompt, crosshair with tension ring, ghost will bar, heat, look switch, speed, toasts and the bust report.
const $ = (s) => document.querySelector(s);
const PRICE = { crate: 140, box: 25, cardboard: 25, trashcan: 95, trash: 95, can: 95, bench: 650, newspaper: 380, mailbox: 900, phone: 2400, booth: 2400, hydrant: 1800, cone: 40, barrier: 160, sawhorse: 160, cart: 2600, hotdog: 3, food: 3, glass: 450, window: 450, lamp: 1200, sign: 300 };

export class HUD {
  constructor() {
    this.el = { obj: $('#objective .t'), prompt: $('#prompt'), pk: $('#prompt kbd'), pt: $('#prompt span'), cross: $('#cross'), tens: $('#tens'), ring: $('#ring'), gb: $('#ghostbar'), gbi: $('#ghostbar .b i'), gbu: $('#ghostbar .b u'), gbs: $('#ghostbar .s'), heat: $('#heat'), heati: $('#heat .b i'), style: $('#style b'), speed: $('#speed'), speedv: $('#speed span'), toast: $('#toast'), done: $('#done'), sub: $('#done .sub'), rows: $('#done .rows') };
    this.cur = {}; this.toastT = 0; this.bill = 0; this.broken = 0;
    this.el.gbu.style.left = '35%';
  }

  set(key, val, fn) { if (this.cur[key] !== val) { this.cur[key] = val; fn(val); } }

  objective(t) {
    this.set('obj', t, (v) => { const e = this.el.obj; e.style.opacity = 0; setTimeout(() => { e.textContent = v; e.style.opacity = 1; }, 180); });
  }

  prompt(key, text) {
    this.set('prompt', key ? key + text : '', () => {
      if (!key) { this.el.prompt.classList.remove('on'); return; }
      this.el.pk.textContent = key; this.el.pt.textContent = text; this.el.prompt.classList.add('on');
    });
  }

  cross(on, tension = 0, hot = false) {
    this.el.cross.classList.toggle('on', on);
    const c = 125.66 * Math.max(0, Math.min(1, tension));
    this.set('tens', Math.round(c), (v) => this.el.tens.setAttribute('stroke-dasharray', `${v} 126`));
    this.set('tcol', tension > 0.75 ? '#ffc04a' : '#9dff6a', (v) => this.el.tens.setAttribute('stroke', v));
    this.set('hot', hot, (v) => this.el.ring.setAttribute('stroke-opacity', v ? 0.55 : 0.18));
  }

  ghost(on, will = 100, status = '') {
    this.el.gb.classList.toggle('on', on);
    this.set('will', Math.round(will), (v) => (this.el.gbi.style.width = v + '%'));
    this.set('gbs', status, (v) => (this.el.gbs.textContent = v));
  }

  heat(on, v, hot, over) {
    this.el.heat.classList.toggle('on', on);
    this.el.heat.classList.toggle('hot', hot && !over);
    this.el.heat.classList.toggle('over', over);
    this.set('heatv', Math.round(v * 100), (x) => (this.el.heati.style.width = x + '%'));
  }

  style(s) { if (this.el.style) this.set('style', s, (v) => (this.el.style.textContent = v === 'film' ? '1984 FILM' : 'MODERN')); }

  speed(on, mph) {
    this.el.speed.classList.toggle('on', on);
    this.set('mph', Math.round(mph), (v) => (this.el.speedv.textContent = v));
  }

  toast(text, dur = 1.5) {
    this.el.toast.textContent = text;
    this.el.toast.classList.add('on');
    this.toastT = dur;
  }

  damage(p) {
    const key = Object.keys(PRICE).find((k) => (p.kind + ' ' + (p.id || '')).toLowerCase().includes(k));
    this.bill += key ? PRICE[key] : 120;
    this.broken++;
  }

  update(dt) {
    if (this.toastT > 0) { this.toastT -= dt; if (this.toastT <= 0) this.el.toast.classList.remove('on'); }
  }

  report(s) {
    const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
    const m = Math.floor(s.time / 60), sec = Math.floor(s.time % 60);
    this.el.sub.textContent = `Onionhead is in the trap. ${m}:${String(sec).padStart(2, '0')} on the clock.`;
    const rows = [
      ...(s.crew ? [['Crew', s.crew]] : []),
      ['Bust fee', money(5000)],
      ['Property damage', '-' + money(this.bill)],
      ['Things wrecked', String(this.broken)],
      ['Times slimed', String(s.slimed)],
      ['Slams · boson darts', `${s.slams} · ${s.darts}`],
      ['Invoice to the city', money(5000 - this.bill), true],
    ];
    this.el.rows.replaceChildren(...rows.map(([a, b, t]) => {
      const r = document.createElement('div'); r.className = 'row' + (t ? ' tot' : '');
      for (const v of [a, b]) { const s = document.createElement('span'); s.textContent = v; r.append(s); }
      return r;
    }));
    this.el.done.classList.add('on');
  }

  hideReport() { this.el.done.classList.remove('on'); }

  roster(room) {
    const el = document.getElementById('roster');
    if (!el) return;
    if (!room || !room.code) { el.classList.remove('on'); return; }
    el.classList.add('on');
    el.textContent = '';
    const code = document.createElement('div'); code.className = 'code'; code.append('ROOM '); const b = document.createElement('b'); b.textContent = room.code; code.append(b); el.append(code);
    for (const pid of room.order) {
      const d = document.createElement('div');
      d.className = 'p' + (pid === room.pid ? ' me' : '');
      d.textContent = String(room.players[pid]?.nick || 'BUSTER').toUpperCase();
      if (pid === room.host) { const i = document.createElement('i'); i.textContent = 'HOST'; d.append(i); }
      el.append(d);
    }
  }
}
