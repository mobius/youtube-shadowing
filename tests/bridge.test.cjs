const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
const code = fs.readFileSync(path.join(__dirname, '../bridge.js'), 'utf8');

function harness(fetcher, getResponse) {
  let handler;
  const messages = [];
  const location = { href: 'https://www.youtube.com/watch?v=A', origin: 'https://www.youtube.com' };
  const window = { addEventListener: (_, fn) => { handler = fn; }, postMessage: msg => messages.push(msg) };
  vm.runInNewContext(code, { window, location, document: { getElementById: () => ({ getPlayerResponse: getResponse }) }, URL, AbortController, fetch: fetcher,
    setTimeout: (fn, ms) => setTimeout(fn, ms === 250 ? 1 : ms), clearTimeout });
  return { messages, location, request: (id, videoId) => handler({ source: window, origin: location.origin, data: { type: 'shadowing:captions:request', id, videoId } }) };
}
const response = id => ({ videoDetails: { videoId: id }, captions: { playerCaptionsTracklistRenderer: { captionTracks: [{ languageCode: 'en', baseUrl: `https://www.youtube.com/api/timedtext?v=${id}` }] } } });

test('new video caption request supersedes an in-flight request', async () => {
  let current = 'A';
  let oldAborted = false;
  const h = harness(async (url, { signal }) => {
    if (url.searchParams.get('v') === 'A') {
      await new Promise((resolve, reject) => signal.addEventListener('abort', () => { oldAborted = true; reject(new Error('aborted')); }, { once: true }));
    }
    return { ok: true, text: async () => '{"events":[]}' };
  }, () => response(current));
  const first = h.request('first', 'A');
  current = 'B';
  h.location.href = 'https://www.youtube.com/watch?v=B';
  await Promise.all([first, h.request('second', 'B')]);
  assert.equal(oldAborted, true);
  assert.equal(h.messages.length, 1);
  assert.equal(h.messages[0].id, 'second');
  assert.equal(h.messages[0].videoId, 'B');
  assert.ok(h.messages[0].payload);
});

test('caption loader waits for player metadata after SPA navigation', async () => {
  let reads = 0;
  const h = harness(async () => ({ ok: true, text: async () => '{"events":[]}' }), () => response(++reads < 3 ? 'previous' : 'A'));
  await h.request('delayed', 'A');
  assert.equal(reads, 3);
  assert.equal(h.messages.length, 1);
  assert.ok(h.messages[0].payload);
});
