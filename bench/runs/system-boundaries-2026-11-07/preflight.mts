import fs from 'node:fs';
import {workspaceForLesson} from '../../../visual-studio/src/live/architecture/prototype/workspace.ts';
import {computeElkGraphLayout} from '../../../visual-studio/src/live/architecture/prototype/layout/elkLayout.ts';
const folder='/home/anonymous/.cache/qweeps/browser-lessons/0ec1863fb9a6cf168c554e07bccff467';
const files=fs.readdirSync(folder).filter(f=>/^speech-[a-f0-9]+\.json$/.test(f)).sort((a,b)=>fs.statSync(folder+'/'+b).mtimeMs-fs.statSync(folder+'/'+a).mtimeMs);
const lesson=JSON.parse(fs.readFileSync(folder+'/'+files[0],'utf8')),workspace=workspaceForLesson(lesson),root=await computeElkGraphLayout(workspace.graph);
const results=[{scope:'root',nodes:workspace.graph.nodes.length,engine:root.engineUsed,issues:root.issues}];
for(const id of Object.keys(lesson.architecture.functions)){const fn=workspace.resolveFunction(id)!;const layout=await computeElkGraphLayout(fn.graph);results.push({scope:id,nodes:fn.graph.nodes.length,engine:layout.engineUsed,issues:layout.issues});}
fs.writeFileSync('bench/runs/system-boundaries-2026-11-07/layout-results.json',JSON.stringify(results,null,2));
console.log(JSON.stringify(results));if(results.some(r=>r.issues?.length))process.exitCode=1;
