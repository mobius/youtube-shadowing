const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const core = require('../core.js');

test('SRT accepts BOM, CRLF, multiline text and hour offsets', () => {
  const cues = core.parseText('﻿1\r\n01:02:03,250 --> 01:02:06,500\r\nHello <i>world</i>\r\n&amp; friends!\r\n\r\n2\r\n01:02:07,000 --> 01:02:08,000\r\nNext sentence.');
  assert.deepEqual(cues[0], { start: 3723.25, end: 3726.5, text: 'Hello world & friends!' });
  assert.equal(cues.length, 2);
});

test('VTT accepts cue identifiers, settings, short timestamps and inline timestamps', () => {
  const cues = core.parseText('WEBVTT\n\nNOTE sample --> ignored\n00:01.000 --> 00:02.000\nComment\n\ncue-1\n00:02.000 --> 00:04.250 align:start position:10%\n<v Speaker>Try <00:03.000>again.</v>');
  assert.deepEqual(cues, [{ start: 2, end: 4.25, text: 'Try again.' }]);
});

test('invalid, reversed and empty cues are excluded', () => {
  assert.deepEqual(core.parseText('1\n00:00:04,000 --> 00:00:02,000\nBackwards\n\n2\n00:61:00,000 --> 00:62:00,000\nInvalid\n\n3\n00:00:01,000 --> 00:00:02,000\n'), []);
  assert.deepEqual(core.normalize([{ start: -1, end: 2, text: 'bad' }, { start: 1, end: Infinity, text: 'bad' }]), []);
});

test('YouTube JSON3 joins word segments and ignores style-only events', () => {
  const data = { events: [{ tStartMs: 0 }, { tStartMs: 1500, dDurationMs: 2500, segs: [{ utf8: 'Hello' }, { utf8: ' world' }] }, { tStartMs: 5000, dDurationMs: 1000, segs: [{ utf8: '\n' }] }] };
  assert.deepEqual(core.parsePayload(JSON.stringify(data)), [{ start: 1.5, end: 4, text: 'Hello world' }]);
});

test('bundled example is valid and chronologically ordered', () => {
  const cues = core.parseText(fs.readFileSync(path.join(__dirname, '../examples/practice.vtt'), 'utf8'));
  assert.equal(cues.length, 5);
  assert.ok(cues.every((cue, i) => !i || cue.start >= cues[i - 1].end));
});

test('extension manifest references existing files and least required permissions', () => {
  const base = path.join(__dirname, '..');
  const manifest = JSON.parse(fs.readFileSync(path.join(base, 'manifest.json'), 'utf8'));
  assert.equal(manifest.manifest_version, 3);
  assert.deepEqual(manifest.permissions, ['storage']);
  for (const file of [manifest.background.service_worker, ...manifest.content_scripts.flatMap(c => c.js), ...manifest.web_accessible_resources.flatMap(r => r.resources)]) {
    assert.ok(fs.existsSync(path.join(base, file)), file);
  }
  assert.ok(manifest.content_scripts.some(c => c.world === 'MAIN' && c.js.includes('bridge.js')));
});
