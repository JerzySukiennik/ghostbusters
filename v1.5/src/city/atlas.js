// Generated 2048x2048 sign atlas: 1984 black-on-yellow street name blades, shop fascias in five period styles, Times Square billboards.
const SHOP_STYLES = [
  { bg: ['#e9e2cf', '#cfc6ae'], fg: '#b3201a', edge: '#5a1410', font: '900 {s}px "Arial Black", Impact, sans-serif' },
  { bg: ['#123a26', '#0b2618'], fg: '#e8c25a', edge: '#6b5420', font: '700 {s}px Georgia, "Times New Roman", serif' },
  { bg: ['#a8181a', '#7a0f10'], fg: '#fff6e8', edge: '#f2d9b0', font: '800 {s}px "Helvetica Neue", Arial, sans-serif' },
  { bg: ['#0c0c10', '#050507'], fg: '#ff5fb0', edge: '#ffd0ea', font: 'italic 700 {s}px "Brush Script MT", "Trebuchet MS", cursive', glow: true },
  { bg: ['#173f8a', '#0e2a60'], fg: '#ffffff', edge: '#a8c4ff', font: '800 {s}px "Futura", "Avenir Next", Arial, sans-serif' },
];
const BOARD_STYLES = [
  { bg: ['#c8141c', '#7c0a10'], fg: '#ffffff', sub: '#ffd23a' },
  { bg: ['#ffd02a', '#e09a10'], fg: '#14204a', sub: '#c8141c' },
  { bg: ['#101018', '#05050a'], fg: '#3af0ff', sub: '#ff4fd0', glow: true },
  { bg: ['#f2f2ea', '#c8c8c0'], fg: '#101010', sub: '#c8141c' },
];

function fit(g, text, font, maxW, size) {
  let s = size;
  for (; s > 8; s -= 2) { g.font = font.replace('{s}', s); if (g.measureText(text).width <= maxW) break; }
  return s;
}

export function paintAtlas(layout) {
  const c = document.createElement('canvas');
  c.width = layout.w; c.height = layout.h;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  g.textAlign = 'center'; g.textBaseline = 'middle';
  for (const cell of layout.cells) {
    const { x, y, w, h, text } = cell;
    g.save();
    g.beginPath(); g.rect(x, y, w, h); g.clip();
    if (cell.kind === 'street') {
      g.fillStyle = '#e8b818'; g.fillRect(x, y, w, h);
      g.strokeStyle = '#1a1406'; g.lineWidth = 4; g.strokeRect(x + 4, y + 4, w - 8, h - 8);
      const font = '700 {s}px "Helvetica Neue", "Arial Narrow", Arial, sans-serif';
      fit(g, text, font, w - 30, 34);
      g.fillStyle = '#15110a'; g.fillText(text, x + w / 2, y + h / 2 + 2);
    } else if (cell.kind === 'shop') {
      const S = SHOP_STYLES[cell.style % SHOP_STYLES.length];
      const gr = g.createLinearGradient(0, y, 0, y + h);
      gr.addColorStop(0, S.bg[0]); gr.addColorStop(1, S.bg[1]);
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.strokeStyle = S.edge; g.lineWidth = 3; g.strokeRect(x + 5, y + 5, w - 10, h - 10);
      fit(g, text, S.font, w - 36, 50);
      if (S.glow) { g.shadowColor = S.fg; g.shadowBlur = 14; }
      g.fillStyle = S.fg; g.fillText(text, x + w / 2, y + h / 2 + 3);
      if (S.glow) { g.shadowBlur = 0; g.fillStyle = S.edge; g.globalAlpha = 0.55; g.fillText(text, x + w / 2, y + h / 2 + 3); g.globalAlpha = 1; }
    } else {
      const S = BOARD_STYLES[cell.style % BOARD_STYLES.length];
      const gr = g.createLinearGradient(x, y, x + w, y + h);
      gr.addColorStop(0, S.bg[0]); gr.addColorStop(1, S.bg[1]);
      g.fillStyle = gr; g.fillRect(x, y, w, h);
      g.fillStyle = S.sub;
      for (let i = 0; i < 26; i++) { const bx = x + 10 + i * ((w - 20) / 26); g.beginPath(); g.arc(bx, y + 10, 4, 0, Math.PI * 2); g.arc(bx, y + h - 10, 4, 0, Math.PI * 2); g.fill(); }
      const font = '900 {s}px Impact, "Arial Black", sans-serif';
      fit(g, text, font, w - 50, 92);
      if (S.glow) { g.shadowColor = S.fg; g.shadowBlur = 22; }
      g.fillStyle = S.fg; g.fillText(text, x + w / 2, y + h / 2 - 8);
      g.shadowBlur = 0;
      g.font = '700 26px "Helvetica Neue", Arial, sans-serif';
      g.fillStyle = S.sub; g.fillText(['NOW PLAYING', 'TIMES SQUARE', 'SINCE 1922', 'NEW YORK'][cell.style % 4], x + w / 2, y + h - 34);
    }
    g.restore();
  }
  return c;
}
