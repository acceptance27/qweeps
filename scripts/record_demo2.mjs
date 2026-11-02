import { chromium } from '/home/anonymous/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs';
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const OUT_DIR = '/home/anonymous/Work/qweeps/demos';
mkdirSync(OUT_DIR, { recursive: true });
const TMP_RECORD = '/tmp/qweeps-demo2-raw';
mkdirSync(TMP_RECORD, { recursive: true });
for (const f of readdirSync(TMP_RECORD)) unlinkSync(join(TMP_RECORD, f));

console.log('Launching browser for Demo 2 (Ask Qweeps Branch Mini-Lesson)...');
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

console.log('Loading P vs NP lesson at Beat 7 (t=124.5s)...');
await page.goto('http://127.0.0.1:4174/demo-frame.html?lesson=b1b20bea700000000000000000000001&t=124.5&nosync=1');

const frameElement = await page.waitForSelector('#app-frame');
const frame = await frameElement.contentFrame();

await frame.waitForSelector('.qweeps-live', { timeout: 15000 });
await page.waitForTimeout(1500);

// Play a few seconds of Beat 7
const playBtn = await frame.waitForSelector('.live-play');
await playBtn.click();
console.log('Playing Beat 7: The Verifier...');
await page.waitForTimeout(3500);

// Pause
await playBtn.click();
await page.waitForTimeout(1000);

// Click "Ask QWEEPS"
console.log('Opening Ask Qweeps side panel...');
const askQweepsBtn = await frame.waitForSelector('button:has-text("Ask QWEEPS")');
await askQweepsBtn.click();
await page.waitForTimeout(1500);

// Type the question
console.log('Typing question: "Could you explain what a verifier is?"...');
const textarea = await frame.waitForSelector('#live-question-input');
const questionText = 'Could you explain what a verifier is?';
for (const char of questionText) {
  await textarea.type(char, { delay: 45 });
}
await page.waitForTimeout(1000);

// Click "Branch mini-lesson"
console.log('Clicking Branch mini-lesson...');
const branchBtn = await frame.waitForSelector('button[aria-label="Send live lesson question"]');
await branchBtn.click();

// Wait for branch to prepare and transition into mini-lesson
console.log('Waiting for branch mini-lesson transition...');
await frame.waitForSelector('.live-return', { timeout: 25000 });
console.log('Transitioned into Branch Mini-Lesson!');
await page.waitForTimeout(3000);

// Play Beat 1 of mini-lesson
const branchPlayBtn = await frame.waitForSelector('.live-play');
await branchPlayBtn.click();
console.log('Playing Mini-Lesson Beat 1...');
await page.waitForTimeout(5000);

// Step to Beat 2 of mini-lesson (ManimGL scene)
console.log('Stepping to Mini-Lesson Beat 2 (ManimGL geometry)...');
const nextBtn = await frame.$('button[aria-label="Next chapter"]');
if (nextBtn) {
  await nextBtn.click();
  await page.waitForTimeout(6000);
}

// Click "Return to saved place"
console.log('Clicking Return to parent lesson...');
const returnBtn = await frame.waitForSelector('.live-return');
await returnBtn.click();
await page.waitForTimeout(3000);

console.log('Returned to parent lesson at Beat 7!');
await page.waitForTimeout(1500);

await page.close();
await context.close();
await browser.close();

const recordedFiles = readdirSync(TMP_RECORD).filter(f => f.endsWith('.webm'));
if (!recordedFiles.length) throw new Error('No webm video found in ' + TMP_RECORD);
const rawWebm = join(TMP_RECORD, recordedFiles[0]);
console.log('Raw webm captured:', rawWebm);

const mp4Path = join(OUT_DIR, 'demo2-ask-qweeps-branch.mp4');
console.log('Converting to MP4:', mp4Path);
execSync(`ffmpeg -y -i "${rawWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`, { stdio: 'inherit' });

const gifPath = join(OUT_DIR, 'demo2-ask-qweeps-branch.gif');
console.log('Generating optimized GIF:', gifPath);
execSync(`ffmpeg -y -ss 0 -t 28 -i "${rawWebm}" -vf "fps=15,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`, { stdio: 'inherit' });

console.log('Demo 2 generated successfully:');
console.log(' - MP4:', mp4Path);
console.log(' - GIF:', gifPath);
