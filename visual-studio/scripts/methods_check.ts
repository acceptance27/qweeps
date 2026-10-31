import {METHOD_ORDER,METHOD_PROGRAMS} from '../src/live/methodsPrograms';
import {compileSceneProgram} from '../src/live/sceneProgram';
for(const name of METHOD_ORDER){
 const result=compileSceneProgram(METHOD_PROGRAMS[name]);
 console.log(name,result.ok?'PASS':'FAIL',JSON.stringify(result.stats));
 for(const finding of result.findings)console.log('  ',finding.severity,finding.code,finding.message);
}
