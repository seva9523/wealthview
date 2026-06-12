import { cp, mkdir, rm } from 'node:fs/promises';

const staticFiles = [
  'index.html',
  'demo.html',
  'favicon.ico',
  'CNAME',
  'stellar-portfolio-sdk.js'
];

await rm('dist', { recursive: true, force: true });
await mkdir('dist', { recursive: true });

await Promise.all(staticFiles.map((file) => cp(file, `dist/${file}`)));
await cp('public', 'dist/public', { recursive: true });

console.log(`Built ${staticFiles.length} static files and public metadata into dist/`);
