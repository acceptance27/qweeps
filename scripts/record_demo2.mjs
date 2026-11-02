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

const recordingStartTime = Date.now();
const page = await context.newPage();

console.log('Loading P vs NP lesson at Beat 7 (t=124.5s)...');
await page.goto('http://127.0.0.1:4174/demo-frame.html?lesson=b1b20bea700000000000000000000001&t=124.5&nosync=1');

const frameElement = await page.waitForSelector('#app-frame');
const frame = await frameElement.contentFrame();

console.log('Waiting for player to initialize...');
await frame.waitForSelector('.qweeps-live', { timeout: 15000 });

console.log('Waiting for native ManimGL scene frame to be ready...');
await frame.waitForSelector('img.native-production-frame', { timeout: 40000 });
console.log('Native scene is ready!');

// Let the initial frame settle so the recording starts crisp and active
await page.waitForTimeout(1000);

// MARK THE START OF THE USER DEMONSTRATION
const actionStartTime = Date.now();
console.log('>>> Action start marked at', ((actionStartTime - recordingStartTime) / 1000).toFixed(2) + 's');

// 1. Play Beat 7 for a few seconds
const playBtn = await frame.waitForSelector('.live-play');
await playBtn.click();
console.log('Playing Beat 7: The Witness Protocol V(x, w)...');
await page.waitForTimeout(3500);

// 2. Pause the lesson
await playBtn.click();
console.log('Paused at Beat 7. Opening Ask QWEEPS drawer...');
await page.waitForTimeout(800);

// 3. Click "Ask QWEEPS" in the footer
const askQweepsBtn = await frame.waitForSelector('button:has-text("Ask QWEEPS")');
await askQweepsBtn.click();
await page.waitForTimeout(1200);

// 4. Type the question into the drawer
console.log('Typing question: "Could you explain what a verifier is?"...');
const textarea = await frame.waitForSelector('#live-question-input');
const questionText = 'Could you explain what a verifier is?';
for (const char of questionText) {
  await textarea.type(char, { delay: 40 });
}
await page.waitForTimeout(1000);

// 5. Click "Branch mini-lesson"
console.log('Clicking Branch mini-lesson button...');
const branchBtn = await frame.waitForSelector('button[aria-label="Send live lesson question"]');
await branchBtn.click();

// 6. Wait for transition into the focused mini-lesson
console.log('Waiting for branch mini-lesson transition...');
await frame.waitForSelector('.live-return', { timeout: 25000 });
console.log('Transitioned into Branch Mini-Lesson!');
await page.waitForTimeout(2500);

// 7. Play Beat 1 of mini-lesson (Why We Need a Verifier)
const branchPlayBtn = await frame.waitForSelector('.live-play');
await branchPlayBtn.click();
console.log('Playing Mini-Lesson Beat 1...');
await page.waitForTimeout(4500);

// 8. Step to Beat 2 of mini-lesson (Inside the Verifier Gate)
console.log('Stepping to Mini-Lesson Beat 2...');
const nextBtn = await frame.$('button[aria-label="Next chapter"]');
if (nextBtn) {
  await nextBtn.click();
  await page.waitForTimeout(5000);
}

// 9. Step to Beat 3 of mini-lesson (The Two Laws of an NP Verifier)
console.log('Stepping to Mini-Lesson Beat 3...');
if (nextBtn) {
  await nextBtn.click();
  await page.waitForTimeout(4000);
}

// 10. Click "Return to saved place" breadcrumb
console.log('Clicking Return to parent lesson...');
const returnBtn = await frame.waitForSelector('.live-return');
await returnBtn.click();
await page.waitForTimeout(3000);

console.log('Returned to parent lesson at saved place!');
await page.waitForTimeout(1500);

// MARK THE END OF THE USER DEMONSTRATION
const actionEndTime = Date.now();
console.log('>>> Action end marked at', ((actionEndTime - recordingStartTime) / 1000).toFixed(2) + 's');

await page.close();
await context.close();
await browser.close();

const recordedFiles = readdirSync(TMP_RECORD).filter(f => f.endsWith('.webm'));
if (!recordedFiles.length) throw new Error('No webm video found in ' + TMP_RECORD);
const rawWebm = join(TMP_RECORD, recordedFiles[0]);
console.log('Raw webm captured:', rawWebm);

const startOffset = Math.max(0, (actionStartTime - recordingStartTime) / 1000);
const duration = (actionEndTime - actionStartTime) / 1000;
console.log(`Trimming demo from ${startOffset.toFixed(2)}s for duration ${duration.toFixed(2)}s`);

const mp4Path = join(OUT_DIR, 'demo2-ask-qweeps-branch.mp4');
console.log('Converting to MP4:', mp4Path);
execSync(`ffmpeg -y -ss ${startOffset.toFixed(2)} -t ${duration.toFixed(2)} -i "${rawWebm}" -c:v libx264 -preset slow -crf 20 -pix_fmt yuv420p -movflags +faststart "${mp4Path}"`, { stdio: 'inherit' });

const gifPath = join(OUT_DIR, 'demo2-ask-qweeps-branch.gif');
console.log('Generating optimized GIF:', gifPath);
execSync(`ffmpeg -y -ss ${startOffset.toFixed(2)} -t ${duration.toFixed(2)} -i "${rawWebm}" -vf "fps=14,scale=960:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" "${gifPath}"`, { stdio: 'inherit' });

// Extract preview screenshots from MP4
console.log('Extracting preview images...');
execSync(`ffmpeg -y -ss 00:00:06.500 -i "${mp4Path}" -frames:v 1 -q:v 2 "${join(OUT_DIR, 'demo2-preview-chat.png')}"`, { stdio: 'inherit' });
execSync(`ffmpeg -y -ss 00:00:13.500 -i "${mp4Path}" -frames:v 1 -q:v 2 "${join(OUT_DIR, 'demo2-preview-branch.png')}"`, { stdio: 'inherit' });

console.log('Demo 2 generated successfully:');
console.log(' - MP4:', mp4Path);
console.log(' - GIF:', gifPath);
