// Serves received attachments to the phone, scaled to the screen.
//
// signal-cli downloads attachments into <data-dir>/attachments/<id>.
// A phone photo is 12 MP, which decodes to ~48 MB of bitmap on a device
// with 512 MB total, so the full file must never reach the client: every
// response is resized here (sharp, the bridge's one native dependency)
// and cached as JPEG in the data volume under a size cap.
//
// Auth is the ordinary bearer check from server.js; the client fetches
// with the Authorization header and shows a blob, so no token ever sits
// in an <img src> URL.
import sharp from 'sharp';
import { stat, mkdir, readdir, unlink, readFile, writeFile } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

// Attachment ids are opaque filenames from signal-cli; anything else
// (path separators above all) is refused before touching the disk.
const ID_RE = /^[A-Za-z0-9._-]{1,128}$/;
const MIN_EDGE = 16;
const MAX_EDGE = 480;         // largest anyone may ask for; the panel is 240 wide
const DEFAULT_W = 240;
const DEFAULT_H = 320;
const JPEG_QUALITY = 80;
export const CACHE_MAX_BYTES = 50 * 1024 * 1024;

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.floor(n)));
}

export function isValidId(id) {
  return typeof id === 'string' && ID_RE.test(id) && id !== '.' && id !== '..';
}

// Delete oldest cached files until the directory is under `maxBytes`.
export async function pruneCache(dir, maxBytes) {
  let names;
  try { names = await readdir(dir); } catch (_) { return; }
  const files = [];
  for (const name of names) {
    try {
      const s = await stat(join(dir, name));
      if (s.isFile()) files.push({ name, size: s.size, mtime: s.mtimeMs });
    } catch (_) {}
  }
  let total = files.reduce((sum, f) => sum + f.size, 0);
  files.sort((a, b) => a.mtime - b.mtime);
  for (const f of files) {
    if (total <= maxBytes) break;
    try { await unlink(join(dir, f.name)); total -= f.size; } catch (_) {}
  }
}

// Scaled JPEG for one attachment, from cache when present.
// Throws { code: 'ENOENT' } for a missing source and { code: 'UNSUPPORTED' }
// for anything sharp cannot decode.
export async function scaledImage({ dir, cacheDir, maxBytes = CACHE_MAX_BYTES }, id, w, h) {
  const src = join(dir, id);
  await stat(src);   // ENOENT propagates
  const out = join(cacheDir, `${id}-${w}x${h}.jpg`);
  try { return await readFile(out); } catch (_) {}
  let buf;
  try {
    buf = await sharp(src, { animated: false })
      .rotate()                                    // honour EXIF orientation
      .resize({ width: w, height: h, fit: 'inside', withoutEnlargement: true })
      .jpeg({ quality: JPEG_QUALITY })
      .toBuffer();
  } catch (e) {
    const err = new Error('unsupported image');
    err.code = 'UNSUPPORTED';
    throw err;
  }
  await mkdir(cacheDir, { recursive: true });
  await writeFile(out, buf, { mode: 0o600 });
  pruneCache(cacheDir, maxBytes).catch(() => {});
  return buf;
}

// Raw media the phone plays itself (video, animated GIF). No transcoding
// yet: this is the "does the device play it at all" path, so the size cap
// is what keeps a 200 MB phone video off a 512 MB phone.
export const RAW_MAX_BYTES = 15 * 1024 * 1024;
const RAW_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.3gp': 'video/3gpp',
  '.gif': 'image/gif',
};

// Content type for the raw route by file extension, or null when the
// file is not something we serve raw.
export function rawContentType(id) {
  const m = /(\.[a-z0-9]+)$/i.exec(id);
  return m ? (RAW_TYPES[m[1].toLowerCase()] || null) : null;
}

export function registerAttachments(app, opts) {
  app.get('/attachments/:id/raw', async (req, reply) => {
    const id = req.params.id;
    if (!isValidId(id)) { reply.code(400); return { error: 'bad id' }; }
    const type = rawContentType(id);
    if (!type) { reply.code(415); return { error: 'not raw-servable' }; }
    let info;
    try { info = await stat(join(opts.dir, id)); }
    catch (_) { reply.code(404); return { error: 'not found' }; }
    if (info.size > RAW_MAX_BYTES) { reply.code(413); return { error: 'too large', size: info.size, max: RAW_MAX_BYTES }; }
    reply.header('Content-Type', type);
    reply.header('Content-Length', String(info.size));
    reply.header('Cache-Control', 'private, max-age=86400');
    return createReadStream(join(opts.dir, id));
  });

  app.get('/attachments/:id', async (req, reply) => {
    const id = req.params.id;
    if (!isValidId(id)) { reply.code(400); return { error: 'bad id' }; }
    const w = clamp(Number(req.query.w) || DEFAULT_W, MIN_EDGE, MAX_EDGE);
    const h = clamp(Number(req.query.h) || DEFAULT_H, MIN_EDGE, MAX_EDGE);
    let buf;
    try {
      buf = await scaledImage(opts, id, w, h);
    } catch (e) {
      if (e.code === 'ENOENT') { reply.code(404); return { error: 'not found' }; }
      if (e.code === 'UNSUPPORTED') { reply.code(415); return { error: 'not an image' }; }
      throw e;
    }
    reply.header('Content-Type', 'image/jpeg');
    reply.header('Cache-Control', 'private, max-age=86400');
    return buf;
  });
}
