import { chromium } from '/home/anonymous/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:4174';
const LESSON = 'b1b20bea700000000000000000000001';
const OUT_DIR = '/home/anonymous/Work/qweeps/demos';
const TMP_RECORD = '/tmp/qweeps-demo2-raw';
const AUDIO_FILE = '/tmp/qweeps-demo2-audio.wav';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_RECORD, { recursive: true });
for (const f of readdirSync(TMP_RECORD)) unlinkSync(join(TMP_RECORD, f));
if (existsSync(AUDIO_FILE)) unlinkSync(AUDIO_FILE);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Make sure a private virtual sink exists so the browser's narration can be
// recorded without routing it to the speakers.
try {
  execSync('pactl list short sources | grep -q "qweeps.monitor"', { stdio: 'ignore' });
} catch {
  execSync('pactl load-module module-null-sink sink_name=qweeps sink_properties=device.description="QWEEPS Virtual Mic" object.linger=true', { stdio: 'ignore' });
}

const recorder = spawn('ffmpeg', ['-y', '-f', 'pulse', '-i', 'qweeps.monitor', '-ac', '1', '-ar', '48000', AUDIO_FILE], {
  stdio: ['ignore', 'ignore', 'pipe'],
});
let audioStderr = '';
recorder.stderr.on('data', chunk => { audioStderr += chunk.toString(); });
await sleep(300);

console.log('Launching browser for Demo 2 (Ask Qweeps branch mini-lesson)...');
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  ignoreDefaultArgs: ['--mute-audio'],
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
  env: { ...process.env, PULSE_SINK: 'qweeps' },
});

const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
  recordVideo: { dir: TMP_RECORD, size: { width: 1440, height: 900 } },
});
const videoStart = Date.now();
const page = await context.newPage();

console.log('Opening the QWEEPS website...');
await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(3500);

console.log('Opening the P vs NP lesson at Beat 7...');
await page.goto(`${BASE}/?lesson=${LESSON}&t=124.5`, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('.qweeps-live', { timeout: 30000 });
await page.waitForFunction(() => {
  const button = document.querySelector('.live-play');
  return button && !button.disabled && !!document.querySelector('img.native-production-frame');
}, { timeout: 90000 });
await page.waitForTimeout(1000);

console.log('Playing the witness beat briefly, then pausing...');
const playWall = Date.now();
await page.click('.live-play');
await page.waitForTimeout(3500);
await page.click('.live-play');
await page.waitForTimeout(700);

console.log('Asking QWEEPS: "Could you explain what a verifier is?"');
await page.click('button:has-text("Ask QWEEPS")');
await page.waitForSelector('#live-question-input');
const input = await page.$('#live-question-input');
await input.type('Could you explain what a verifier is?', { delay: 35 });
await page.waitForTimeout(700);
const chatWall = Date.now();
await page.click('button[aria-label="Send live lesson question"]');

console.log('Waiting for the branch mini-lesson...');
await page.waitForSelector('.live-return', { timeout: 60000 });
await page.waitForFunction(() => {
  const button = document.querySelector('.live-play');
  return button && !button.disabled;
}, { timeout: 30000 });

const branchDuration = await page.evaluate(() => {
  const text = document.querySelector('.live-playback span')?.textContent || '';
  const match = text.match(/\/\s*(\d+)\s*s/);
  return match ? Number(match[1]) : 62;
});
console.log(`Branch mini-lesson ready (${branchDuration}s across 3 beats). Playing all of it...`);
await page.waitForTimeout(1200);
const branchWall = Date.now();
await page.click('.live-play');

let last = -1;
let stalled = 0;
while (true) {
  await page.waitForTimeout(1000);
  const time = await page.evaluate(() => Number(document.querySelector('.qweeps-live')?.getAttribute('data-playhead')));
  if (time >= branchDuration - 0.8) break;
  if (time > last + 0.05) stalled = 0;
  else stalled += 1;
  if (stalled > 45) throw new Error(`Branch playback stalled at ${time.toFixed(1)}s / ${branchDuration}s`);
  last = time;
  if (Math.round(time) % 15 === 0) console.log(`  ${time.toFixed(1)} / ${branchDuration}s`);
}

await page.waitForTimeout(2000);
console.log('Returning to the saved parent lesson position...');
await page.click('.live-return');
await page.waitForTimeout(3000);

console.log('Demo 2 finished; closing recorder...');
await page.close();
await context.close();
await browser.close();

await new Promise(resolve => {
  recorder.once('exit', resolve);
  recorder.kill('SIGINT');
});
if (!existsSync(AUDIO_FILE)) throw new Error(`No audio captured.\n${audioStderr.slice(-1500)}`);

const recordedFiles = readdirSync(TMP_RECORD).filter(f => f.endsWith('.webm'));
if (!recordedFiles.length) throw new Error('No webm video found in ' + TMP_RECORD);
const rawWebm = join(TMP_RECORD, recordedFiles[0]);
console.log('Raw webm captured:', rawWebm);

const silence = execSync(`ffmpeg -hide_banner -i "${AUDIO_FILE}" -af silencedetect=noise=-45dB:d=0.15 -f null - 2>&1 || true`).toString();
const onsetMatch = silence.match(/silence_end:\s*([\d.]+)/);
const audioOnset = onsetMatch ? Number(onsetMatch[1]) : 0;
const playAt = Math.max(0, (playWall - videoStart) / 1000);
const delayMs = Math.round(playAt * 1000);
console.log(`Narration onset ${audioOnset.toFixed(2)}s · placed at ${playAt.toFixed(2)}s in the video`);

const mp4Path = join(OUT_DIR, 'demo2-ask-qweeps-full-branch.mp4');
console.log('Building MP4 with narration:', mp4Path);
execSync(
  `ffmpeg -y -i "${rawWebm}" -ss ${audioOnset.toFixed(3)} -i "${AUDIO_FILE}" ` +
  `-filter_complex "[1:a]adelay=delays=${delayMs}:all=1,apad[a]" -map 0:v -map "[a]" ` +
  `-c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -movflags +faststart ` +
  `-c:a aac -b:a 160k -shortest "${mp4Path}"`,
  { stdio: 'inherit' },
);

const gifPath = join(OUT_DIR, 'demo2-ask-qweeps-full-branch.gif');
console.log('Generating optimized GIF:', gifPath);
execSync(
  `ffmpeg -y -i "${mp4Path}" -vf "setpts=PTS/1.5,fps=12,scale=900:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 "${gifPath}"`,
  { stdio: 'inherit' },
);

console.log('Extracting preview images...');
const chatAt = Math.max(0, (chatWall - videoStart) / 1000 - 0.2);
const branchAt = Math.max(0, (branchWall - videoStart) / 1000 + 3);
execSync(`ffmpeg -y -ss ${chatAt.toFixed(3)} -i "${mp4Path}" -frames:v 1 -q:v 2 "${join(OUT_DIR, 'demo2-preview-chat.png')}"`, { stdio: 'inherit' });
execSync(`ffmpeg -y -ss ${branchAt.toFixed(3)} -i "${mp4Path}" -frames:v 1 -q:v 2 "${join(OUT_DIR, 'demo2-preview-branch.png')}"`, { stdio: 'inherit' });

console.log('Demo 2 generated successfully:');
console.log(' - MP4:', mp4Path);
console.log(' - GIF:', gifPath);
