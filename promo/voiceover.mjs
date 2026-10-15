// Generates the promo voiceover: one neural-voice clip per line, placed on the
// scene timeline from promo.html, mixed with a soft ambient bed into voiceover.m4a.
// Usage: node voiceover.mjs <path-to-ffmpeg> [path-to-dir-with-msedge-tts-node_modules]
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const ffmpeg = process.argv[2];
const require = createRequire(path.join(process.argv[3] || here, 'package.json'));
const { MsEdgeTTS, OUTPUT_FORMAT } = require('msedge-tts');

const VOICE = process.env.VOICE || 'en-US-BrianMultilingualNeural';

// [start seconds, text, rate]. Starts follow the scene timings in promo.html.
const LINES = [
  [0.7, 'Meet Power Tools.', '+0%'],
  [4.5, 'Dataverse tooling… that actually feels easy.', '+0%'],
  [8.6, 'Ten tools. One workspace. Everything you need, right where you need it.', '+4%'],
  [15.2, 'Built for the work you do every day.', '+0%'],
  [18.2, 'Like moving data between environments. In a few clicks.', '+10%'],
  [21.95, 'And your data? It stays on your machine. No middleman.', '+0%'],
  [26.7, 'Power Tools. Free, and open source.', '+0%'],
];
const DURATION = 30;

const tmp = path.join(here, '.vo');
fs.mkdirSync(tmp, { recursive: true });

const tts = new MsEdgeTTS();
await tts.setMetadata(VOICE, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);

const clips = [];
for (const [i, [start, text, rate]] of LINES.entries()) {
  const file = path.join(tmp, `line${i}.mp3`);
  const { audioStream } = tts.toStream(text, { rate });
  const chunks = [];
  for await (const c of audioStream) chunks.push(c);
  fs.writeFileSync(file, Buffer.concat(chunks));
  const probe = spawnSync(ffmpeg, ['-i', file, '-f', 'null', '-'], { encoding: 'utf8' }).stderr;
  const m = probe.match(/time=(\d+):(\d+):([\d.]+)/g)?.pop()?.match(/(\d+):(\d+):([\d.]+)/);
  const len = m ? +m[1] * 3600 + +m[2] * 60 + +m[3] : NaN;
  const next = LINES[i + 1]?.[0] ?? DURATION;
  console.log(`line ${i}: ${start.toFixed(1)}s +${len.toFixed(2)}s ${start + len > next - 0.1 ? '  <-- overlaps next' : ''}`);
  clips.push({ file, start });
}
tts.close();

// Ambient bed: low A-minor pad with slow tremolo, plus a soft riser into the end card.
const pad = `aevalsrc='0.22*sin(2*PI*110*t)+0.16*sin(2*PI*164.81*t)+0.12*sin(2*PI*220*t)+0.08*sin(2*PI*261.63*t)+0.05*sin(2*PI*329.63*t)':s=48000:d=${DURATION}`;
const inputs = clips.flatMap(c => ['-i', c.file]);
const voiceChain = clips.map((c, i) =>
  `[${i + 1}:a]aresample=48000,adelay=${Math.round(c.start * 1000)}|${Math.round(c.start * 1000)}[v${i}]`).join(';');
const filter = [
  `[0:a]lowpass=f=900,tremolo=f=0.25:d=0.5,volume='0.18+0.22*between(t,26.2,29.5)':eval=frame,afade=t=in:d=2,afade=t=out:st=${DURATION - 2.5}:d=2.5,aformat=channel_layouts=stereo[bed]`,
  voiceChain,
  `${clips.map((_, i) => `[v${i}]`).join('')}amix=inputs=${clips.length}:normalize=0,acompressor=threshold=0.1:ratio=3:attack=5:release=120,equalizer=f=180:t=q:w=1:g=2,equalizer=f=4000:t=q:w=1:g=2,aformat=channel_layouts=stereo,asplit=2[vo][sc]`,
  `[bed][sc]sidechaincompress=threshold=0.03:ratio=6:attack=20:release=400[duck]`,
  `[duck][vo]amix=inputs=2:normalize=0,loudnorm=I=-16:TP=-1.5:LRA=11,atrim=0:${DURATION}[out]`,
].join(';');

const out = path.join(here, 'voiceover.m4a');
const r = spawnSync(ffmpeg, ['-y', '-f', 'lavfi', '-i', pad, ...inputs,
  '-filter_complex', filter, '-map', '[out]', '-ar', '48000', '-c:a', 'aac', '-b:a', '192k', out], { stdio: 'inherit' });
if (r.status !== 0) process.exit(r.status);
fs.rmSync(tmp, { recursive: true, force: true });
console.log('wrote', out);
