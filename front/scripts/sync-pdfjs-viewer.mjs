import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pdfjsRoot = join(rootDir, 'node_modules', 'pdfjs-dist');
const publicPdfjsRoot = join(rootDir, 'public', 'pdfjs');

const copies = [
  ['build', ['pdf.min.mjs', 'pdf.worker.min.mjs']],
  ['cmaps'],
  ['iccs'],
  ['standard_fonts'],
  ['wasm'],
  ['web', ['pdf_viewer.mjs', 'pdf_viewer.mjs.map', 'pdf_viewer.css']],
  ['web/images'],
];

if (!existsSync(pdfjsRoot)) {
  throw new Error('pdfjs-dist is not installed. Run npm install in front first.');
}

mkdirSync(publicPdfjsRoot, { recursive: true });

for (const [directory, files] of copies) {
  const sourceDir = join(pdfjsRoot, directory);
  const targetDir = join(publicPdfjsRoot, directory);

  if (!existsSync(sourceDir)) {
    throw new Error(`Missing pdfjs-dist asset directory: ${sourceDir}`);
  }

  mkdirSync(targetDir, { recursive: true });

  if (files) {
    for (const file of files) {
      cpSync(join(sourceDir, file), join(targetDir, file));
    }
    continue;
  }

  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

console.log('PDF.js viewer assets synced to public/pdfjs.');
