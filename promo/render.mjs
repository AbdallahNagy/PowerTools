// Renders promo.html frame by frame and encodes power-tools-promo.mp4.
// Usage: node render.mjs <path-to-ffmpeg> [--frames a,b,c]
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire(path.join(here, '../desktop/package.json'));
const { chromium } = require('playwright');

const ffmpeg = process.argv[2];
const stillsArg = process.argv.indexOf('--frames');
const stills = stillsArg > 0 ? process.argv[stillsArg + 1].split(',').map(Number) : null;

const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(path.join(here, 'promo.html')).href + '?render');
await page.evaluate(() => document.fonts.ready);
await page.waitForLoadState('networkidle');
const { fps, duration } = await page.evaluate(() => ({ fps: window.FPS, duration: window.DURATION }));

if (stills) {
  fs.mkdirSync(path.join(here, 'stills'), { recursive: true });
  for (const s of stills) {
    await page.evaluate(t => window.render(t), s);
    await page.screenshot({ path: path.join(here, 'stills', `t${s}.png`) });
  }
  await browser.close();
  process.exit(0);
}

const out = path.join(here, 'power-tools-promo.mp4');
const ff = spawn(ffmpeg, [
  '-y', '-f', 'image2pipe', '-framerate', String(fps), '-c:v', 'mjpeg', '-i', '-',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '18', '-preset', 'slow', '-movflags', '+faststart', out
], { stdio: ['pipe', 'inherit', 'inherit'] });

const total = fps * duration;
for (let f = 0; f < total; f++) {
  await page.evaluate(t => window.render(t), f / fps);
  const buf = await page.screenshot({ type: 'jpeg', quality: 95 });
  if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
  if (f % 90 === 0) console.log(`frame ${f}/${total}`);
}
ff.stdin.end();
await new Promise(r => ff.on('close', r));
await browser.close();
console.log('wrote', out);
