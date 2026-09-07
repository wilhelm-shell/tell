import { createWriteStream, existsSync, statSync } from 'node:fs';
import { createRequire } from 'node:module';
const { ZipArchive } = createRequire(import.meta.url)('archiver');

if (!existsSync('dist/manifest.webapp')) {
  console.error('dist/manifest.webapp missing — run `npm run build` first.');
  process.exit(1);
}

const out = createWriteStream('tell-app.zip');
const archive = new ZipArchive({ zlib: { level: 9 } });

out.on('close', () => {
  const size = statSync('tell-app.zip').size;
  console.log(`wrote tell-app.zip (${size} bytes)`);
});

archive.on('warning', (err) => { if (err.code !== 'ENOENT') throw err; });
archive.on('error', (err) => { throw err; });

archive.pipe(out);
archive.directory('dist/', false); // false → contents at zip root, so manifest.webapp is top-level
archive.finalize();
