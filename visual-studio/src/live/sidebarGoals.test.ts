import test from 'node:test';
import assert from 'node:assert/strict';
import {generatedSidebarGoals} from './architecture/prototype/sidebarGoals';
import type {ArchitectureGraph,GraphNode,Step,SubFunctionLesson} from './architecture/prototype/types/lesson';
const node=(id:string):GraphNode=>({id,label:id,kind:'transform',iconName:'Cog',accentColor:'mint',subtitle:'',description:'Prepare '+id,roleSummary:'',defaultPreview:'',codeReference:{file:'app.py',lines:[1],snippet:''},width:200,height:120});
const step:Step={id:'entry',beatNumber:1,title:'Receive the question',question:'What enters?',narration:'Receive the question.',duration:10,focusNodes:['question','system','prepare','result'],activeNodes:[],activeEdges:[],packets:[],code:{file:'app.py',lines:[1]},stateBefore:{},stateAfter:{},nodeDataBefore:{},nodeDataAfter:{},takeaway:'A prepared lesson is the result.'};

test('system goal cards retain all focused boundaries and omit the virtual enclosing call',()=>{
 const graph:ArchitectureGraph={id:'generated-system',title:'System',systemNodeId:'system',nodes:[{...node('question'),kind:'input',ports:{inputs:[],outputs:[{id:'q',label:'question',data:'learner request'}]}},node('system'),node('prepare'),{...node('result'),kind:'output',ports:{inputs:[{id:'lesson',label:'lesson',data:'published chapters'}],outputs:[]}}],edges:[]};
 const cards=generatedSidebarGoals(graph,step,null,null);
 assert.deepEqual(cards.map(c=>c.id),['question','prepare','result']);
 assert.equal(cards[0].inputValue,'');assert.match(cards[0].outputValue,/learner request/);
 assert.match(cards.at(-1)!.inputValue,/published chapters/);assert.equal(cards.at(-1)!.outputValue,'');
 assert.ok(!JSON.stringify(cards).includes('refund'));
});

test('selected child uses its own goal and function link, not its parent function',()=>{
 const graph:ArchitectureGraph={id:'generated-children',title:'System',nodes:[{...node('parent'),drillDownFunctionId:'parent-fn',teachingDescription:'Parent-only explanation',children:[{id:'left',label:'Read request',description:'Read the incoming question',color:'sky',drillDownFunctionId:'read-fn'},{id:'right',label:'Plan lesson',description:'Prepare the teaching plan',color:'mint',drillDownFunctionId:'plan-fn'}],connections:[{id:'read-plan',from:{child:'left'},to:{child:'right'},label:'accepted request',relationship:'data'}]}],edges:[]};
 const cards=generatedSidebarGoals(graph,step,'right',null);
 assert.equal(cards.length,1);assert.equal(cards[0].functionId,'plan-fn');assert.equal(cards[0].goal,'Prepare the teaching plan');assert.match(cards[0].inputValue,/Read request → accepted request/);
});

test('function contracts distinguish caller inputs, dependencies, returns and outward changes without fabricating values',()=>{
 const fn={functionName:'Store.prepare()',summary:'Prepare the saved lesson.',interface:{inputs:[{name:'request',description:'Caller payload',kind:'parameter',line:1},{name:'client',description:'Configured client',kind:'dependency',line:2}],outputs:[{name:'candidate',description:'Returned lesson',kind:'return',line:3},{name:'jobs',description:'Updated job state',kind:'effect',line:4}],basis:'Source declarations'}} as SubFunctionLesson;
 const graph:ArchitectureGraph={id:'generated-function',title:'Function',nodes:[],edges:[]};
 const cards=generatedSidebarGoals(graph,{...step,focusNodes:[]},null,fn);
 assert.equal(cards.length,1);assert.equal(cards[0].inputValue,'request; configured: client');assert.equal(cards[0].outputValue,'Returned: candidate; Changes: jobs');
 assert.equal(cards[0].goal,fn.summary);
});

test('selected source operations use their real child endpoints across stage boundaries',()=>{
 const first={...node('stage-one'),children:[{id:'caller',label:'Check request',color:'mint' as const}]},second={...node('stage-two'),children:[{id:'callee',label:'Save lesson',color:'mint' as const}]};
 const graph:ArchitectureGraph={id:'generated-cross-stage',title:'Function',nodes:[first,second],edges:[{id:'save',source:first.id,target:second.id,sourceChild:'caller',targetChild:'callee',label:'accepted lesson',description:'Source path',relationship:'control'}]};
 const cards=generatedSidebarGoals(graph,step,'callee',null);
 assert.match(cards[0].inputValue,/Check request → accepted lesson/);
});

test('worked-example input values come from their own calculated ledger',()=>{
 const graph:ArchitectureGraph={id:'generated-example',title:'Toy vectors',workedExampleLedger:{$query:'[1,0]'},nodes:[{...node('query'),kind:'input',valueRef:'query'}],edges:[]};
 const [card]=generatedSidebarGoals(graph,{...step,focusNodes:['query']},null,null);
 assert.equal(card.inputValue,'');assert.equal(card.outputValue,'[1,0]');
});

test('real incoming and outgoing connections remain visible regardless of a node category',()=>{
 const graph:ArchitectureGraph={id:'generated-connections',title:'Flow',nodes:[node('caller'),{...node('source'),kind:'input'},node('consumer')],edges:[{id:'refresh',source:'caller',target:'source',label:'refresh',description:'Declared control',relationship:'control'},{id:'documents',source:'source',target:'consumer',label:'documents',description:'Declared data',relationship:'data'}]};
 const [card]=generatedSidebarGoals(graph,step,'source',null);
 assert.match(card.inputValue,/caller → refresh/);assert.match(card.outputValue,/documents → consumer/);
});
