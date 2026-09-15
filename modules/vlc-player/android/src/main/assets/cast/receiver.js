'use strict';

// Lucky Player laptop receiver: pairs with the phone over a WebSocket and waits for videos. No build step, no libraries.
(() => {
  const TOKEN_KEY = 'lucky-player-cast-token';
  const HEARTBEAT_MS = 5000;
  // The phone sends a heartbeat every 5 s; silence this long means the connection is dead.
  const SILENCE_LIMIT_MS = 20000;
  const RECONNECT_MIN_MS = 1000;
  const RECONNECT_MAX_MS = 10000;
  // Failed attempts before the connecting screen explains the likely network problem.
  const HINT_AFTER_FAILURES = 2;

  // Probed once and reported to the phone, which decides per video whether the file can be sent as is.
  const DIRECT_TYPES = {
    'mp4-h264-aac': 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    'mp4-hevc': 'video/mp4; codecs="hvc1.1.6.L120.90"',
    'mp4-av1': 'video/mp4; codecs="av01.0.08M.08"',
    'webm-vp9-opus': 'video/webm; codecs="vp9, opus"',
    'webm-vp8-vorbis': 'video/webm; codecs="vp8, vorbis"',
    'mkv-h264-aac': 'video/x-matroska; codecs="avc1.640028, mp4a.40.2"',
    'audio-aac': 'audio/mp4; codecs="mp4a.40.2"',
    'audio-mp3': 'audio/mpeg',
    'audio-opus': 'audio/ogg; codecs="opus"',
    'audio-flac': 'audio/flac',
    'audio-ac3': 'audio/mp4; codecs="ac-3"',
    'audio-eac3': 'audio/mp4; codecs="ec-3"',
  };
  const STREAM_TYPES = {
    'fmp4-h264-aac': 'video/mp4; codecs="avc1.640028, mp4a.40.2"',
    'fmp4-h264': 'video/mp4; codecs="avc1.640028"',
  };

  const $ = (id) => document.getElementById(id);
  const SCREENS = ['connecting', 'pair', 'ready', 'waiting', 'ended'];
  const codeInput = $('pair-code');
  const pairButton = $('pair-button');
  const pairError = $('pair-error');

  let socket = null;
  let heartbeatTimer = 0;
  let reconnectTimer = 0;
  let lockoutTimer = 0;
  let reconnectDelay = RECONNECT_MIN_MS;
  let failedAttempts = 0;
  let lastMessageAt = 0;
  let welcomed = false;
  // The user clicked Start receiving in this page; the browser now allows playback with sound.
  let started = false;
  // The phone stopped casting; wait for the user instead of retrying forever.
  let stopped = false;

  function show(name) {
    for (const screen of SCREENS) $(`screen-${screen}`).hidden = screen !== name;
    const focusTarget = { pair: codeInput, ready: $('start-button'), ended: $('reconnect-button') }[name];
    if (focusTarget) focusTarget.focus();
  }

  function showBanner(text) {
    const banner = $('banner');
    banner.textContent = text;
    banner.hidden = false;
  }

  function hideBanner() {
    $('banner').hidden = true;
  }

  function readToken() {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  }

  function writeToken(token) {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      // Private window or blocked storage: pairing then lasts for this page only.
    }
  }

  // Display name only ("Chrome · Linux"); playback decisions use the probed capabilities.
  function browserInfo() {
    const ua = navigator.userAgent;
    const browser = /Edg\//.test(ua) ? 'Edge'
      : /OPR\//.test(ua) ? 'Opera'
      : /Firefox\//.test(ua) ? 'Firefox'
      : /Chrome\//.test(ua) ? 'Chrome'
      : /Safari\//.test(ua) ? 'Safari'
      : 'Browser';
    const os = /Windows/.test(ua) ? 'Windows'
      : /CrOS/.test(ua) ? 'ChromeOS'
      : /Mac OS X/.test(ua) ? 'macOS'
      : /Linux/.test(ua) ? 'Linux'
      : 'Unknown';
    return { browser, os };
  }

  function capabilities() {
    const video = document.createElement('video');
    const direct = {};
    for (const [key, type] of Object.entries(DIRECT_TYPES)) direct[key] = video.canPlayType(type);
    const Source = window.MediaSource || window.ManagedMediaSource;
    const stream = {};
    for (const [key, type] of Object.entries(STREAM_TYPES)) stream[key] = Boolean(Source && Source.isTypeSupported(type));
    return { direct, stream };
  }

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (socket) return;
    const ws = new WebSocket(`ws://${location.host}/ws`);
    socket = ws;
    ws.onopen = () => {
      lastMessageAt = Date.now();
      send({ type: 'hello', token: readToken(), ...browserInfo(), capabilities: capabilities() });
      startHeartbeat();
    };
    ws.onmessage = (event) => {
      lastMessageAt = Date.now();
      if (typeof event.data !== 'string') return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      handle(message);
    };
    ws.onclose = () => {
      if (socket === ws) connectionLost();
    };
    ws.onerror = () => ws.close();
  }

  function connectionLost() {
    const ws = socket;
    socket = null;
    stopHeartbeat();
    if (ws && ws.readyState !== WebSocket.CLOSED) ws.close();
    if (stopped) return;
    failedAttempts += 1;
    if (welcomed) {
      showBanner('Lost the connection to your phone. Reconnecting…');
    } else if (failedAttempts >= HINT_AFTER_FAILURES) {
      $('connecting-detail').textContent =
        "Can't reach the phone. Check that this laptop is on the same Wi-Fi as the phone, or on the phone's hotspot, and that Lucky Player is still casting.";
    }
    reconnectTimer = setTimeout(connect, reconnectDelay);
    reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  }

  function startHeartbeat() {
    stopHeartbeat();
    heartbeatTimer = setInterval(() => {
      if (Date.now() - lastMessageAt > SILENCE_LIMIT_MS) {
        connectionLost();
        return;
      }
      send({ type: 'heartbeat' });
    }, HEARTBEAT_MS);
  }

  function stopHeartbeat() {
    clearInterval(heartbeatTimer);
  }

  function handle(message) {
    switch (message.type) {
      case 'need_code':
        writeToken(null);
        welcomed = false;
        hideBanner();
        setPairError('');
        show('pair');
        break;
      case 'paired':
        writeToken(message.token);
        break;
      case 'pair_failed':
        onPairFailed(Number(message.retryAfterMs) || 0);
        break;
      case 'welcome':
        welcomed = true;
        failedAttempts = 0;
        reconnectDelay = RECONNECT_MIN_MS;
        hideBanner();
        for (const element of document.querySelectorAll('.phone-name')) element.textContent = message.phoneName || 'your phone';
        show(started ? 'waiting' : 'ready');
        break;
      case 'busy':
        end('Too many laptops', `Lucky Player casts to ${message.max || 4} laptops at a time. Close this page on another laptop, then click Reconnect.`);
        break;
      case 'bye':
        end('Casting stopped', 'Start casting again in Lucky Player on your phone, then click Reconnect.');
        break;
      default:
        break;
    }
  }

  function end(title, detail) {
    stopped = true;
    welcomed = false;
    hideBanner();
    $('ended-title').textContent = title;
    $('ended-detail').textContent = detail;
    show('ended');
  }

  function setPairError(text) {
    pairError.textContent = text;
    codeInput.setAttribute('aria-invalid', text ? 'true' : 'false');
  }

  function onPairFailed(retryAfterMs) {
    codeInput.value = '';
    if (retryAfterMs <= 0) {
      setPairError("That code isn't right. Check the Cast screen on your phone and try again.");
      codeInput.focus();
      return;
    }
    const until = Date.now() + retryAfterMs;
    codeInput.disabled = true;
    pairButton.disabled = true;
    clearInterval(lockoutTimer);
    const tick = () => {
      const seconds = Math.ceil((until - Date.now()) / 1000);
      if (seconds > 0) {
        setPairError(`Too many wrong codes. Try again in ${seconds} s.`);
        return;
      }
      clearInterval(lockoutTimer);
      codeInput.disabled = false;
      pairButton.disabled = false;
      setPairError('');
      codeInput.focus();
    };
    tick();
    lockoutTimer = setInterval(tick, 1000);
  }

  function enterFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => undefined);
  }

  $('pair-form').addEventListener('submit', (event) => {
    event.preventDefault();
    const code = codeInput.value.replace(/\D/g, '');
    if (code.length !== 4) {
      setPairError('Enter the 4 digits shown on your phone.');
      codeInput.focus();
      return;
    }
    setPairError('');
    send({ type: 'pair', code });
  });

  codeInput.addEventListener('input', () => {
    codeInput.value = codeInput.value.replace(/\D/g, '').slice(0, 4);
    if (codeInput.value.length === 4) $('pair-form').requestSubmit();
  });

  $('start-button').addEventListener('click', () => {
    started = true;
    enterFullscreen();
    show('waiting');
  });

  $('fullscreen-button').addEventListener('click', enterFullscreen);

  document.addEventListener('fullscreenchange', () => {
    $('fullscreen-button').hidden = Boolean(document.fullscreenElement);
  });

  $('reconnect-button').addEventListener('click', () => {
    stopped = false;
    failedAttempts = 0;
    reconnectDelay = RECONNECT_MIN_MS;
    show('connecting');
    connect();
  });

  connect();
})();
