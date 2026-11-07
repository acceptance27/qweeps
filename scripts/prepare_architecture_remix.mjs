import {build} from 'esbuild';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {cpSync} from 'node:fs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
cpSync(path.join(root,'vendor/architecture-remix/public/assets/aistudio'),path.join(root,'visual-studio/public/assets/aistudio'),{recursive:true});
await build({entryPoints:[path.join(root,'vendor/architecture-remix/host-entry.ts')],outfile:path.join(root,'visual-studio/src/live/architecture/remix/runtime.js'),bundle:true,format:'esm',platform:'browser',target:'es2022',external:['react','react/*','react-dom','react-dom/*','lucide-react','elkjs/lib/elk.bundled.js','motion','motion/*'],logLevel:'warning'});
