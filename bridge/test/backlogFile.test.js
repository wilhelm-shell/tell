import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, statSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileStore } from '../src/backlogFile.js';

function tempPath() {
  const dir = mkdtempSync(join(tmpdir(), 'tell-backlog-'));
  return { dir, path: join(dir, 'sub', 'backlog.json') };
}

test('round trip; creates missing directories; leaves no temp file', async () => {
  const { dir, path } = tempPath();
  try {
    const s = fileStore(path);
    assert.deepEqual(s.load(), [], 'missing file is an empty backlog');
    await s.save([{ type: 'signal.message', text: 'a' }, { text: 'b' }]);
    assert.equal(existsSync(path + '.tmp'), false);
    assert.deepEqual(fileStore(path).load().map((f) => f.text), ['a', 'b']);
    if (process.platform !== 'win32') {
      assert.equal(statSync(path).mode & 0o777, 0o600);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('corrupt or wrong-shaped file loads as empty', () => {
  const { dir, path } = tempPath();
  try {
    const s = fileStore(path);
    mkdirSync(join(dir, 'sub'), { recursive: true });
    writeFileSync(path, '{not json');
    assert.deepEqual(s.load(), []);
    writeFileSync(path, '{"an":"object"}');
    assert.deepEqual(s.load(), []);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
