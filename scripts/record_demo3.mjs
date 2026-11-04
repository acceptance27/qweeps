import { chromium } from '/home/anonymous/.npm/_npx/9833c18b2d85bc59/node_modules/playwright-core/index.mjs';
import { execSync, spawn } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'http://127.0.0.1:4174';
const LESSON = 'b1b20bea700000000000000000000001';
const OUT_DIR = '/home/anonymous/Work/qweeps/demos';
const TMP_RECORD = '/tmp/qweeps-demo3-raw';
const AUDIO_FILE = '/tmp/qweeps-demo3-audio.wav';
mkdirSync(OUT_DIR, { recursive: true });
mkdirSync(TMP_RECORD, { recursive: true });
for (const f of readdirSync(TMP_RECORD)) unlinkSync(join(TMP_RECORD, f));
if (existsSync(AUDIO_FILE)) unlinkSync(AUDIO_FILE);

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

// Private virtual sink for the quiz's synthesized feedback sounds.
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

const quizResponse = await fetch(`${BASE}/api/visual/live/quiz`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ lessonId: LESSON }),
});
const quiz = await quizResponse.json();
if (!quiz?.quiz?.length) throw new Error('The P vs NP quiz could not be loaded.');
const correctByPrompt = new Map(quiz.quiz.map(q => [q.prompt, q.options[q.correctIndex]]));
console.log(`Loaded ${quiz.quiz.length} P vs NP quiz cards.`);

console.log('Launching browser for Demo 3 (P vs NP reinforcement quiz)...');
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

console.log('Opening the QWEEPS generated-lesson list...');
await page.goto(`${BASE}/?home=1`, { waitUntil: 'networkidle' });

const row = page.locator('.live-generated-lesson-row', { hasText: 'P vs NP' }).first();
await row.scrollIntoViewIfNeeded();
await page.waitForTimeout(1600);
console.log('Opening the 20-card quiz from the P vs NP row...');
await row.locator('.live-generated-lesson-quiz-btn').click();
await page.waitForSelector('.standalone-quiz-container .mastery-prompt', { timeout: 30000 });
await page.waitForTimeout(1800);

const prompt = async () => (await page.$eval('.mastery-prompt', e => e.textContent?.trim())) || '';
const optionButtons = () => page.locator('.mastery-option-btn');

async function clickOptionByText(text) {
  const buttons = optionButtons();
  const count = await buttons.count();
  const needle = text.replace(/\s+/g, ' ').slice(0, 55);
  for (let i = 0; i < count; i++) {
    const label = (await buttons.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    if (label.includes(needle)) {
      await buttons.nth(i).click();
      return i;
    }
  }
  throw new Error(`Could not find option: ${needle}`);
}

async function clickWrongOption(correctText) {
  const buttons = optionButtons();
  const count = await buttons.count();
  const needle = correctText.replace(/\s+/g, ' ').slice(0, 55);
  for (let i = 0; i < count; i++) {
    const label = (await buttons.nth(i).innerText()).replace(/\s+/g, ' ').trim();
    if (!label.includes(needle)) {
      await buttons.nth(i).click();
      return i;
    }
  }
  throw new Error('Could not find a distractor option.');
}

async function nextQuestion() {
  const next = page.locator('.mastery-continue-btn', { hasText: 'Next Question' }).first();
  if (await next.count()) {
    await next.click();
    await page.waitForTimeout(650);
  }
}

let firstAnswerWall = null;
const planned = [
  { kind: 'correct', wait: 2800, note: 'Q1 correct' },
  { kind: 'correct', wait: 2300, note: 'Q2 correct' },
  { kind: 'wrong', wait: 3500, note: 'Q3 missed on purpose' },
  { kind: 'correct', wait: 2300, note: 'Q4 correct' },
  { kind: 'correct', wait: 2300, note: 'Q5 correct' },
  { kind: 'correct', wait: 3600, note: 'Q3 spaced-recall retry' },
];

for (let i = 0; i < planned.length; i++) {
  const step = planned[i];
  const question = await prompt();
  const correct = correctByPrompt.get(question);
  if (!correct) throw new Error(`No answer key for prompt: ${question}`);
  if (i === 0) firstAnswerWall = Date.now();
  const index = step.kind === 'wrong'
    ? await clickWrongOption(correct)
    : await clickOptionByText(correct);
  console.log(`${step.note}: option ${String.fromCharCode(65 + index)} · ${question}`);
  await page.waitForTimeout(step.wait);
  if (i < planned.length - 1) await nextQuestion();
}

// Let the mastery state settle, then return to the main menu.
await page.waitForTimeout(700);
const exit = page.locator('.standalone-quiz-exit-btn').first();
if (await exit.count()) {
  console.log('Returning to the main menu...');
  await exit.click();
  await page.waitForTimeout(2200);
}

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
const firstAnswerAt = Math.max(0, ((firstAnswerWall || videoStart) - videoStart) / 1000);
const delayMs = Math.round(firstAnswerAt * 1000);
console.log(`First feedback sound at ${audioOnset.toFixed(2)}s · placed at ${firstAnswerAt.toFixed(2)}s in the video`);

const mp4Path = join(OUT_DIR, 'demo3-quiz-p-vs-np.mp4');
console.log('Building MP4 with feedback audio:', mp4Path);
execSync(
  `ffmpeg -y -i "${rawWebm}" -ss ${audioOnset.toFixed(3)} -i "${AUDIO_FILE}" ` +
  `-filter_complex "[1:a]adelay=delays=${delayMs}:all=1,apad[a]" -map 0:v -map "[a]" ` +
  `-c:v libx264 -preset slow -crf 21 -pix_fmt yuv420p -movflags +faststart ` +
  `-c:a aac -b:a 160k -shortest "${mp4Path}"`,
  { stdio: 'inherit' },
);

const gifPath = join(OUT_DIR, 'demo3-quiz-p-vs-np.gif');
console.log('Generating optimized GIF:', gifPath);
execSync(
  `ffmpeg -y -i "${mp4Path}" -vf "fps=12,scale=1000:-1:flags=lanczos,split[s0][s1];[s0]palettegen=max_colors=128:stats_mode=diff[p];[s1][p]paletteuse=dither=bayer:bayer_scale=3" -loop 0 "${gifPath}"`,
  { stdio: 'inherit' },
);

console.log('Extracting preview image...');
const previewAt = Math.max(0, firstAnswerAt + 1.2);
execSync(`ffmpeg -y -ss ${previewAt.toFixed(3)} -i "${mp4Path}" -frames:v 1 -q:v 2 "${join(OUT_DIR, 'demo3-preview-quiz.png')}"`, { stdio: 'inherit' });

console.log('Demo 3 generated successfully:');
console.log(' - MP4:', mp4Path);
console.log(' - GIF:', gifPath);
