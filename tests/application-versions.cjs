'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
require('./helpers/typescript.cjs');
const {
  applicationFamilyKey,
  compareApplicationVersions,
  latestPerApplication,
  sortApplicationVersions,
} = require('../src/lib/catalog/versions.ts');

const row = (id, name, version, platform = 'Android', createdAt = '2026-01-01T00:00:00.000Z') =>
  ({ id, name, version, platform, createdAt: new Date(createdAt) });

test('family identity normalizes casing, punctuation, underscores, embedded versions and file suffixes', () => {
  assert.equal(applicationFamilyKey(row(1, 'CapCut.apk', '1.2')), applicationFamilyKey(row(2, 'cap-cut', '1.3')));
  assert.equal(applicationFamilyKey(row(3, '01 CAPCUT PRO 19.7.0.apk', '19.7.0')), applicationFamilyKey(row(4, 'Cap cut pro v19.8.0', '19.8.0')));
  assert.notEqual(applicationFamilyKey(row(5, 'CapCut', '1.3', 'Android')), applicationFamilyKey(row(6, 'CapCut', '1.3', 'Windows')));
});

test('numeric version ordering treats 1.10 as newer than 1.9', () => {
  assert.ok(compareApplicationVersions(row(2, 'CapCut', '1.10'), row(1, 'CapCut', '1.9')) > 0);
  assert.deepEqual(sortApplicationVersions([
    row(1, 'CapCut', '1.9'),
    row(2, 'CapCut', '1.10'),
    row(3, 'CapCut', '2.0'),
  ]).map(item => item.version), ['2.0', '1.10', '1.9']);
});

test('latest listing chooses the numerically highest release and keeps OS tracks separate', () => {
  const rows = [
    row(1, 'CapCut', '1.2', 'Android', '2026-03-01T00:00:00Z'),
    row(2, 'CapCut', '1.8', 'Android', '2026-01-01T00:00:00Z'),
    row(3, 'VLC', '3.0', 'Android', '2026-02-01T00:00:00Z'),
    row(4, 'CapCut', '1.10', 'Windows', '2026-04-01T00:00:00Z'),
  ];
  assert.deepEqual(latestPerApplication(rows).map(item => item.id), [2, 3, 4]);
});

test('when metadata version is empty, title version determines the latest release', () => {
  const oldRelease = row(10, 'CapCut Pro 19.7.0', null, 'Android', '2026-03-01T00:00:00Z');
  const newRelease = row(11, 'CapCut Pro 19.8.0', null, 'Android', '2026-01-01T00:00:00Z');
  assert.equal(applicationFamilyKey(oldRelease), applicationFamilyKey(newRelease));
  assert.deepEqual(latestPerApplication([oldRelease, newRelease]).map(item => item.id), [11]);
});

test('stable release outranks the matching prerelease and recent metadata breaks ties', () => {
  assert.ok(compareApplicationVersions(row(9, 'CapCut', '2.0'), row(10, 'CapCut', '2.0-beta')) > 0);
  assert.ok(compareApplicationVersions(row(4, 'CapCut', '1.2', 'Android', '2026-02-01T00:00:00Z'), row(3, 'CapCut', '1.2')) > 0);
});

test('records with missing names do not collapse together', () => {
  assert.notEqual(applicationFamilyKey({ id: 1, name: null, platform: null }), applicationFamilyKey({ id: 2, name: null, platform: null }));
});
