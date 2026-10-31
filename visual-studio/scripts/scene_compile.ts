import fs from 'node:fs';
import {compileSceneProgram} from '../src/live/sceneProgram';

let raw='';
for await (const chunk of process.stdin)raw+=chunk;
try{
 const program=JSON.parse(raw);
 const result=compileSceneProgram(program);
 process.stdout.write(JSON.stringify(result));
}catch(error){
 process.stdout.write(JSON.stringify({ok:false,findings:[{code:'json',severity:'error',message:String(error)}],scene:null,stats:{cards:0,slots:0,actions:0}}));
}
