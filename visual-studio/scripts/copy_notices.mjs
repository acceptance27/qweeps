import { cpSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = resolve(root, 'visual-studio/dist');

if (!existsSync(dist)) {
  console.error(`copy_notices: build output not found at ${dist}`);
  process.exit(1);
}

const files = [
  'LICENSE',
  'LICENSE-DOCUMENTATION',
  'LICENSING.md',
  'THIRD_PARTY_NOTICES.md',
];

for (const file of files) {
  const source = resolve(root, file);
  if (!existsSync(source)) {
    console.error(`copy_notices: missing ${file}`);
    process.exit(1);
  }
  cpSync(source, resolve(dist, file));
}

const licenseDir = resolve(root, 'LICENSES');
if (!existsSync(licenseDir)) {
  console.error('copy_notices: missing LICENSES/');
  process.exit(1);
}
cpSync(licenseDir, resolve(dist, 'LICENSES'), { recursive: true });

console.log('copy_notices: copied license and notice files into visual-studio/dist');
