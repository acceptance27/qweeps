import type { Request } from 'express';
import { randomUUID } from 'node:crypto';

const DEFAULT_MODEL = 'opencode-go/muse-spark-1.3-contributor';
const session = randomUUID();

// Keep the supplied schema declarations intact without loading a Gemini client.
export const Type = { OBJECT: 'OBJECT', ARRAY: 'ARRAY', INTEGER: 'INTEGER', STRING: 'STRING' } as const;
export const ThinkingLevel = { LOW: 'LOW' } as const;

/** Credentials arrive only on the server-to-server loopback proxy, never in the bundle. */
export function openCodeSettings(req: Request) {
  const requested = req.get('X-Qweeps-AI-Model') || DEFAULT_MODEL;
  return {
    model: requested.startsWith('opencode-go/') ? requested : DEFAULT_MODEL,
    key: (req.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim(),
    sessionId: req.get('X-Qweeps-AI-Session') || session,
    effort: (req.get('X-Qweeps-AI-Effort') || 'low').trim().toLowerCase(),
  };
}

interface GenerationRequest {
  model: string;
  contents: string;
  config: {
    systemInstruction: string;
    thinkingConfig: { thinkingLevel: string };
    responseMimeType: string;
    responseSchema: object;
  };
}

/** Translate the transport only: retain the ZIP's system/user text and JSON contract. */
export function createOpenCodeClient(
  settings: { model: string; key: string; sessionId: string; effort?: string },
  fetcher: typeof fetch = fetch,
) {
  if (!settings.key) throw new Error('Set your OpenCode Go API key in QWEEPS Settings / API.');
  const apiModel = settings.model.replace(/^opencode-go\//, '');
  return {
    model: settings.model,
    models: {
      async generateContent(request: GenerationRequest): Promise<{ text: string }> {
        // Google schema types are uppercase; JSON Schema uses lowercase names.
        const schema = JSON.parse(JSON.stringify(request.config.responseSchema), (key, value) =>
          key === 'type' && typeof value === 'string' ? value.toLowerCase() : value,
        );
        const format = { type: 'json_schema', name: 'qweeps_architecture', schema };
        const messages = [
          { role: 'system', content: request.config.systemInstruction },
          { role: 'user', content: request.contents },
        ];
        // Muse uses the Responses API; the other models in QWEEPS' Go selector
        // use the OpenAI-compatible chat endpoint.
        const responses = apiModel.startsWith('muse-');
        const payload = responses ? {
          model: apiModel,
          input: messages,
          max_output_tokens: 16000,
          reasoning: { effort: request.config.thinkingConfig.thinkingLevel.toLowerCase() },
          text: { format },
          store: false,
        } : {
          model: apiModel,
          messages,
          max_tokens: 16000,
          reasoning_effort: request.config.thinkingConfig.thinkingLevel.toLowerCase(),
          response_format: { type: 'json_schema', json_schema: { name: format.name, schema } },
        };
        const response = await fetcher(
          `https://opencode.ai/inference/go/openai/v1/${responses ? 'responses' : 'chat/completions'}`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${settings.key}`,
              'User-Agent': 'qweeps-visual/0.2',
              'x-opencode-session': settings.sessionId,
            },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(280_000),
          },
        );
        // Do not reflect upstream bodies: they can contain request data or credentials.
        if (!response.ok) throw new Error(`OpenCode Go could not complete the request (HTTP ${response.status}).`);
        const data = await response.json();
        if (data.error || (responses && data.status && data.status !== 'completed') ||
            (!responses && data.choices?.[0]?.finish_reason !== 'stop')) {
          throw new Error('OpenCode Go did not return a complete response.');
        }
        const text = responses
          ? (data.output_text || (data.output || []).filter((item: { type: string }) => item.type === 'message')
            .flatMap((item: { content?: { type: string; text?: string }[] }) => item.content || [])
            .filter((part: { type: string }) => part.type === 'output_text')
            .map((part: { text?: string }) => part.text).join(''))
          : data.choices?.[0]?.message?.content;
        if (typeof text !== 'string' || !text.trim()) throw new Error('OpenCode Go returned no complete response.');
        return { text };
      },
    },
  };
}
