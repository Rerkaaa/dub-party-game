import { readFile } from 'node:fs/promises';

const [app, html] = await Promise.all([
  readFile(new URL('../app.js', import.meta.url), 'utf8'),
  readFile(new URL('../index.html', import.meta.url), 'utf8')
]);
for (const [name, token] of [
  ['playback resynchronization', 'syncDubToVideo'],
  ['recording time limit', 'RECORDING_LIMIT_SECONDS'],
  ['timestamp validation', 'validateLines'],
  ['accessible step state', 'aria-current'],
  ['line status message', 'lineNotice']
]) {
  if (!(app.includes(token) || html.includes(token))) throw new Error(`Missing ${name}.`);
}
console.log('Static checks passed.');
