import { readFileSync, writeFileSync } from 'fs';

let src = readFileSync('./src/BibleView.tsx', 'utf8');

const changes = [];
function rep(from, to) {
  const count = src.split(from).length - 1;
  if (count > 0) {
    src = src.split(from).join(to);
    changes.push(`  [${count}x] "${from}" → "${to}"`);
  }
}

// ── Primary text (high-opacity white → dark gray in light mode) ───────────
rep('rgba(255,255,255,0.88)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.85)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.9)',  'var(--wf-reader-text-1)');  // must be AFTER 0.09 check — but 0.9 ≠ 0.09
rep('rgba(255,255,255,0.80)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.8)',  'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.78)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.75)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.72)', 'var(--wf-reader-text-1)');
rep('rgba(255,255,255,0.7)',  'var(--wf-reader-text-1)');

// ── Secondary text ────────────────────────────────────────────────────────
rep('rgba(255,255,255,0.65)', 'var(--wf-reader-text-2)');
rep('rgba(255,255,255,0.5)',  'var(--wf-reader-text-2)');
rep('rgba(255,255,255,0.40)', 'var(--wf-reader-text-2)');
rep('rgba(255,255,255,0.4)',  'var(--wf-reader-text-2)');

// ── Muted text ───────────────────────────────────────────────────────────
rep('rgba(255,255,255,0.35)', 'var(--wf-reader-text-3)');
rep('rgba(255,255,255,0.30)', 'var(--wf-reader-text-3)');
rep('rgba(255,255,255,0.3)',  'var(--wf-reader-text-3)');
rep('rgba(255,255,255,0.25)', 'var(--wf-reader-text-3)');

// ── Very muted / captions ─────────────────────────────────────────────────
rep('rgba(255,255,255,0.20)', 'var(--wf-reader-text-4)');
rep('rgba(255,255,255,0.2)',  'var(--wf-reader-text-4)');
rep('rgba(255,255,255,0.18)', 'var(--wf-reader-text-4)');
rep('rgba(255,255,255,0.17)', 'var(--wf-reader-text-4)');
rep('rgba(255,255,255,0.15)', 'var(--wf-reader-text-4)');

// ── Borders ───────────────────────────────────────────────────────────────
rep('rgba(255,255,255,0.10)', 'var(--wf-reader-border)');
rep('rgba(255,255,255,0.09)', 'var(--wf-reader-border-s)');
rep('rgba(255,255,255,0.08)', 'var(--wf-reader-border-s)');
rep('rgba(255,255,255,0.07)', 'var(--wf-reader-border)');

// ── Surfaces (descending opacity) ─────────────────────────────────────────
rep('rgba(255,255,255,0.06)',  'var(--wf-reader-surface-hi)');
rep('rgba(255,255,255,0.05)',  'var(--wf-reader-surface)');
rep('rgba(255,255,255,0.04)',  'var(--wf-reader-surface-f)');
rep('rgba(255,255,255,0.025)', 'var(--wf-reader-surface-f)');
rep('rgba(255,255,255,0.03)',  'var(--wf-reader-surface-f)');
rep('rgba(255,255,255,0.018)', 'var(--wf-reader-surface-f)');
rep('rgba(255,255,255,0.015)', 'var(--wf-reader-surface-f)');

// ── Module / select backgrounds ───────────────────────────────────────────
rep('background: "var(--wf-bg1)"',   'background: "var(--wf-reader-bg)"');
rep('background: "var(--wf-bg2)"',   'background: "var(--wf-reader-sel-bg)"');

// ── Select element text color (quoted hex) ────────────────────────────────
rep('"#e2e8f0"', '"var(--wf-reader-sel-text)"');

console.log(`\nBibleView.tsx — ${changes.length} replacement types applied:\n`);
changes.forEach(c => console.log(c));

writeFileSync('./src/BibleView.tsx', src);
console.log('\n✅ Done! BibleView.tsx updated for light/dark mode support.\n');
