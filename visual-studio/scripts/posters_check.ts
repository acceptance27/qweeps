import {REFERENCE_POSTERS,POSTER_ORDER} from '../src/live/referencePosters';
import {compileSceneProgram} from '../src/live/sceneProgram';
for(const grammar of POSTER_ORDER){
 const result=compileSceneProgram(REFERENCE_POSTERS[grammar]);
 console.log(grammar,result.ok?'PASS':'FAIL',JSON.stringify(result.stats));
 for(const finding of result.findings)console.log('  ',finding.severity,finding.code,finding.message);
}
