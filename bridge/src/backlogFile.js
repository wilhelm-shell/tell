// File-backed store for the backlog: one JSON array in the data volume.
// Plaintext on disk by design (E2E terminates on the bridge; CLAUDE.md),
// capped by the backlog itself, mode 0600, and switchable off.
import { readFileSync } from 'node:fs';
import { mkdir, writeFile, rename } from 'node:fs/promises';
import { dirname } from 'node:path';

export function fileStore(path) {
  return {
    path,

    // Startup only, so synchronous is fine. A missing or corrupt file is
    // an empty backlog, never a fatal error: losing recent history is
    // acceptable, refusing to boot is not.
    load() {
      let raw;
      try { raw = readFileSync(path, 'utf8'); }
      catch (_) { return []; }
      try {
        const parsed = JSON.parse(raw);
        return Array.isArray(parsed) ? parsed : [];
      } catch (_) {
        return [];
      }
    },

    // Write to a sibling temp file, then rename over the real one: rename
    // is atomic on POSIX, so a crash mid-write leaves the old file intact.
    async save(frames) {
      await mkdir(dirname(path), { recursive: true });
      const tmp = path + '.tmp';
      await writeFile(tmp, JSON.stringify(frames), { mode: 0o600 });
      await rename(tmp, path);
    },
  };
}
