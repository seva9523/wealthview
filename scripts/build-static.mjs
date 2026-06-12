import { cp, mkdir, rm } from 'node:fs/promises';

const staticFiles = [
  'index.html',
  'demo.html',
  'favicon.ico',
  'CNAME',
  'stellar-portfolio-sdk.js'
];

const metadataFiles = [
  'agent.json',
  'openapi.json'
];

await mkdir('public', { recursive: true });
await Promise.all(staticFiles.map((file) => cp(file, `public/${file}`)));

await rm('dist', { recursive: true, force: true });
await mkdir('dist/public', { recursive: true });

await Promise.all(staticFiles.map((file) => cp(file, `dist/${file}`)));
await Promise.all(metadataFiles.map((file) => cp(`public/${file}`, `dist/${file}`)));
await Promise.all(metadataFiles.map((file) => cp(`public/${file}`, `dist/public/${file}`)));

console.log(`Built ${staticFiles.length} static files into public/ and dist/`);
