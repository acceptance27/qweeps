import dotenv from 'dotenv';
import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {mkdir,readFile,readdir,writeFile,rename} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import os from 'node:os';

dotenv.config({path:path.join(path.dirname(fileURLToPath(import.meta.url)),'.env'),quiet:true});

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function getGenAIClient(): GoogleGenAI {
  if(!process.env.GEMINI_API_KEY||process.env.GEMINI_API_KEY==='MY_GEMINI_API_KEY')throw new Error('Set GEMINI_API_KEY in vendor/architecture-remix/.env, then restart QWEEPS to use Gemini.');
  return new GoogleGenAI({
    apiKey: process.env.GEMINI_API_KEY,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.QWEEPS_ARCHITECTURE_PORT||3000);

  app.use(express.json({ limit: '8mb' }));
  const savedRoot=process.env.QWEEPS_WALKTHROUGH_DIR||path.join(os.homedir(),'.cache/qweeps/architecture-walkthroughs');
  app.get('/api/architecture/walkthroughs',async(_req,res)=>{
    await mkdir(savedRoot,{recursive:true});
    const items=await Promise.all((await readdir(savedRoot)).filter(n=>/^[a-f0-9]{32}\.json$/.test(n)).map(async n=>{try{const saved=JSON.parse(await readFile(path.join(savedRoot,n),'utf8'));return{id:saved.id,title:saved.bundle.title,updatedAt:saved.updatedAt,beatCount:saved.bundle.macroSteps.length,duration:saved.bundle.macroSteps.reduce((n:number,s:{duration:number})=>n+s.duration,0)};}catch{return null;}}));
    res.json({walkthroughs:items.filter(Boolean).sort((a,b)=>b!.updatedAt.localeCompare(a!.updatedAt))});
  });
  app.get('/api/architecture/walkthroughs/:id',async(req,res)=>{
    if(!/^[a-f0-9]{32}$/.test(req.params.id)){res.status(400).json({error:'Invalid walkthrough ID'});return;}
    try{res.json(JSON.parse(await readFile(path.join(savedRoot,req.params.id+'.json'),'utf8')));}catch{res.status(404).json({error:'Saved walkthrough not found'});}
  });
  app.post('/api/architecture/walkthroughs',async(req,res)=>{
    const bundle=req.body?.bundle;
    if(!bundle||typeof bundle.title!=='string'||typeof bundle.sourceCode!=='string'||!Array.isArray(bundle.macroGraph?.nodes)||!Array.isArray(bundle.macroGraph?.edges)||!Array.isArray(bundle.macroSteps)||!bundle.subFunctions){res.status(400).json({error:'Save a complete compiled walkthrough'});return;}
    const id=createHash('sha256').update(JSON.stringify({title:bundle.title,source:bundle.sourceCode,input:bundle.sampleInput})).digest('hex').slice(0,32);
    await mkdir(savedRoot,{recursive:true});const pending=path.join(savedRoot,id+'.'+Date.now()+'.tmp');
    await writeFile(pending,JSON.stringify({version:1,id,updatedAt:new Date().toISOString(),bundle}));await rename(pending,path.join(savedRoot,id+'.json'));res.json({id});
  });

  // 1. Health & Model Status Endpoint
  app.get('/api/ai/status', (_req, res) => {
    const hasKey = Boolean(
      process.env.GEMINI_API_KEY &&
        process.env.GEMINI_API_KEY !== 'MY_GEMINI_API_KEY'
    );
    res.json({
      ready: hasKey,
      model: 'gemini-3.8-flash',
      architecture: 'procedural-skeleton-plus-ai-gap-filler',
    });
  });

  // 2. AI Explanatory Gap-Filler Endpoint
  // Takes the fast procedurally compiled graph/beat skeleton and fills only the human-readable
  // explanatory prose (questions, narrations, takeaways, node descriptions, and Q&A chips)
  // without mutating any graph geometry, node IDs, or worked-example ledger values.
  app.post('/api/ai/fill-gaps', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        title,
        sourceCode,
        sampleInput,
        nodes = [],
        beats = [],
        subSteps = [],
      } = req.body ?? {};

      const ai = getGenAIClient();

      const prompt = `You are the explanatory gap-filler for QWEEPS, an interactive 2D code-and-architecture walkthrough engine.
The deterministic procedural compiler has ALREADY built the exact graph geometry, node IDs, ports, edges, and worked-example values in <3ms.
Your job is ONLY to fill in clear, concrete, pedagogically sharp explanatory text for each beat, node, sub-step, and 4 contextual learner questions.

Rules:
1. NEVER change or invent node IDs or beat numbers. Use the exact nodeId, beatNumber, and stepId values provided below.
2. Keep every explanation grounded in the provided sourceCode and sampleInput.
3. Keep sentences concise and scannable (1-2 sentences per narration/description).

Lesson Title: ${title}
Sample Input: ${sampleInput}
Source Code:
\`\`\`python
${sourceCode}
\`\`\`

Macro Nodes to explain:
${JSON.stringify(nodes, null, 2)}

Macro Beats to explain:
${JSON.stringify(beats, null, 2)}

Level-1 Sub-Steps to explain:
${JSON.stringify(subSteps, null, 2)}`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are a precise software architecture educator. Fill the explanatory slots for the procedurally compiled graph without altering any identifiers or worked-example data values. Keep explanations crisp, concrete, and directly tied to the code lines.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              beatExplanations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    beatNumber: { type: Type.INTEGER },
                    question: { type: Type.STRING },
                    narration: { type: Type.STRING },
                    takeaway: { type: Type.STRING },
                    goalText: { type: Type.STRING },
                    lineExplanation: { type: Type.STRING },
                  },
                  required: [
                    'beatNumber',
                    'question',
                    'narration',
                    'takeaway',
                    'goalText',
                    'lineExplanation',
                  ],
                },
              },
              nodeExplanations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    nodeId: { type: Type.STRING },
                    subtitle: { type: Type.STRING },
                    description: { type: Type.STRING },
                    roleSummary: { type: Type.STRING },
                  },
                  required: ['nodeId', 'subtitle', 'description', 'roleSummary'],
                },
              },
              subStepExplanations: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    stepId: { type: Type.STRING },
                    goalText: { type: Type.STRING },
                    narration: { type: Type.STRING },
                    takeaway: { type: Type.STRING },
                  },
                  required: ['stepId', 'goalText', 'narration', 'takeaway'],
                },
              },
              contextualQuestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    id: { type: Type.STRING },
                    question: { type: Type.STRING },
                    shortContext: { type: Type.STRING },
                    answer: { type: Type.STRING },
                    takeaway: { type: Type.STRING },
                    codeLines: {
                      type: Type.ARRAY,
                      items: { type: Type.INTEGER },
                    },
                    relatedNodes: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                    },
                  },
                  required: [
                    'id',
                    'question',
                    'shortContext',
                    'answer',
                    'takeaway',
                    'codeLines',
                    'relatedNodes',
                  ],
                },
              },
            },
            required: [
              'beatExplanations',
              'nodeExplanations',
              'subStepExplanations',
              'contextualQuestions',
            ],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      const elapsedMs = Date.now() - startTime;

      res.json({
        gaps: parsed,
        elapsedMs,
        model: 'gemini-3.8-flash',
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to fill explanatory gaps';
      res.status(500).json({ error: message });
    }
  });

  // 3. Live Contextual Ask QWEEPS Endpoint
  // Answers any custom learner question grounded in the paused playhead, selected node, and code lines.
  app.post('/api/ai/ask', async (req, res) => {
    const startTime = Date.now();
    try {
      const {
        question,
        lessonTitle,
        sourceCode,
        currentBeat,
        selectedNode,
        playhead,
        ledger,
      } = req.body ?? {};

      if (!question || typeof question !== 'string') {
        res.status(400).json({ error: 'Question is required.' });
        return;
      }

      const ai = getGenAIClient();

      const prompt = `Learner Question: "${question}"

Captured Walkthrough Context:
- Lesson: ${lessonTitle}
- Paused Playhead: ${Number(playhead ?? 0).toFixed(1)}s
- Current Beat: Beat ${currentBeat?.beatNumber ?? 1} (${currentBeat?.title ?? ''}) — ${currentBeat?.narration ?? ''}
- Selected / Focused Node: ${selectedNode ? `${selectedNode.id} (${selectedNode.label}: ${selectedNode.description})` : 'None'}
- Worked-Example Ledger Values: ${JSON.stringify(ledger ?? {})}
- Source Code:
\`\`\`python
${sourceCode ?? ''}
\`\`\`

Answer the learner's question directly and concisely (2-4 sentences) using the exact variable names, code lines, and worked-example values from this trace.`;

      const response = await ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: prompt,
        config: {
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          systemInstruction:
            'You are QWEEPS, a context-aware architecture and code-tracing tutor. Always ground your explanation in the exact code lines, active beat, and worked-example values shown on screen. Never invent external cloud services or unverified claims.',
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              answer: { type: Type.STRING },
              takeaway: { type: Type.STRING },
              codeLines: {
                type: Type.ARRAY,
                items: { type: Type.INTEGER },
              },
              relatedNodes: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: ['answer', 'takeaway', 'codeLines', 'relatedNodes'],
          },
        },
      });

      const parsed = JSON.parse((response.text ?? '{}').trim());
      res.json({
        ...parsed,
        elapsedMs: Date.now() - startTime,
        model: 'gemini-3.8-flash',
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to generate answer';
      res.status(500).json({ error: message });
    }
  });

  // 4. Deterministic GitHub Repository Architecture Scanner + Optional Gemini Storyboard Generator
  // Mirrors `src/assistant/visual/repo_architecture.py` from https://github.com/acceptance27/qweeps:
  // scans source files, extracts AST/symbol definitions + imports deterministically, groups into directory containers,
  // and optionally invokes Gemini 3.8 Flash to author explanatory beats.
  app.post('/api/repo/scan-github', async (req, res) => {
    const startTime = Date.now();
    try {
      const { repoUrl = 'https://github.com/acceptance27/qweeps', runAiStoryboard = false } =
        req.body ?? {};

      const match = String(repoUrl).match(/github\.com\/([^/]+)\/([^/#?]+)/i);
      if (!match) {
        res.status(400).json({ error: 'Please provide a valid GitHub URL (e.g. https://github.com/acceptance27/qweeps).' });
        return;
      }
      const owner = match[1];
      const repo = match[2].replace(/\.git$/i, '');

      // Fetch repository file tree from GitHub API
      const treeRes = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/git/trees/HEAD?recursive=1`,
        {
          headers: {
            Accept: 'application/vnd.github+json',
            'User-Agent': 'aistudio-build',
          },
        }
      );

      if (!treeRes.ok) {
        throw new Error(`GitHub API returned ${treeRes.status} for ${owner}/${repo}`);
      }

      const treeData = (await treeRes.json()) as {
        tree?: { path: string; type: string; size?: number }[];
      };

      const sourceExtensions = /\.(py|ts|tsx|js|jsx)$/i;
      const ignoredPath = /(^|\/)(node_modules|dist|build|\.git|__pycache__|tests?|docs?|examples?|assets|public)\//i;

      const candidateFiles = (treeData.tree ?? [])
        .filter(
          (item) =>
            item.type === 'blob' &&
            sourceExtensions.test(item.path) &&
            !ignoredPath.test(item.path) &&
            !item.path.endsWith('.d.ts') &&
            !item.path.includes('.test.') &&
            !item.path.includes('.spec.')
        )
        .slice(0, 14);

      const codeFiles: Record<
        string,
        { lineNumber: number; text: string; explanation: string }[]
      > = {};
      const fileToGroup = new Map<string, string>();
      const fileToChildId = new Map<string, string>();
      const groupMap = new Map<
        string,
        {
          id: string;
          label: string;
          kind: string;
          summary: string;
          code: { file: string; lines: number[] };
          children: {
            id: string;
            label: string;
            kind: string;
            badge: string;
            detail: string;
            code: { file: string; lines: number[] };
          }[];
          connections: {
            id: string;
            fromNodeId: string;
            toNodeId: string;
            label: string;
            kind: string;
          }[];
        }
      >();

      // Fetch raw content for candidate files in parallel
      await Promise.all(
        candidateFiles.map(async (item) => {
          const rawRes = await fetch(
            `https://raw.githubusercontent.com/${owner}/${repo}/HEAD/${item.path}`,
            { headers: { 'User-Agent': 'aistudio-build' } }
          );
          if (!rawRes.ok) return;
          const text = await rawRes.text();
          const rawLines = text.split(/\r?\n/).slice(0, 1200);

          const parsedLines = rawLines.map((ln, idx) => {
            const pyDef = ln.match(/^\s*(?:async\s+)?def\s+([A-Za-z0-9_]+)\s*\(/);
            const pyClass = ln.match(/^\s*class\s+([A-Za-z0-9_]+)/);
            const tsFunc = ln.match(
              /^\s*(?:export\s+)?(?:async\s+)?function\s+([A-Za-z0-9_]+)/
            );
            const tsConstFn = ln.match(
              /^\s*export\s+const\s+([A-Za-z0-9_]+)\s*=\s*(?:async\s*)?\(/
            );
            let explanation = 'source line';
            if (pyClass) explanation = `class ${pyClass[1]}`;
            else if (pyDef) explanation = `function ${pyDef[1]}`;
            else if (tsFunc) explanation = `function ${tsFunc[1]}`;
            else if (tsConstFn) explanation = `function ${tsConstFn[1]}`;

            return {
              lineNumber: idx + 1,
              text: ln,
              explanation,
            };
          });

          codeFiles[item.path] = parsedLines;

          const parts = item.path.split('/');
          const dirLabel =
            parts.length > 1 ? parts.slice(0, Math.min(4, parts.length - 1)).join('/') : 'root';
          const groupId = `group-${dirLabel.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
          const childId = `file-${item.path.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`;
          const fileName = parts[parts.length - 1];

          fileToGroup.set(item.path, groupId);
          fileToChildId.set(item.path, childId);

          const defs = parsedLines
            .filter((l) => l.explanation !== 'source line')
            .map((l) => l.explanation.replace(/^(function|class)\s+/i, ''));

          if (!groupMap.has(groupId)) {
            groupMap.set(groupId, {
              id: groupId,
              label: dirLabel,
              kind: 'container',
              summary: `${dirLabel} package`,
              code: { file: item.path, lines: [1, 2, 3] },
              children: [],
              connections: [],
            });
          }

          groupMap.get(groupId)!.children.push({
            id: childId,
            label: fileName,
            kind: 'Transform',
            badge: item.path.endsWith('.py') ? 'python' : 'typescript',
            detail: `${item.path}${defs.length > 0 ? ` · defines ${defs.slice(0, 3).join(', ')}` : ''}`,
            code: { file: item.path, lines: [1, 2, 3] },
          });
        })
      );

      // Extract internal and cross-group import edges deterministically
      const crossEdges: {
        id: string;
        from: string;
        to: string;
        label: string;
        kind: string;
      }[] = [];

      const allFilePaths = Object.keys(codeFiles);
      for (const [filePath, lines] of Object.entries(codeFiles)) {
        const srcGroup = fileToGroup.get(filePath);
        const srcChild = fileToChildId.get(filePath);
        if (!srcGroup || !srcChild) continue;

        for (const ln of lines) {
          const importMatch =
            ln.text.match(/^\s*from\s+([A-Za-z0-9_.]+)\s+import\s+(.+)$/) ||
            ln.text.match(/^\s*import\s+.*from\s+['"]([^'"]+)['"]/);
          if (!importMatch) continue;

          const moduleSpec = importMatch[1];
          const targetFile = allFilePaths.find((candidate) => {
            if (candidate === filePath) return false;
            const stem = candidate
              .replace(/\.(py|ts|tsx|js|jsx)$/i, '')
              .split('/')
              .pop();
            return (
              stem &&
              (moduleSpec.endsWith(`.${stem}`) ||
                moduleSpec.endsWith(`/${stem}`) ||
                moduleSpec === stem)
            );
          });

          if (!targetFile) continue;
          const tgtGroup = fileToGroup.get(targetFile);
          const tgtChild = fileToChildId.get(targetFile);
          if (!tgtGroup || !tgtChild) continue;

          const shortSrc = filePath.split('/').pop() ?? filePath;
          const shortTgt = targetFile.split('/').pop() ?? targetFile;

          if (srcGroup === tgtGroup) {
            const grp = groupMap.get(srcGroup)!;
            const connId = `internal-${srcChild}-${tgtChild}`;
            if (!grp.connections.some((c) => c.id === connId)) {
              grp.connections.push({
                id: connId,
                fromNodeId: srcChild,
                toNodeId: tgtChild,
                label: `${shortSrc} → ${shortTgt}`,
                kind: 'data',
              });
            }
          } else {
            const edgeId = `import-${srcGroup}-${tgtGroup}-${crossEdges.length + 1}`;
            if (
              !crossEdges.some(
                (e) => e.from === srcGroup && e.to === tgtGroup && e.label.includes(shortTgt)
              )
            ) {
              crossEdges.push({
                id: edgeId,
                from: srcGroup,
                to: tgtGroup,
                label: `${shortSrc} → ${shortTgt}`,
                kind: 'data',
              });
            }
          }
        }
      }

      const architecturePayload = {
        id: `repo-architecture-${repo}`,
        title: `${owner}/${repo} — Scanned Repository Visual Architecture`,
        repoUrl: `https://github.com/${owner}/${repo}`,
        graph: {
          nodes: Array.from(groupMap.values()),
          edges: crossEdges,
        },
        codeFiles,
      };

      res.json({
        architecture: architecturePayload,
        elapsedMs: Date.now() - startTime,
        scannedFilesCount: Object.keys(codeFiles).length,
        containersCount: groupMap.size,
        crossEdgesCount: crossEdges.length,
        runAiStoryboard,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Failed to scan GitHub repository';
      res.status(500).json({ error: message });
    }
  });

  if(process.env.QWEEPS_ARCHITECTURE_API_ONLY==='1'){
    app.use((_req,res)=>res.status(404).json({error:'Unknown architecture API route'}));
  } else if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '127.0.0.1', () => {
    console.log(`QWEEPS architecture backend running on http://127.0.0.1:${PORT}`);
  });
}

startServer();
