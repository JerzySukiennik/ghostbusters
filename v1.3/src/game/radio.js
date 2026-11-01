// Janine on the two-way radio: queued voice lines from assets/radio with subtitles, one at a time, ducking the street while she talks.
export class Radio {
  constructor(audio, hud, base = 'assets/radio/') {
    this.audio = audio; this.hud = hud; this.base = base;
    this.lines = {}; this.buf = new Map(); this.pending = new Map();
    this.q = []; this.cur = null; this.t = 0; this.bus = null; this.last = {};
  }

  async load() {
    try { const r = await fetch(this.base + 'lines.json', { cache: 'no-store' }); this.lines = r.ok ? await r.json() : {}; } catch { this.lines = {}; }
    return this;
  }

  has(id) { return !!this.lines[id]; }

  text(id) { return this.lines[id]?.text || ''; }

  fetch(id) {
    if (this.buf.has(id)) return Promise.resolve(this.buf.get(id));
    if (this.pending.has(id) || !this.audio.ctx) return this.pending.get(id);
    const files = this.lines[id]?.files || [id + '.ogg', id + '.mp3'];
    const pick = files.find((f) => (this.audio.ogg ? /\.ogg$/ : /\.mp3$/).test(f)) || files[0];
    const alt = files.find((f) => f !== pick) || pick;
    const get = (f) => fetch(this.base + f).then((r) => { if (!r.ok) throw new Error(r.status); return r.arrayBuffer(); }).then((b) => this.audio.ctx.decodeAudioData(b));
    const p = get(pick).catch(() => get(alt)).then((b) => { this.buf.set(id, b); return b; }).catch(() => { this.buf.set(id, null); return null; });
    this.pending.set(id, p);
    return p;
  }

  say(id, o = {}) {
    if (!this.lines[id]) return false;
    const cd = o.cooldown || 0;
    if (cd && this.t - (this.last[o.group || id] ?? -1e9) < cd) return false;
    if (this.q.some((x) => x.id === id) || this.cur?.id === id) return false;
    this.last[o.group || id] = this.t;
    const item = { id, prio: o.prio || 0, ttl: o.ttl ?? 30, at: this.t, text: o.text || this.lines[id].text, onEnd: o.onEnd || null };
    if (o.replace) this.q = this.q.filter((x) => !x.id.startsWith(o.replace));
    this.q.push(item);
    this.q.sort((a, b) => b.prio - a.prio || a.at - b.at);
    if (o.cut && this.cur && this.cur.prio < item.prio) this.end(true);
    this.fetch(id);
    return true;
  }

  busy() { return !!this.cur || this.q.length > 0; }

  duck(on) {
    const b = this.audio.bus, c = this.audio.ctx;
    if (!b || !c) return;
    b.amb?.gain.setTargetAtTime(on ? 0.22 : 0.55, c.currentTime, 0.15);
    b.car?.gain.setTargetAtTime(on ? 0.55 : 0.9, c.currentTime, 0.15);
  }

  end(cut) {
    const c = this.cur;
    if (!c) return;
    if (cut) try { c.src.stop(); } catch {}
    this.cur = null;
    this.hud.talk(false); this.hud.subtitle(null);
    this.duck(false);
    c.onEnd?.();
  }

  stop() { this.q.length = 0; this.end(true); }

  update(dt) {
    this.t += dt;
    if (this.cur) { if (this.t >= this.cur.endT) this.end(false); else return; }
    if (!this.audio.ctx || this.audio.muted) return;
    this.q = this.q.filter((x) => { const ok = this.t - x.at < x.ttl; if (!ok) x.onEnd?.(); return ok; });
    const next = this.q[0];
    if (!next) return;
    if (!this.buf.has(next.id)) { this.fetch(next.id); return; }
    this.q.shift();
    const b = this.buf.get(next.id);
    if (!b) { next.onEnd?.(); return; }
    const c = this.audio.ctx;
    if (!this.bus) { this.bus = c.createGain(); this.bus.gain.value = 1.15; this.bus.connect(this.audio.master); }
    const src = c.createBufferSource();
    src.buffer = b; src.connect(this.bus); src.start();
    this.cur = { ...next, src, endT: this.t + b.duration + 0.1 };
    this.hud.talk(true); this.hud.subtitle('Janine', next.text);
    this.duck(true);
  }
}
