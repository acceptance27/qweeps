import { chromium } from '/home/anonymous/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, renameSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '/home/anonymous/Work/qweeps/demos';
mkdirSync(OUT_DIR, { recursive: true });
const TMP_RECORD = '/tmp/qweeps-demo1-raw';
mkdirSync(TMP_RECORD, { recursive: true });
// clean previous
for (const f of readdirSync(TMP_RECORD)) unlinkSync(join(TMP_RECORD, f));

console.log('Launching browser for Demo 1 (New Lesson in Browser)...');
const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const context = await browser.newContext({
  viewport: { width: 1280, height: 760 },
  recordVideo: {
    dir: TMP_RECORD,
    size: { width: 1280, height: 760 }
  }
});

const page = await context.newPage();

// Load demo-frame wrapping Binary Search
console.log('Navigating to demo-frame with Binary Search lesson...');
await page.goto('http://127.0.0.1:4174/demo-frame.html?lesson=1ac198aec0efc9ba04dfa14bd242bd33&nosync=1');

// Wait for iframe content to load
const frameElement = await page.waitForSelector('#app-frame');
const frame = await frameElement.contentFrame();

console.log('Waiting for player to initialize...');
await frame.waitForSelector('.qweeps-live', { timeout: 15000 });
await page.waitForTimeout(2000);

// Click Play if not already playing
const playBtn = await frame.waitForSelector('.live-play');
console.log('Starting playback...');
await playBtn.click();
await page.waitForTimeout(4000);

// Let Beat 1 play for 4 seconds
console.log('Playing Beat 1 (Sorted Is Required)...');
await page.waitForTimeout(4000);

// Step to Beat 2 (The Mid Decision)
console.log('Stepping to Beat 2 (The Mid Decision)...');
const nextBtn = await frame.$('button[aria-label="Next chapter"]');
if (nextBtn) {
  await nextBtn.click();
  await page.waitForTimeout(6000);
}

// Step to Beat 4 (Why Halving Is Fast)
console.log('Stepping to Beat 4 (Why Halving Is Fast)...');
// Click chapter 4 button in timeline
const chBtns = await frame.$$('.live-chapters button');
if (chBtns && chBtns.length >= 4) {
  await chBtns[3].click();
  await page.waitForTimeout(6000);
}

// Hover over an experiment choice or card
console.log('Interacting with live stage...');
const nodeCards = await frame.$$('.live-stage-wrap .live-card, .live-stage-wrap g[id]');
if (nodeCards && nodeCards.length > 0) {
  await nodeCards[0].hover();
  await page.waitForTimeout(1500);
}

// Step to Beat 6 (Remember the Four Stops)
console.log('Stepping to Beat 6 (Loci Recall Route)...');
if (chBtns && chBtns.length >= 6) {
  await chBtns[5].click();
  await page.waitForTimeout(5000);
}

console.log('Finishing Demo 1 recording...');
await page.waitForTimeout(1000);
await page.close();
await context.close();
await browser.close();

const recordedFiles = readdirSync(TMP_RECORD).filter(f => f.endsWith('.webm'));
if (!recordedFiles.length) throw new Error('No webm video found in ' + TMP_RECORD);
const rawWebm = join(TMP_RECORD, recordedFiles[0]);
console.log('Raw webm captured:', rawWebm);

// Convert to high-quality MP4 for GitHub
const mp4Path = join(OUT_DIR, 'demo1-browser-lesson.mp4');
console.log('Converting to MP4:', mp4Path);
execSync(`ffmpeg -y -i "${rawWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`, { stdio: 'inherit' });

// Generate high quality optimized GIF for GitHub README
const gifPath = join(OUT_DIR, 'demo1-browser-lesson.gif');
console.log('Generating optimized GIF:', gifPath);
execSync(`ffmpeg -y -ss 0 -t 24 -i "${rawWebm}" -vf "fps=15,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`, { stdio: 'inherit' });

console.log('Demo 1 generated successfully:');
console.log(' - MP4:', mp4Path);
console.log(' - GIF:', gifPath);
