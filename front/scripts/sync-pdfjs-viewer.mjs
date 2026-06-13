import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));
const pdfjsRoot = join(rootDir, 'node_modules', 'pdfjs-dist');
const publicPdfjsRoot = join(rootDir, 'public', 'pdfjs');

const copies = [
  ['build', [
    'pdf.min.mjs',
    { from: 'pdf.min.mjs', to: 'pdf.min.js' },
    'pdf.worker.min.mjs',
    { from: 'pdf.worker.min.mjs', to: 'pdf.worker.min.js' },
  ]],
  ['cmaps'],
  ['iccs'],
  ['standard_fonts'],
  ['wasm'],
  ['web', [
    'pdf_viewer.mjs',
    { from: 'pdf_viewer.mjs', to: 'pdf_viewer.js' },
    'pdf_viewer.mjs.map',
    'pdf_viewer.css',
  ]],
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
      const sourceFile = typeof file === 'string' ? file : file.from;
      const targetFile = typeof file === 'string' ? file : file.to;

      cpSync(join(sourceDir, sourceFile), join(targetDir, targetFile));
    }
    continue;
  }

  rmSync(targetDir, { recursive: true, force: true });
  cpSync(sourceDir, targetDir, { recursive: true });
}

console.log('PDF.js viewer assets synced to public/pdfjs.');
