// Keyboard, mouse and pointer-lock state with per-frame edges.
export class Input {
  constructor(target) {
    this.target = target;
    this.down = new Set();
    this.hit = new Set();
    this.btn = [false, false, false];
    this.btnHit = [false, false, false];
    this.btnUp = [false, false, false];
    this.dx = 0; this.dy = 0; this.wheel = 0;
    this.locked = false;
    this.enabled = false;
    this.flick = { x: 0, y: 0 };
    addEventListener('keydown', (e) => {
      if (e.repeat) return;
      if (['Space', 'Tab', 'ArrowUp', 'ArrowDown'].includes(e.code)) e.preventDefault();
      this.down.add(e.code); this.hit.add(e.code);
    });
    addEventListener('keyup', (e) => this.down.delete(e.code));
    addEventListener('blur', () => { this.down.clear(); this.btn.fill(false); });
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('mousedown', (e) => {
      if (!this.enabled) return;
      if (!this.locked) { this.lock(); return; }
      this.btn[e.button] = true; this.btnHit[e.button] = true;
    });
    addEventListener('mouseup', (e) => { if (this.btn[e.button]) this.btnUp[e.button] = true; this.btn[e.button] = false; });
    addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.dx += e.movementX; this.dy += e.movementY;
    });
    addEventListener('wheel', (e) => { this.wheel += Math.sign(e.deltaY); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      this.locked = document.pointerLockElement === this.target;
      if (!this.locked) this.btn.fill(false);
    });
  }

  lock() {
    const plain = () => { try { const q = this.target.requestPointerLock(); if (q && q.catch) q.catch(() => {}); } catch {} };
    try { const p = this.target.requestPointerLock({ unadjustedMovement: true }); if (p && p.catch) p.catch(plain); } catch { plain(); }
  }

  key(code) { return this.down.has(code); }
  pressed(code) { return this.hit.has(code); }

  axis() {
    const x = (this.key('KeyD') ? 1 : 0) - (this.key('KeyA') ? 1 : 0);
    const z = (this.key('KeyW') ? 1 : 0) - (this.key('KeyS') ? 1 : 0);
    return { x, z };
  }

  endFrame(dt) {
    const k = Math.min(1, dt * 10);
    this.flick.x += (this.dx - this.flick.x) * k;
    this.flick.y += (this.dy - this.flick.y) * k;
    this.hit.clear();
    this.btnHit.fill(false); this.btnUp.fill(false);
    this.dx = 0; this.dy = 0; this.wheel = 0;
  }
}
