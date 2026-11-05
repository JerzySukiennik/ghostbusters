// City chunk worker: builds chunk geometry off the main thread and hands the typed arrays back without copying.
import { createBuilder } from './build.js';

let B = null;

self.onmessage = async (e) => {
  const m = e.data;
  try {
    if (m.init) {
      const map = await fetch(m.url).then((r) => r.json());
      B = createBuilder(map, m.opts);
      const far = B.far();
      self.postMessage({ ready: true, far }, [far.buffer]);
      return;
    }
    const { res, tr } = B.build(m.key, m.tier);
    self.postMessage({ id: m.id, res }, tr);
  } catch (err) {
    self.postMessage({ id: m.id, error: String(err?.stack || err) });
  }
};
