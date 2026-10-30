import {Snapshot} from './types';
import {productionDefaults,ProductionExperiment,ProductionReport} from './production';
import './production.css';
type Props={report:ProductionReport;snapshot:Snapshot;update:(fn:(s:Snapshot)=>Snapshot)=>void;pause:()=>void};
export function ProductionControls({snapshot,report,update,pause}:Props){const s=snapshot.production||productionDefaults;const index=Math.min(5,Math.floor(snapshot.time/20));const change=(patch:Partial<ProductionExperiment>)=>{pause();update(old=>({...old,production:{...(old.production||productionDefaults),...patch}}));};return <div className="production-controls">
 <label>Recorded scope<select aria-label="Recorded production scope" value={s.scope} onChange={e=>change({scope:e.target.value})}><option value="all">Whole Manim project</option>{report.turns.map(t=><option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
 {index===2&&<label>Frame budget · {s.fps} fps<input aria-label="Frame rate experiment" type="range" min="15" max="60" step="15" value={s.fps} onChange={e=>change({fps:+e.target.value})}/></label>}
 {(index===3||index===4||index===5)&&<><label className="production-check"><input aria-label="Reuse cached input" type="checkbox" checked={s.cache} onChange={e=>change({cache:e.target.checked})}/>Reuse cached input</label><label className="production-check"><input aria-label="Fast pricing scenario" type="checkbox" checked={s.fast} onChange={e=>change({fast:e.target.checked})}/>Fast rate scenario (2×)</label></>}
 {index===4&&<><label>Avoid render work · {(s.avoidRender*100).toFixed(0)}%<input aria-label="Avoidable render work" type="range" min="0" max="1" step=".05" value={s.avoidRender} onChange={e=>change({avoidRender:+e.target.value})}/></label><label>Retain context · {(s.contextFraction*100).toFixed(0)}%<input aria-label="Context retained" type="range" min=".25" max="1" step=".05" value={s.contextFraction} onChange={e=>change({contextFraction:+e.target.value})}/></label></>}
 <a href="/production/report.json" download>Recorded data</a>
 </div>;}
