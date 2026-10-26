'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./helpers/typescript.cjs');
const {
  extractEmbeddedVersion,
  heuristicReleaseGroups,
  rootApplicationName,
} = require('../src/lib/admin/release-review.ts');

test('extracts a dotted release from a title without guessing missing versions', () => {
  assert.equal(extractEmbeddedVersion('CapCut 19.8.0'), '19.8.0');
  assert.equal(extractEmbeddedVersion('VLC Player'), null);
  assert.equal(rootApplicationName('CapCut 19.8.0'), 'CapCut');
});

test('suggests same-platform app rows with title-embedded versions and keeps their versions ordered', () => {
  const rows = [
    { id: 12, name: 'CapCut 19.7.0', version: null, platform: 'Android', revision: 1 },
    { id: 13, name: 'CapCut 19.8.0', version: null, platform: 'Android', revision: 1 },
    { id: 14, name: 'CapCut 19.9.0', version: '19.9.0', platform: 'Android', revision: 1 },
    { id: 15, name: 'CapCut 19.8.0', version: null, platform: 'Windows', revision: 1 },
  ];
  const groups = heuristicReleaseGroups(rows);
  assert.equal(groups.length, 1);
  assert.equal(groups[0].canonical_name, 'CapCut');
  assert.deepEqual(groups[0].items.map(item => item.id), [12, 13, 14]);
  assert.deepEqual(groups[0].items.map(item => item.version_suggestion), ['19.7.0', '19.8.0', null]);
  assert.ok(groups[0].items.every(item => /^[a-f0-9]{64}$/.test(item.revision)));
});

test('does not suggest merging records already grouped by the same exact title and platform', () => {
  const groups = heuristicReleaseGroups([
    { id: 1, name: 'CapCut', version: '19.7.0', platform: 'Android', revision: 1 },
    { id: 2, name: 'CapCut', version: '19.8.0', platform: 'Android', revision: 1 },
  ]);
  assert.equal(groups.length, 0);
});

test('keeps different operating systems out of one proposed group', () => {
  const groups = heuristicReleaseGroups([
    { id: 1, name: 'CapCut 19.7.0', version: null, platform: 'Android', revision: 1 },
    { id: 2, name: 'CapCut 19.8.0', version: null, platform: 'Windows', revision: 1 },
  ]);
  assert.equal(groups.length, 0);
});
