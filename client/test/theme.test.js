import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeTheme, nextTheme, THEMES } from '../src/lib/theme.js';

test('normalizeTheme falls back to light', () => {
  assert.equal(normalizeTheme('dark'), 'dark');
  assert.equal(normalizeTheme('light'), 'light');
  assert.equal(normalizeTheme('purple'), 'light');
  assert.equal(normalizeTheme(null), 'light');
});

test('nextTheme cycles through all themes', () => {
  let t = 'light';
  const seen = [];
  for (let i = 0; i < THEMES.length; i++) { t = nextTheme(t); seen.push(t); }
  assert.deepEqual(seen.sort(), THEMES.slice().sort());
  assert.equal(nextTheme('junk'), 'dark', 'junk counts as light');
});
