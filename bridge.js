/* MAIN world: read current player metadata, never execute page-supplied code. */
(() => {
  'use strict';
  let activeRequest = null;
  window.addEventListener('message', async (event) => {
    const msg = event.data;
    if (event.source !== window || event.origin !== location.origin || msg?.type !== 'shadowing:captions:request') return;
    if (typeof msg.id !== 'string' || msg.id.length > 80) return;
    const videoId = new URL(location.href).searchParams.get('v');
    if (!videoId || msg.videoId !== videoId) return;
    activeRequest?.abort();
    const controller = new AbortController();
    activeRequest = controller;
    const deadline = setTimeout(() => controller.abort(), 24000);
    const reply = data => {
      if (activeRequest === controller && new URL(location.href).searchParams.get('v') === videoId) {
        window.postMessage({ type: 'shadowing:captions:response', id: msg.id, videoId, ...data }, location.origin);
      }
    };
    try {
      let response;
      // YouTube updates the URL before its new player response is necessarily ready.
      for (let attempt = 0; attempt < 20; attempt++) {
        if (controller.signal.aborted) throw new Error('字幕请求已取消。');
        response = document.getElementById('movie_player')?.getPlayerResponse?.();
        if (response?.videoDetails?.videoId !== videoId) response = window.ytInitialPlayerResponse;
        if (response?.videoDetails?.videoId === videoId && response?.captions) break;
        await new Promise(resolve => setTimeout(resolve, 250));
      }
      if (response?.videoDetails?.videoId !== videoId) throw new Error('视频信息尚未就绪，请稍后重试。');
      const tracks = response?.captions?.playerCaptionsTracklistRenderer?.captionTracks || [];
      const english = tracks.filter(t => /^en(?:-|$)/i.test(t.languageCode || ''));
      english.sort((a, b) => Number(a.kind === 'asr') - Number(b.kind === 'asr'));
      if (!english.length) throw new Error('这个视频未提供英文字幕。');
      let lastError;
      for (const track of english.slice(0, 3)) {
        if (controller.signal.aborted) throw new Error('字幕请求超时或已取消。');
        const trackController = new AbortController();
        const abortTrack = () => trackController.abort();
        controller.signal.addEventListener('abort', abortTrack, { once: true });
        const timeout = setTimeout(abortTrack, 6000);
        try {
          const url = new URL(track.baseUrl);
          if (url.protocol !== 'https:' || url.hostname !== 'www.youtube.com' || url.pathname !== '/api/timedtext') continue;
          url.searchParams.set('fmt', 'json3');
          const result = await fetch(url, { credentials: 'same-origin', signal: trackController.signal });
          if (!result.ok) throw new Error(`字幕请求失败 (${result.status})`);
          const payload = await result.text();
          if (!payload.trim() || payload.length > 5000000) throw new Error('YouTube 暂未返回可用字幕。');
          reply({ payload, source: track.kind === 'asr' ? '英文自动字幕' : '英文字幕' });
          return;
        } catch (error) { lastError = error; }
        finally {
          clearTimeout(timeout);
          controller.signal.removeEventListener('abort', abortTrack);
        }
      }
      throw lastError || new Error('没有可读取的英文字幕地址。');
    } catch (error) {
      reply({ error: `${error.message} 可开启英文 CC 后收集屏幕字幕，或导入字幕文件。` });
    } finally {
      clearTimeout(deadline);
      if (activeRequest === controller) activeRequest = null;
    }
  });
})();
