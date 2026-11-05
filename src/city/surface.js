// Pure point queries over map.json: which surface a point is on, its ground height, and the block / lot under it.
import { inside, bounds } from './geom.js';

const CELL = 32;

export function createSurface(map) {
  const SW = map.sidewalkH ?? 0.15, WY = map.water?.y ?? -1.6;
  const land = map.water.land;
  const grid = new Map();
  const key = (i, j) => i * 100003 + j;
  const put = (item, poly) => {
    const [x0, z0, x1, z1] = bounds(poly);
    for (let i = Math.floor(x0 / CELL); i <= Math.floor(x1 / CELL); i++)
      for (let j = Math.floor(z0 / CELL); j <= Math.floor(z1 / CELL); j++) {
        const k = key(i, j);
        let a = grid.get(k);
        if (!a) grid.set(k, (a = []));
        a.push(item);
      }
  };
  const lotById = new Map();
  for (const l of map.lots) lotById.set(l.id, l);
  for (const b of map.blocks) put({ t: 'block', o: b, poly: b.kerb }, b.kerb);
  for (const l of map.lots) put({ t: 'lot', o: l, poly: l.poly }, l.poly);
  for (const p of map.water.piers) put({ t: 'pier', o: p, poly: p.poly }, p.poly);
  for (const w of map.water.ponds) put({ t: 'pond', o: w, poly: w.poly }, w.poly);
  const query = (x, z) => grid.get(key(Math.floor(x / CELL), Math.floor(z / CELL))) || [];

  function at(x, z) {
    const items = query(x, z);
    let block = null, lot = null, pier = null, pond = null;
    for (const it of items) {
      if (!inside(it.poly, x, z)) continue;
      if (it.t === 'block') block = it.o;
      else if (it.t === 'lot') lot = it.o;
      else if (it.t === 'pier') pier = it.o;
      else pond = it.o;
    }
    return { block, lot, pier, pond };
  }

  function surfaceAt(x, z) {
    if (!inside(land, x, z)) return at(x, z).pier ? 'pier' : 'water';
    const { block, lot, pond } = at(x, z);
    if (pond) return 'water';
    if (!block) return 'road';
    if (lot) {
      if (lot.kind === 'park') return 'park';
      if (lot.kind === 'plaza') return 'plaza';
      return 'building';
    }
    if (block.kind === 'park') return 'park';
    if (block.kind === 'plaza' || block.kind === 'island') return 'plaza';
    return 'walk';
  }

  function heightAt(x, z) {
    const s = surfaceAt(x, z);
    if (s === 'road') return 0;
    if (s === 'water') return inside(land, x, z) ? (at(x, z).pond?.y ?? -0.5) : WY;
    return SW;
  }

  return { surfaceAt, heightAt, at, blockAt: (x, z) => at(x, z).block, lotAt: (x, z) => at(x, z).lot, lotById };
}
