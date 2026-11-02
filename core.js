/* Shared subtitle utilities: browser content script and Node tests. */
(function (root) {
  'use strict';
  const MAX_CUES = 10000;
  function clean(text) {
    return String(text ?? '').replace(/<[^>]*>/g, '').replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'").replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function normalize(cues) {
    return cues.map(c => ({ start: Number(c.start), end: Number(c.end), text: clean(c.text).slice(0, 2000) }))
      .filter(c => Number.isFinite(c.start) && Number.isFinite(c.end) && c.start >= 0 && c.end > c.start && c.text)
      .sort((a, b) => a.start - b.start).slice(0, MAX_CUES);
  }
  function timestamp(value) {
    const parts = value.replace(',', '.').split(':').map(Number);
    if (parts.length < 2 || parts.length > 3 || parts.some(p => !Number.isFinite(p) || p < 0)) return NaN;
    if (parts.at(-1) >= 60 || (parts.length === 3 && parts[1] >= 60)) return NaN;
    return parts.reduce((total, part) => total * 60 + part, 0);
  }
  function parseText(text) {
    const cues = [];
    const blocks = text.replace(/^﻿/, '').replace(/\r/g, '').split(/\n\s*\n/);
    for (const block of blocks) {
      if (/^(NOTE|STYLE|REGION)(\s|$)/.test(block.trim())) continue;
      const lines = block.split('\n');
      const index = lines.findIndex(line => line.includes('-->'));
      if (index < 0) continue;
      const match = lines[index].match(/((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})\s*-->\s*((?:\d+:)?\d{2}:\d{2}[.,]\d{1,3})/);
      if (match) cues.push({ start: timestamp(match[1]), end: timestamp(match[2]), text: lines.slice(index + 1).join(' ') });
    }
    return normalize(cues);
  }
  function parseJson(data) {
    return normalize((data.events || []).filter(e => e.segs?.length).map(e => ({
      start: e.tStartMs / 1000,
      end: (e.tStartMs + (e.dDurationMs || 3000)) / 1000,
      text: e.segs.map(s => s.utf8 || '').join('')
    })));
  }
  function parsePayload(text) {
    if (text.trim().startsWith('{')) return parseJson(JSON.parse(text));
    if (text.trim().startsWith('<')) {
      const doc = new DOMParser().parseFromString(text, 'application/xml');
      if (doc.querySelector('parsererror')) throw new Error('字幕格式无法解析');
      const nodes = [...doc.querySelectorAll('text, p[t]')];
      return normalize(nodes.map(node => {
        const milliseconds = node.tagName === 'p';
        const start = Number(node.getAttribute(milliseconds ? 't' : 'start')) / (milliseconds ? 1000 : 1);
        const duration = Number(node.getAttribute(milliseconds ? 'd' : 'dur') || (milliseconds ? 3000 : 3)) / (milliseconds ? 1000 : 1);
        return { start, end: start + duration, text: node.textContent };
      }));
    }
    return parseText(text);
  }
  function formatTime(seconds) {
    const whole = Math.max(0, Math.floor(seconds || 0));
    return `${Math.floor(whole / 60)}:${String(whole % 60).padStart(2, '0')}`;
  }
  // A screen caption is a moving word window, not a new cue on every DOM update.
  function createScreenCollector() {
    const cues = [];
    let previous = [];
    let active = null;
    let lastTime = null;
    let lastVisible = null;
    const wordsByCue = new WeakMap();
    const key = word => word.toLowerCase().replace(/[.,!?;:"“”‘’()[\]]/g, '');
    const endsSentence = text => /[.!?]["”’')\]]*$/.test(text) && !/\b(?:Mr|Mrs|Ms|Dr|Prof|Sr|Jr|St|vs|etc)\.$/i.test(text) && !/\b[A-Z]\.$/.test(text);
    function resetWindow() { previous = []; active = null; lastTime = null; lastVisible = null; }
    function push(text, time) {
      if (!Number.isFinite(time)) return false;
      const incoming = clean(text).split(/\s+/).filter(Boolean);
      if (lastTime !== null && (time < lastTime - 0.05 || time - lastTime > 1.5)) resetWindow();
      lastTime = time;
      if (!incoming.length) {
        if (lastVisible !== null && time - lastVisible > 0.9) { previous = []; active = null; }
        return false;
      }
      if (lastVisible !== null && time - lastVisible > 1.2) { previous = []; active = null; }
      lastVisible = time;
      let overlap = 0;
      for (let size = Math.min(previous.length, incoming.length); size > 0; size--) {
        if (previous.slice(-size).every((entry, i) => key(entry.word) === key(incoming[i]))) { overlap = size; break; }
      }
      // A line may briefly shrink while YouTube moves it to the previous row.
      if (!overlap && incoming.length < previous.length && incoming.every((word, i) => key(word) === key(previous[i].word))) return false;
      let prefix = 0;
      while (prefix < Math.min(previous.length, incoming.length) && key(previous[prefix].word) === key(incoming[prefix])) prefix++;
      if (!overlap && prefix > 0 && prefix >= Math.min(previous.length, incoming.length) / 2) {
        const removed = previous.slice(prefix);
        const activeWords = active && wordsByCue.get(active);
        if (removed.length && removed.every(entry => entry.cue === active) && activeWords.slice(-removed.length).every((entry, i) => entry === removed[i])) {
          activeWords.splice(-removed.length);
          previous = previous.slice(0, prefix);
          overlap = prefix;
        }
      }
      const screen = overlap ? previous.slice(-overlap) : [];
      const touched = new Set();
      for (let i = 0; i < overlap; i++) {
        if (screen[i].word !== incoming[i]) { screen[i].word = incoming[i]; touched.add(screen[i].cue); }
      }
      // Apply punctuation revisions before deciding where new words belong.
      for (const cue of touched) cue.text = wordsByCue.get(cue).map(entry => entry.word).join(' ');
      for (const word of incoming.slice(overlap)) {
        const activeWords = active && wordsByCue.get(active);
        if (active && (endsSentence(active.text) || activeWords.length >= 28 || time - active.start >= 12)) active = null;
        if (!active) {
          if (cues.length >= MAX_CUES) break;
          active = { start: Math.max(0, time - 0.15), end: time + 0.25, text: '' };
          wordsByCue.set(active, []);
          cues.push(active);
        }
        const entry = { word, cue: active };
        wordsByCue.get(active).push(entry);
        screen.push(entry);
        active.text = wordsByCue.get(active).map(item => item.word).join(' ');
        active.end = time + 0.25;
        touched.add(active);
      }
      previous = screen;
      // Extend only the spoken tail, not old sentences retained on the screen.
      if (active && screen.at(-1)?.cue === active) active.end = Math.max(active.end, time + 0.25);
      return touched.size > 0;
    }
    return { cues, push, breakContinuity: resetWindow };
  }
  const api = { clean, normalize, timestamp, parseText, parseJson, parsePayload, formatTime, createScreenCollector };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.ShadowingCore = api;
})(globalThis);
