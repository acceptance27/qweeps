import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { createOpenCodeClient } from '../../../vendor/architecture-remix/opencode';

const settings = { model: 'opencode-go/muse-spark-1.3-contributor', key: 'test-key', sessionId: 'test-session' };
const request = {
  model: settings.model,
  contents: 'Learner question, source code and trace values — exactly as supplied.',
  config: {
    systemInstruction: 'Keep the original tutor instructions verbatim.',
    thinkingConfig: { thinkingLevel: 'LOW' },
    responseMimeType: 'application/json',
    responseSchema: { type: 'OBJECT', properties: { answer: { type: 'STRING' }, codeLines: { type: 'ARRAY', items: { type: 'INTEGER' } } }, required: ['answer', 'codeLines'] },
  },
};

test('both ZIP prompts, system instructions and response schemas remain byte-for-byte unchanged', () => {
  const server = fs.readFileSync(new URL('../../../vendor/architecture-remix/server.ts', import.meta.url), 'utf8');
  const hashes = (pattern: RegExp) => [...server.matchAll(pattern)].map(m => createHash('sha256').update(m[1]).digest('hex'));
  assert.deepEqual(hashes(/const prompt = (`[\s\S]*?`);\n\n      const response/g), [
    'c4ed61e7550a00e97ff8cea5212383fa5348787c61fe3395efb106e25238e851',
    '827aa55ea4f26c81ada7cb7688501b65ac8cf62aa07724234688ad613873a4c0',
  ]);
  assert.deepEqual(hashes(/systemInstruction:\s*('.*?'),\n/g), [
    'fc8e2c38f3b5cb8cd595b0b048da67639efe127dd2598bbf13dbaeedcb336534',
    'c2a7e08080ed93b61a920cf4af5c488e4e6cccfe17f0445f83ec672e2ba1521c',
  ]);
  assert.deepEqual(hashes(/responseSchema: (\{[\s\S]*?\n          \}),\n        \},/g), [
    '5ef04363c834926a9009da664e722c1ab849cef28e12ed27d11a0ea14a9fad1e',
    '1ae709eac3412031c9645d10548807cf5ea353b5640db8f795422a71eba745c0',
  ]);
});

test('Muse uses Go Responses with original instructions and equivalent JSON Schema', async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://opencode.ai/inference/go/openai/v1/responses');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'muse-spark-1.3-contributor');
    assert.deepEqual(body.input, [{ role: 'system', content: request.config.systemInstruction }, { role: 'user', content: request.contents }]);
    assert.deepEqual(body.text.format.schema, { type: 'object', properties: { answer: { type: 'string' }, codeLines: { type: 'array', items: { type: 'integer' } } }, required: ['answer', 'codeLines'] });
    const headers = new Headers(init!.headers);
    assert.equal(headers.get('authorization'), 'Bearer test-key');
    assert.equal(headers.get('x-opencode-session'), 'test-session');
    return Response.json({ status: 'completed', output: [{ type: 'reasoning', summary: [] }, { type: 'message', content: [{ type: 'output_text', text: '{"answer":"Grounded answer","codeLines":[1]}' }] }] });
  };
  assert.deepEqual(await createOpenCodeClient(settings, fake).models.generateContent(request), { text: '{"answer":"Grounded answer","codeLines":[1]}' });
});

test('other configured Go models use chat completions and retain the same messages', async () => {
  const fake: typeof fetch = async (url, init) => {
    assert.equal(url, 'https://opencode.ai/inference/go/openai/v1/chat/completions');
    const body = JSON.parse(init!.body as string);
    assert.equal(body.model, 'deepseek-v4.1-flash');
    assert.equal(body.messages[0].content, request.config.systemInstruction);
    assert.equal(body.messages[1].content, request.contents);
    assert.equal(body.response_format.json_schema.schema.properties.answer.type, 'string');
    return Response.json({ choices: [{ finish_reason: 'stop', message: { content: '{"answer":"ok"}' } }] });
  };
  assert.equal((await createOpenCodeClient({ ...settings, model: 'opencode-go/deepseek-v4.1-flash' }, fake).models.generateContent(request)).text, '{"answer":"ok"}');
});

test('Go failures never trigger Gemini or a paid fallback and do not echo upstream secrets', async () => {
  assert.throws(() => createOpenCodeClient({ ...settings, key: '' }), /QWEEPS Settings/);
  let calls = 0;
  const fake: typeof fetch = async () => { calls++; return new Response('test-key', { status: 429 }); };
  await assert.rejects(createOpenCodeClient(settings, fake).models.generateContent(request), /^Error: OpenCode Go could not complete the request \(HTTP 429\)\.$/);
  assert.equal(calls, 1);
  await assert.rejects(createOpenCodeClient(settings, async () => Response.json({ status: 'incomplete', output_text: '{"partial":' })).models.generateContent(request), /complete response/);
  await assert.rejects(createOpenCodeClient(settings, async () => Response.json({ status: 'completed', output: [] })).models.generateContent(request), /no complete response/);
});
