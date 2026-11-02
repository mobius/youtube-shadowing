const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createScreenCollector } = require('../core');
function feed(frames) {
  const collector = createScreenCollector();
  frames.forEach(([time, text]) => collector.push(text, time));
  return collector.cues;
}
test('growing auto captions update one cue and split on sentence punctuation', () => {
  const cues = feed([[9, 'Hey'], [9.2, 'Hey everybody,'], [9.4, 'Hey everybody, this'], [9.6, 'Hey everybody, this is Russ'], [10, 'Hey everybody, this is Russ from Retro Gamecore.'], [10.4, 'Hey everybody, this is Russ from Retro Gamecore. Let’s'], [10.8, 'Hey everybody, this is Russ from Retro Gamecore. Let’s take a break.']]);
  assert.deepEqual(cues.map(c => c.text), ['Hey everybody, this is Russ from Retro Gamecore.', 'Let’s take a break.']);
  assert.equal(cues[0].start, 8.85);
  assert.ok(cues[0].end < cues[1].end);
});
test('rolling lines remove duplicate prefix without losing earlier words', () => {
  const cues = feed([[1, 'Let us take'], [1.4, 'Let us take a break from reviews'], [1.8, 'a break from reviews for a minute'], [2.2, 'reviews for a minute and just talk.']]);
  assert.deepEqual(cues.map(c => c.text), ['Let us take a break from reviews for a minute and just talk.']);
});
test('single-word frames accumulate until a sentence boundary', () => {
  assert.deepEqual(feed([[1, 'This'], [1.3, 'is'], [1.6, 'a'], [1.9, 'sentence.'], [2.3, 'Next'], [2.7, 'one.']]).map(c => c.text), ['This is a sentence.', 'Next one.']);
});
test('punctuation revisions split before the next words', () => {
  assert.deepEqual(feed([[1, 'Hello world'], [1.3, 'Hello world. Next'], [1.6, 'Hello world. Next sentence.']]).map(c => c.text), ['Hello world.', 'Next sentence.']);
});
test('brief blank does not split a sentence, long silence does', () => {
  assert.deepEqual(feed([[1, 'A short'], [1.2, ''], [1.4, 'A short sentence'], [1.7, ''], [2.5, ''], [2.7, 'A new sentence.']]).map(c => c.text), ['A short sentence', 'A new sentence.']);
});
test('seek backward starts a new cue and preserves recorded times', () => {
  const cues = feed([[10, 'Before seek'], [10.2, 'Before seek.'], [2, 'After seek.']]);
  assert.equal(cues.length, 2);
  assert.equal(cues[1].start, 1.85);
});
test('unpunctuated speech is bounded to practice-sized phrases', () => {
  const collector = createScreenCollector();
  let text = '';
  for (let i = 0; i < 60; i++) { text += ` word${i}`; collector.push(text, i * 0.2); }
  assert.deepEqual(collector.cues.map(c => c.text.split(' ').length), [28, 28, 4]);
});
test('tail correction replaces words instead of duplicating the phrase', () => {
  assert.deepEqual(feed([[1, 'I like red'], [1.3, 'I like blue'], [1.6, 'I like blue cars.']]).map(c => c.text), ['I like blue cars.']);
});
test('brief shrink of the displayed prefix does not duplicate it', () => {
  assert.deepEqual(feed([[1, 'We can do this'], [1.3, 'We can'], [1.5, 'We can do this together.']]).map(c => c.text), ['We can do this together.']);
});
