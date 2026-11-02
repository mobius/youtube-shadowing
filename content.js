(() => {
  'use strict';
  if (document.getElementById('shadowing-notebook')) return;
  const core = globalThis.ShadowingCore;
  const host = document.createElement('div');
  host.id = 'shadowing-notebook';
  const root = host.attachShadow({ mode: 'open' });
  const css = document.createElement('link');
  css.rel = 'stylesheet';
  css.href = chrome.runtime.getURL('panel.css');
  root.append(css);
  const app = document.createElement('div');
  // DOM construction avoids HTML injection sinks and works with Trusted Types.
  const layout = [
    ["button", {"class": "launcher", "aria-label": "打开跟读练习本", "hidden": ""}, [["span", {"aria-hidden": "true"}, ["◖"]], " 展开跟读练习本"]],
    ["aside", {"class": "panel", "aria-label": "跟读练习本", "hidden": ""}, [
      ["header", {}, [
        ["div", {"class": "brand"}, [
          ["span", {"class": "brand-icon", "aria-hidden": "true"}, ["◖"]],
          ["div", {}, [["h1", {}, ["跟读练习本"]], ["span", {"class": "brand-sub"}, ["YouTube Shadowing"]]]]
        ]],
        ["button", {"class": "icon close", "aria-label": "收起练习面板", "title": "收起练习面板"}, ["−"]]
      ]],
      ["div", {"class": "context"}, [
        ["span", {"class": "video-title"}, ["打开一个 YouTube 视频开始练习"]],
        ["div", {"class": "source-row"}, [
          ["span", {"class": "source"}, ["尚未载入字幕"]],
          ["button", {"class": "text-button reload"}, ["重新读取"]]
        ]]
      ]],
      ["section", {"class": "practice", "aria-label": "当前句练习"}, [
        ["div", {"class": "cue-meta"}, [
          ["span", {"class": "position"}, ["准备开始"]],
          ["div", {}, [
            ["button", {"class": "icon previous", "aria-label": "上一句", "disabled": ""}, ["‹"]],
            ["button", {"class": "icon next", "aria-label": "下一句", "disabled": ""}, ["›"]]
          ]]
        ]],
        ["p", {"class": "sentence", "lang": "en"}, ["Listen. Repeat.", ["br", {}, []], "Make it yours."]],
        ["p", {"class": "cue-time"}, ["选一句英文，听清楚，再跟着说。"]],
        ["div", {"class": "play-row"}, [
          ["button", {"class": "primary play", "disabled": ""}, [["span", {"aria-hidden": "true"}, ["▶"]], " 听这一句"]],
          ["label", {"class": "loop-label"}, [["input", {"class": "loop", "type": "checkbox"}, []], " 循环"]],
          ["label", {"class": "speed-label"}, [
            ["span", {"class": "sr-only"}, ["播放速度"]],
            ["select", {"class": "speed", "aria-label": "播放速度"}, [
              ["option", {"value": "0.6"}, ["0.6×"]],
              ["option", {"value": "0.75"}, ["0.75×"]],
              ["option", {"value": "0.9"}, ["0.9×"]],
              ["option", {"value": "1", "selected": ""}, ["1.0×"]],
              ["option", {"value": "1.25"}, ["1.25×"]]
            ]]
          ]]
        ]],
        ["div", {"class": "record-row"}, [
          ["button", {"class": "record", "disabled": ""}, [
            ["span", {"class": "record-dot", "aria-hidden": "true"}, []],
            ["span", {"class": "record-label"}, ["开始录音"]]
          ]],
          ["span", {"class": "record-hint"}, ["听一遍，然后自己说"]]
        ]],
        ["div", {"class": "recording-result", "hidden": ""}, [
          ["div", {"class": "recording-meta"}, [
            ["span", {}, ["我的跟读"]],
            ["a", {"class": "download", "download": "shadowing.webm"}, ["保存录音"]]
          ]],
          ["audio", {"class": "replay", "controls": "", "aria-label": "回听我的录音"}, []]
        ]],
        ["p", {"class": "status", "role": "status", "aria-live": "polite"}, ["正在寻找英文字幕…"]]
      ]],
      ["section", {"class": "transcript", "aria-label": "英文字幕"}, [
        ["div", {"class": "transcript-header"}, [
          ["h2", {}, ["逐句练习 ", ["span", {"class": "count"}, ["0"]]]],
          ["button", {"class": "text-button locate", "disabled": ""}, ["定位当前"]]
        ]],
        ["input", {"class": "search", "type": "search", "aria-label": "搜索字幕", "placeholder": "搜索字幕中的单词…", "maxlength": "200"}, []],
        ["div", {"class": "cue-list", "role": "list", "aria-label": "字幕列表"}, [
          ["div", {"class": "empty"}, ["英文字幕载入后会显示在这里。", ["br", {}, []], "也可以导入你准备好的字幕文件。"]]
        ]]
      ]],
      ["footer", {}, [
        ["div", {"class": "tools"}, [
          ["button", {"class": "text-button import"}, ["导入字幕"]],
          ["button", {"class": "text-button capture", "aria-pressed": "false"}, ["收集屏幕字幕"]],
          ["a", {"class": "help", "target": "_blank", "rel": "noopener"}, ["使用说明 ↗"]]
        ]],
        ["p", {"class": "privacy"}, ["录音只保存在本页，关闭后清除。"]],
        ["input", {"class": "file", "type": "file", "accept": ".srt,.vtt,text/vtt,application/x-subrip", "hidden": ""}, []]
      ]]
    ]]
  ];
  function buildNode(spec) {
    if (typeof spec === 'string') return document.createTextNode(spec);
    const [tag, attributes, children] = spec;
    const element = document.createElement(tag);
    for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
    element.append(...children.map(buildNode));
    return element;
  }
  app.append(...layout.map(buildNode));
  root.append(app);
  // Keep the notebook in YouTube's document flow instead of covering the player.
  let observedWatch = null;
  const layoutObserver = new MutationObserver(mountNotebook);
  function mountNotebook() {
    const watch = document.querySelector('ytd-watch-flexy:not([hidden])');
    if (watch !== observedWatch) {
      layoutObserver.disconnect();
      observedWatch = watch;
      if (watch) layoutObserver.observe(watch, { attributes: true, attributeFilter: ['is-two-columns_', 'theater', 'hidden'] });
    }
    if (location.pathname !== '/watch' || !new URL(location.href).searchParams.get('v') || !watch) {
      host.remove();
      return;
    }
    const sidebar = watch.hasAttribute('is-two-columns_') && watch.querySelector('#secondary-inner');
    const target = sidebar || watch.querySelector('#below');
    if (!target) return;
    if (host.parentElement !== target || target.firstElementChild !== host) {
      // Modern Chrome preserves media state when moving a connected panel.
      if (target.moveBefore && host.isConnected) target.moveBefore(host, target.firstChild);
      else target.prepend(host);
    }
  }
  mountNotebook();
  window.addEventListener('resize', mountNotebook);
  document.addEventListener('yt-navigate-finish', mountNotebook);
  // YouTube may replace its columns after SPA navigation has already finished.
  setInterval(mountNotebook, 1000);
  const $ = selector => root.querySelector(selector);
  const panel = $('.panel');
  const launcher = $('.launcher');
  $('.help').href = chrome.runtime.getURL('help.html');
  let videoId = null;
  let cues = [];
  let selected = -1;
  let visible = false;
  let closedByUser = false;
  let loadId = null;
  let loadTimer;
  let playback = null;
  let capturing = false;
  let screenCollector = null;
  let recorder = null;
  let stream = null;
  let recordingPending = false;
  let recordingToken = 0;
  let recordingStarted = 0;
  let recordingLimit;
  let recordingUrl;
  let currentSource = '';

  const video = () => document.querySelector('#movie_player video.html5-main-video, #movie_player video');
  const isAd = () => !!document.querySelector('#movie_player.ad-showing, #movie_player.ad-interrupting');
  const say = (text, error = false) => {
    $('.status').textContent = text;
    $('.status').classList.toggle('error', error);
  };
  const saveSettings = () => chrome.storage.local.set({ shadowingSettings: { speed: $('.speed').value, loop: $('.loop').checked } }).catch(() => {});
  chrome.storage.local.get('shadowingSettings').then(({ shadowingSettings: settings }) => {
    if (!settings) return;
    if (['0.6', '0.75', '0.9', '1', '1.25'].includes(settings.speed)) $('.speed').value = settings.speed;
    $('.loop').checked = !!settings.loop;
  }).catch(() => {});

  function show(open) {
    visible = open && !!videoId;
    panel.hidden = !visible;
    launcher.hidden = visible || !videoId;
    if (!visible) {
      stopPlayback();
      stopRecording(true);
      clearRecording();
      capturing = false;
      screenCollector = null;
      updateCapture();
    }
  }
  function stopPlayback() {
    if (!playback) return;
    const previous = playback;
    playback = null;
    clearTimeout(previous.gapTimer);
    // An inserted ad reuses the video element; let it finish playing.
    if (!isAd()) previous.element.pause();
    previous.element.playbackRate = previous.oldRate;
    $('.play').textContent = '▶ 听这一句';
  }
  function clearRecording() {
    const audio = $('.replay');
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
    if (recordingUrl) URL.revokeObjectURL(recordingUrl);
    recordingUrl = null;
    $('.download').removeAttribute('href');
    $('.recording-result').hidden = true;
  }
  function stopRecording(discard = false) {
    recordingPending = false;
    if (discard) recordingToken++;
    clearTimeout(recordingLimit);
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    recorder = null;
    stream?.getTracks().forEach(track => track.stop());
    stream = null;
    $('.record').classList.remove('active');
    $('.record-label').textContent = '开始录音';
    $('.record-hint').textContent = '听一遍，然后自己说';
  }
  async function record() {
    if (recorder || recordingPending) { stopRecording(recordingPending); return; }
    if (selected < 0) return;
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) {
      say('此浏览器无法录音，请使用最新版 Chrome。', true); return;
    }
    stopPlayback();
    video()?.pause();
    clearRecording();
    const token = ++recordingToken;
    recordingPending = true;
    $('.record-label').textContent = '取消授权等待';
    say('请允许 YouTube 使用麦克风；只录制你的声音。');
    try {
      const input = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true }, video: false });
      if (token !== recordingToken || !visible) { input.getTracks().forEach(t => t.stop()); return; }
      stream = input;
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(input, mimeType ? { mimeType } : undefined);
      const chunks = [];
      const recordedCue = selected;
      instance.ondataavailable = event => { if (event.data.size) chunks.push(event.data); };
      instance.onerror = () => { stopRecording(true); say('录音发生错误，请检查麦克风后重试。', true); };
      instance.onstop = () => {
        if (recorder === instance) stopRecording();
        input.getTracks().forEach(t => t.stop());
        if (token !== recordingToken || !chunks.length || !visible) return;
        const blob = new Blob(chunks, { type: instance.mimeType || 'audio/webm' });
        recordingUrl = URL.createObjectURL(blob);
        $('.replay').src = recordingUrl;
        $('.download').href = recordingUrl;
        const extension = blob.type.includes('mp4') ? 'm4a' : 'webm';
        $('.download').download = `${videoId}-sentence-${recordedCue + 1}.${extension}`;
        $('.recording-result').hidden = false;
        say('录好了。回听自己的声音，再听原声，比较重音和停顿。');
      };
      recorder = instance;
      recordingPending = false;
      recordingStarted = Date.now();
      instance.start();
      $('.record').classList.add('active');
      $('.record-label').textContent = '停止录音';
      say('正在录音，点击「停止录音」结束。最长 60 秒。');
      recordingLimit = setTimeout(() => stopRecording(), 60000);
    } catch (error) {
      if (token !== recordingToken) return;
      stopRecording(true);
      const reason = error.name === 'NotAllowedError' ? '麦克风权限未开启。请点击地址栏的网站设置，允许麦克风后重试。' : error.name === 'NotFoundError' ? '没有找到麦克风，请连接设备后重试。' : '麦克风无法使用，请检查设备是否被其他程序占用。';
      say(reason, true);
    }
  }
  function renderList() {
    const list = $('.cue-list');
    list.replaceChildren();
    const query = $('.search').value.trim().toLowerCase();
    const fragment = document.createDocumentFragment();
    let rendered = 0;
    let matched = 0;
    cues.forEach((cue, index) => {
      if (query && !cue.text.toLowerCase().includes(query)) return;
      matched++;
      if (rendered >= 500) return;
      rendered++;
      const row = document.createElement('div');
      row.setAttribute('role', 'listitem');
      const button = document.createElement('button');
      button.className = 'cue';
      button.dataset.index = index;
      button.setAttribute('aria-current', String(index === selected));
      const time = document.createElement('span');
      time.className = 'timestamp';
      time.textContent = core.formatTime(cue.start);
      const text = document.createElement('span');
      text.lang = 'en';
      text.textContent = cue.text;
      button.append(time, text);
      row.append(button);
      fragment.append(row);
    });
    if (!rendered) {
      const empty = document.createElement('div');
      empty.className = 'empty';
      empty.textContent = cues.length ? '没有找到匹配的字幕，换一个单词试试。' : '暂无字幕。可重新读取、导入 SRT/VTT，或开启英文 CC 后收集屏幕字幕。';
      fragment.append(empty);
    }
    if (matched > 500) {
      const note = document.createElement('div');
      note.className = 'empty';
      note.textContent = '仅显示前 500 条匹配结果。可搜索、定位当前句，或用上下句浏览全部字幕。';
      fragment.append(note);
    }
    list.append(fragment);
    $('.count').textContent = cues.length;
    $('.locate').disabled = !cues.length;
  }
  function renderSelection() {
    const cue = cues[selected];
    $('.previous').disabled = selected <= 0;
    $('.next').disabled = selected < 0 || selected >= cues.length - 1;
    $('.play').disabled = !cue;
    $('.record').disabled = !cue;
    $('.position').textContent = cue ? `第 ${selected + 1} / ${cues.length} 句` : '准备开始';
    $('.sentence').textContent = cue ? cue.text : 'Listen. Repeat. Make it yours.';
    $('.cue-time').textContent = cue ? `${core.formatTime(cue.start)} — ${core.formatTime(cue.end)}` : '选一句英文，听清楚，再跟着说。';
    root.querySelectorAll('.cue').forEach(row => row.setAttribute('aria-current', String(Number(row.dataset.index) === selected)));
  }
  function select(index) {
    if (index < 0 || index >= cues.length) return;
    stopPlayback();
    stopRecording(true);
    clearRecording();
    selected = index;
    renderSelection();
    say('先听原声，再录下你的跟读。');
  }
  function setCues(next, source) {
    stopPlayback();
    stopRecording(true);
    clearRecording();
    cues = next;
    selected = next.length ? 0 : -1;
    currentSource = source;
    $('.source').textContent = source;
    $('.search').value = '';
    renderList();
    renderSelection();
  }
  async function play() {
    if (playback) { stopPlayback(); return; }
    const cue = cues[selected];
    const element = video();
    if (!cue || !element) { say('没有找到视频播放器。请等待视频加载完成。', true); return; }
    if (isAd()) { say('请等待广告结束，再开始跟读。', true); return; }
    if (Number.isFinite(element.duration) && cue.start >= element.duration) { say('这句字幕超出了视频时长，请检查字幕是否匹配。', true); return; }
    stopRecording(true);
    $('.replay').pause();
    const state = { element, oldRate: element.playbackRate, start: cue.start, end: Math.min(cue.end, Number.isFinite(element.duration) ? element.duration : cue.end), gap: false, gapTimer: null };
    playback = state;
    element.playbackRate = Number($('.speed').value);
    element.currentTime = state.start;
    $('.play').textContent = '■ 停止播放';
    try {
      await element.play();
      if (playback === state) say($('.loop').checked ? '循环播放中，每次间隔 1.2 秒。' : '正在播放，句尾会自动暂停。');
    } catch {
      if (playback === state) { stopPlayback(); say('视频未能播放，请先点击 YouTube 播放按钮，再重试。', true); }
    }
  }
  function cancelLoad() {
    loadId = null;
    clearTimeout(loadTimer);
    $('.reload').disabled = false;
  }
  function loadCaptions() {
    if (!videoId) return;
    cancelLoad();
    capturing = false;
    screenCollector = null;
    updateCapture();
    loadId = crypto.randomUUID();
    $('.reload').disabled = true;
    say('正在读取视频的英文字幕…');
    window.postMessage({ type: 'shadowing:captions:request', id: loadId, videoId }, location.origin);
    loadTimer = setTimeout(() => {
      cancelLoad();
      say('读取字幕超时。可重试，或开启英文 CC 后收集屏幕字幕，也可导入 SRT/VTT。', true);
    }, 27000);
  }
  window.addEventListener('message', event => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.type !== 'shadowing:captions:response' || !loadId || msg.id !== loadId || msg.videoId !== videoId) return;
    cancelLoad();
    if (typeof msg.error === 'string') { say(msg.error.slice(0, 500), true); return; }
    try {
      if (typeof msg.payload !== 'string' || msg.payload.length > 5000000) throw new Error('字幕响应无效。');
      const parsed = core.parsePayload(msg.payload);
      if (!parsed.length) throw new Error('YouTube 没有返回可用的字幕片段。');
      setCues(parsed, typeof msg.source === 'string' ? msg.source.slice(0, 60) : '英文字幕');
      say(`已载入 ${parsed.length} 句。点击字幕选择要练习的句子。`);
    } catch (error) { say(`${error.message} 可开启英文 CC 后收集，或导入字幕文件。`, true); }
  });
  function updateCapture() {
    $('.capture').textContent = capturing ? '停止收集' : '收集屏幕字幕';
    $('.capture').setAttribute('aria-pressed', String(capturing));
  }
  function capture() {
    capturing = !capturing;
    cancelLoad();
    if (capturing) {
      if (!screenCollector || currentSource !== '屏幕字幕 · 逐句收集中') {
        screenCollector = core.createScreenCollector();
        setCues(screenCollector.cues, '屏幕字幕 · 逐句收集中');
      }
      screenCollector.breakContinuity();
      say('请开启英文 CC 并播放。逐词字幕会自动合并，按标点、停顿或长度分段；时间为近似值。');
    } else {
      say(`已收集 ${cues.length} 句，点击字幕开始练习。`);
    }
    updateCapture();
  }
  function captureTick() {
    const element = video();
    if (!capturing || !screenCollector || !element) return;
    if (isAd() || playback) { screenCollector.breakContinuity(); return; }
    if (element.paused || element.seeking) return;
    // Only actual caption windows: excludes YouTube's CC/settings notification.
    const text = [...document.querySelectorAll('#movie_player .caption-window .captions-text .ytp-caption-segment')]
      .filter(el => el.getClientRects().length && getComputedStyle(el).visibility !== 'hidden')
      .map(el => el.textContent).join(' ');
    const selectedCue = cues[selected];
    const changed = screenCollector.push(text, element.currentTime);
    if (cues.length >= 10000) { capturing = false; updateCapture(); say('已达到 10000 句上限，停止收集。'); }
    if (changed) {
      cues.sort((a, b) => a.start - b.start);
      selected = selectedCue ? cues.indexOf(selectedCue) : (cues.length ? 0 : -1);
      renderList();
      renderSelection();
    } else if (selectedCue) {
      $('.cue-time').textContent = `${core.formatTime(selectedCue.start)} — ${core.formatTime(selectedCue.end)}`;
    }
  }
  function locate() {
    const time = video()?.currentTime || 0;
    let index = cues.findIndex(c => c.start <= time && c.end >= time);
    if (index < 0) index = cues.findIndex(c => c.start >= time);
    if (index < 0) index = cues.length - 1;
    $('.search').value = '';
    select(index);
    renderList();
    let row = root.querySelector(`.cue[data-index="${index}"]`);
    if (!row && cues[index]) {
      $('.search').value = cues[index].text.slice(0, 200);
      renderList();
      row = root.querySelector(`.cue[data-index="${index}"]`);
    }
    row?.scrollIntoView({ block: 'nearest' });
  }
  function checkNavigation() {
    const nextId = location.pathname === '/watch' ? new URL(location.href).searchParams.get('v') : null;
    if (nextId === videoId) return;
    stopPlayback();
    stopRecording(true);
    clearRecording();
    cancelLoad();
    capturing = false;
    screenCollector = null;
    updateCapture();
    videoId = nextId;
    setCues([], '尚未载入字幕');
    $('.video-title').textContent = document.title.replace(/\s*[-–]\s*YouTube$/, '');
    show(!!videoId && !closedByUser);
    if (videoId) loadCaptions();
  }
  $('.close').addEventListener('click', () => { closedByUser = true; show(false); });
  launcher.addEventListener('click', () => { closedByUser = false; show(true); });
  chrome.runtime.onMessage.addListener(message => {
    if (message.type !== 'shadowing:toggle') return;
    if (!videoId) return;
    closedByUser = visible;
    show(!visible);
  });
  $('.play').addEventListener('click', play);
  $('.previous').addEventListener('click', () => select(selected - 1));
  $('.next').addEventListener('click', () => select(selected + 1));
  $('.record').addEventListener('click', record);
  $('.replay').addEventListener('play', () => { stopPlayback(); video()?.pause(); });
  $('.loop').addEventListener('change', saveSettings);
  $('.speed').addEventListener('change', () => {
    saveSettings();
    if (playback) playback.element.playbackRate = Number($('.speed').value);
  });
  $('.reload').addEventListener('click', loadCaptions);
  $('.capture').addEventListener('click', capture);
  $('.locate').addEventListener('click', locate);
  $('.search').addEventListener('input', renderList);
  $('.cue-list').addEventListener('click', event => {
    const target = event.target.closest('.cue');
    if (target) select(Number(target.dataset.index));
  });
  $('.import').addEventListener('click', () => $('.file').click());
  $('.file').addEventListener('change', async event => {
    const file = event.target.files[0];
    event.target.value = '';
    if (!file) return;
    const importingVideo = videoId;
    try {
      if (file.size > 5000000) throw new Error('字幕文件不能超过 5 MB。');
      const parsed = core.parseText(await file.text());
      if (videoId !== importingVideo) return;
      if (!parsed.length) throw new Error('未找到有效字幕，请选择 UTF-8 编码的 SRT 或 VTT 文件。');
      cancelLoad();
      capturing = false;
      screenCollector = null;
      updateCapture();
      setCues(parsed, `导入 · ${file.name}`);
      say(`已导入 ${parsed.length} 句。请确认字幕与当前视频时间一致。`);
    } catch (error) { say(error.message, true); }
  });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { closedByUser = true; show(false); launcher.focus(); }
    // Keep YouTube keyboard shortcuts from firing while using the notebook.
    event.stopPropagation();
  });
  document.addEventListener('yt-navigate-finish', checkNavigation);
  window.addEventListener('pagehide', () => { stopPlayback(); stopRecording(true); clearRecording(); });
  setInterval(() => {
    checkNavigation();
    if (!visible) return;
    $('.video-title').textContent = document.title.replace(/\s*[-–]\s*YouTube$/, '');
    if (recorder) $('.record-hint').textContent = `正在录音 ${Math.floor((Date.now() - recordingStarted) / 1000)} / 60 秒`;
    captureTick();
    const state = playback;
    if (!state) return;
    if (isAd() || !state.element.isConnected) { stopPlayback(); say('播放已中止，请等待视频就绪后重试。'); return; }
    const time = state.element.currentTime;
    if (time < state.start - 0.5 || time > state.end + 0.8) { stopPlayback(); return; }
    if (state.gap) return;
    if (time >= state.end - 0.05 || state.element.ended) {
      state.element.pause();
      if ($('.loop').checked) {
        state.gap = true;
        state.gapTimer = setTimeout(async () => {
          if (playback !== state) return;
          state.element.currentTime = state.start;
          state.gap = false;
          try { await state.element.play(); } catch { if (playback === state) stopPlayback(); }
        }, 1200);
      } else { stopPlayback(); say('原声播放完成，轮到你了。点击「开始录音」跟读。'); }
    } else if (state.element.paused && !state.element.seeking) { stopPlayback(); }
  }, 100);
  checkNavigation();
})();
