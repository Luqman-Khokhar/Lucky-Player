'use strict';

// Lucky Player laptop receiver: pairs with the phone over a WebSocket and plays the videos it sends, either the file
// itself or a stream the phone converts on the fly. No build step, no libraries.
(() => {
  const TOKEN_KEY = 'lucky-player-cast-token';
  const HEARTBEAT_MS = 5000;
  // The phone sends a heartbeat every 5 s; silence this long means the connection is dead.
  const SILENCE_LIMIT_MS = 20000;
  const RECONNECT_MIN_MS = 1000;
  const RECONNECT_MAX_MS = 10000;
  // Failed attempts before the connecting screen explains the likely network problem.
  const HINT_AFTER_FAILURES = 2;
  const STATE_REPORT_MS = 1000;
  const CONTROLS_HIDE_MS = 3000;
  const SEEK_STEP_S = 10;
  // Seconds of converted video kept behind the playhead when the browser runs out of buffer space.
  const KEEP_BEHIND_S = 15;
  // How much converted video to collect before playback starts.
  const PREBUFFER_MS = 4000;
  // Mirroring: how far behind live before jumping, where to land, and the catch-up speed for a small lag.
  // Landing too close to live leaves nothing to absorb a Wi-Fi hiccup, which shows up as buffering.
  const LIVE_JUMP_S = 1;
  const LIVE_TARGET_S = 0.35;
  const LIVE_CATCH_UP_RATE = 1.15;
  // Stall recovery: how big a hole in the buffer to step over, and where to land inside the next piece.
  const MAX_GAP_SKIP_S = 3;
  const GAP_SKIP_MARGIN_S = 0.05;

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

  const MEDIA_ERRORS = {
    1: 'Loading the video was stopped.',
    2: 'The video stopped loading from the phone. Check the Wi-Fi connection.',
    3: "This browser couldn't decode the video.",
    4: "This browser can't play this video's format.",
  };

  const $ = (id) => document.getElementById(id);
  const SCREENS = ['connecting', 'pair', 'ready', 'waiting', 'player', 'ended'];
  const codeInput = $('pair-code');
  const pairButton = $('pair-button');
  const pairError = $('pair-error');
  const player = $('screen-player');
  const video = $('video');
  const seek = $('seek');
  const playToggle = $('play-toggle');
  const tapToPlay = $('tap-to-play');
  const playerStatus = $('player-status');

  let socket = null;
  let heartbeatTimer = 0;
  let reconnectTimer = 0;
  let lockoutTimer = 0;
  let idleTimer = 0;
  let reconnectDelay = RECONNECT_MIN_MS;
  let failedAttempts = 0;
  let lastMessageAt = 0;
  let welcomed = false;
  // The user clicked Start receiving in this page; the browser now allows playback with sound.
  let started = false;
  // The phone stopped casting; wait for the user instead of retrying forever.
  let stopped = false;
  // The video the phone sent: { token, title }.
  let current = null;
  // Set while the phone converts the video: the MediaSource being fed with its fragments.
  let stream = null;
  // Where the video starts once its metadata loads; also reported as the position until then.
  let pendingStartS = null;
  let seekingByUser = false;

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
    const probe = document.createElement('video');
    const direct = {};
    for (const [key, type] of Object.entries(DIRECT_TYPES)) direct[key] = probe.canPlayType(type);
    const Source = window.MediaSource || window.ManagedMediaSource;
    const streamTypes = {};
    for (const [key, type] of Object.entries(STREAM_TYPES)) {
      streamTypes[key] = Boolean(Source && Source.isTypeSupported(type));
    }
    return { direct, stream: streamTypes };
  }

  // region Connection

  function send(message) {
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function connect() {
    clearTimeout(reconnectTimer);
    if (socket) return;
    const ws = new WebSocket(`ws://${location.host}/ws`);
    ws.binaryType = 'arraybuffer';
    socket = ws;
    ws.onopen = () => {
      lastMessageAt = Date.now();
      send({ type: 'hello', token: readToken(), ...browserInfo(), capabilities: capabilities() });
      startHeartbeat();
    };
    ws.onmessage = (event) => {
      lastMessageAt = Date.now();
      if (typeof event.data !== 'string') {
        appendChunk(event.data);
        return;
      }
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
        show(current ? 'player' : started ? 'waiting' : 'ready');
        break;
      case 'busy':
        end('Too many laptops', `Lucky Player casts to ${message.max || 4} laptops at a time. Close this page on another laptop, then click Reconnect.`);
        break;
      case 'bye':
        end('Casting stopped', 'Start casting again in Lucky Player on your phone, then click Reconnect.');
        break;
      case 'load':
        loadMedia(message);
        break;
      case 'play':
        if (current) playVideo();
        break;
      case 'pause':
        video.pause();
        break;
      case 'seek':
        seekTo(Number(message.ms) / 1000);
        break;
      case 'stream_end':
        if (stream) {
          stream.ended = true;
          appendNext();
        }
        break;
      case 'stop':
        resetMedia();
        show(started ? 'waiting' : 'ready');
        break;
      default:
        break;
    }
  }

  function end(title, detail) {
    stopped = true;
    welcomed = false;
    resetMedia();
    hideBanner();
    $('ended-title').textContent = title;
    $('ended-detail').textContent = detail;
    show('ended');
  }

  // endregion

  // region Pairing

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

  // endregion

  // region Playback

  function loadMedia(message) {
    const token = String(message.token || '');
    // A converted file and the mirrored phone screen both arrive as fragments; the screen has no length or seeking.
    const converted = message.kind === 'stream' || message.kind === 'screen';
    if (!converted && current && current.token === token && video.getAttribute('src') === message.url) {
      // Reconnected mid-video: this page kept playing, so only the phone needs the current state.
      report();
      return;
    }
    resetMedia();
    current = { token, title: String(message.title || 'Video'), converted, live: message.kind === 'screen' };
    $('video-title').textContent = current.title;
    document.title = `${current.title} · Lucky Player`;
    show('player');
    showControls();
    if (converted) startConvertedStream(message);
    else startDirectFile(message);
    updatePlayerUi();
    report();
  }

  function startDirectFile(message) {
    pendingStartS = Math.max(0, Number(message.startMs) || 0) / 1000;
    video.src = message.url;
    video.load();
  }

  // The phone sends an init segment, then a fragment per second of video, as binary WebSocket messages.
  function startConvertedStream(message) {
    const Source = window.MediaSource || window.ManagedMediaSource;
    if (!Source) {
      setStatus("This browser can't play converted video.");
      return;
    }
    const mediaSource = new Source();
    stream = {
      mediaSource,
      sourceBuffer: null,
      queue: [],
      ended: false,
      playing: false,
      mimeType: String(message.mimeType || STREAM_TYPES['fmp4-h264-aac']),
      startMs: Math.max(0, Number(message.startMs) || 0),
      durationMs: Math.max(0, Number(message.durationMs) || 0),
      live: message.kind === 'screen',
      url: URL.createObjectURL(mediaSource),
    };
    mediaSource.addEventListener('sourceopen', () => {
      if (!stream || stream.mediaSource !== mediaSource) return;
      try {
        stream.sourceBuffer = mediaSource.addSourceBuffer(stream.mimeType);
        stream.sourceBuffer.addEventListener('updateend', appendNext);
        if (stream.durationMs > 0) mediaSource.duration = stream.durationMs / 1000;
      } catch (error) {
        setStatus("This browser can't play the converted video.");
        return;
      }
      appendNext();
    }, { once: true });
    video.src = stream.url;
    video.load();
    // Playback waits for a cushion; starting on the first fragment stalls again a second later.
    setStatus('Loading…');
  }

  function appendChunk(data) {
    if (!stream) return;
    stream.queue.push(new Uint8Array(data));
    appendNext();
  }

  function appendNext() {
    if (!stream || !stream.sourceBuffer || stream.sourceBuffer.updating) return;
    // Checked on every fragment, not only on the video element's own timer, so drift is caught early.
    keepUpWithLive();
    if (stream.queue.length === 0) {
      if (stream.ended && stream.mediaSource.readyState === 'open') {
        try {
          stream.mediaSource.endOfStream();
        } catch {
          // Already ended.
        }
      }
      return;
    }
    const chunk = stream.queue.shift();
    try {
      stream.sourceBuffer.appendBuffer(chunk);
      startWhenBuffered();
    } catch (error) {
      if (error && error.name === 'QuotaExceededError') {
        stream.queue.unshift(chunk);
        dropOldBuffer();
        return;
      }
      setStatus("The converted video couldn't be played.");
    }
  }

  function startWhenBuffered() {
    if (!stream || stream.playing) return;
    // The mirrored screen starts as soon as anything arrives; waiting would only add delay.
    const cushion = stream.live ? 0 : PREBUFFER_MS;
    if (bufferedAheadMs() < cushion && !stream.ended) return;
    stream.playing = true;
    setStatus('');
    playVideo();
  }

  // A mirrored screen must stay at the live edge: any delay the browser picks up would otherwise be permanent.
  function keepUpWithLive() {
    if (!stream || !stream.live || !stream.playing || video.paused) return;
    const buffered = video.buffered;
    if (buffered.length === 0) return;
    const behind = buffered.end(buffered.length - 1) - video.currentTime;
    if (behind > LIVE_JUMP_S) {
      video.currentTime = buffered.end(buffered.length - 1) - LIVE_TARGET_S;
      video.playbackRate = 1;
      return;
    }
    // Slightly behind: catch up by playing a touch faster, which is less jarring than a jump.
    const wanted = behind > LIVE_TARGET_S * 2 ? LIVE_CATCH_UP_RATE : 1;
    if (video.playbackRate !== wanted) video.playbackRate = wanted;
  }

  /**
   * A stall with video already buffered further on means the playhead sits in a gap, which the browser will not
   * cross by itself. Stepping over it is the difference between a blink and playback stopping for good.
   */
  function skipBufferGap() {
    if (!current) return;
    const buffered = video.buffered;
    for (let index = 0; index < buffered.length; index++) {
      const start = buffered.start(index);
      if (start > video.currentTime && start - video.currentTime < MAX_GAP_SKIP_S) {
        video.currentTime = start + GAP_SKIP_MARGIN_S;
        return;
      }
    }
  }

  // Long videos fill the browser's buffer; the part already watched is what goes.
  function dropOldBuffer() {
    const buffer = stream.sourceBuffer;
    if (!buffer || buffer.updating || buffer.buffered.length === 0) return;
    const start = buffer.buffered.start(0);
    const keepFrom = Math.max(start, video.currentTime - KEEP_BEHIND_S);
    if (keepFrom > start) buffer.remove(start, keepFrom);
  }

  function playVideo() {
    const attempt = video.play();
    if (!attempt) return;
    attempt
      .then(() => {
        tapToPlay.hidden = true;
        updatePlayerUi();
      })
      .catch((error) => {
        // Autoplay with sound needs one click on this page first.
        if (error && error.name === 'NotAllowedError') {
          tapToPlay.hidden = false;
          updatePlayerUi();
          report();
        }
      });
  }

  function togglePlay() {
    if (!current) return;
    if (video.paused || video.ended) playVideo();
    else video.pause();
  }

  /** [seconds] is a position in the whole video, which for a converted stream is not the browser's own clock. */
  function seekTo(seconds) {
    if (!current || !Number.isFinite(seconds)) return;
    const target = Math.max(0, seconds);
    if (stream && stream.live) return;
    if (stream) {
      // Only what the phone already sent exists here, so it converts again from the new position.
      send({ type: 'control', action: 'seek', token: current.token, ms: Math.round(target * 1000) });
      setStatus('Loading…');
      return;
    }
    if (video.readyState < HTMLMediaElement.HAVE_METADATA) {
      pendingStartS = target;
      return;
    }
    video.currentTime = Number.isFinite(video.duration) ? Math.min(target, video.duration) : target;
  }

  function resetMedia() {
    current = null;
    pendingStartS = null;
    video.pause();
    video.playbackRate = 1;
    video.removeAttribute('src');
    if (stream) {
      if (stream.sourceBuffer) stream.sourceBuffer.removeEventListener('updateend', appendNext);
      URL.revokeObjectURL(stream.url);
      stream = null;
    }
    video.load();
    tapToPlay.hidden = true;
    playerStatus.hidden = true;
    document.title = 'Lucky Player';
    clearTimeout(idleTimer);
    player.classList.remove('idle');
  }

  /** Position in the whole video, in seconds. */
  function absolutePositionS() {
    if (stream) return stream.startMs / 1000 + video.currentTime;
    if (pendingStartS !== null) return pendingStartS;
    return video.currentTime;
  }

  function durationSeconds() {
    if (stream) return stream.durationMs / 1000;
    return Number.isFinite(video.duration) ? video.duration : 0;
  }

  function bufferedAheadMs() {
    const buffered = video.buffered;
    if (!buffered || buffered.length === 0) return 0;
    const end = buffered.end(buffered.length - 1);
    return Math.max(0, Math.round((end - video.currentTime) * 1000));
  }

  function statusNow() {
    if (video.error) return 'error';
    if (!tapToPlay.hidden) return 'blocked';
    if (pendingStartS !== null || video.readyState < HTMLMediaElement.HAVE_METADATA) return 'loading';
    if (video.ended) return 'ended';
    if (video.seeking || (!video.paused && video.readyState < HTMLMediaElement.HAVE_FUTURE_DATA)) return 'buffering';
    return video.paused ? 'paused' : 'playing';
  }

  function errorText() {
    return (video.error && MEDIA_ERRORS[video.error.code]) || "The video couldn't play.";
  }

  function report() {
    if (!current) return;
    const status = statusNow();
    const message = {
      type: 'state',
      token: current.token,
      status,
      // For a converted stream the phone adds where conversion started.
      positionMs: Math.round((stream ? video.currentTime : absolutePositionS()) * 1000),
      durationMs: Math.round(durationSeconds() * 1000),
      bufferedAheadMs: bufferedAheadMs(),
    };
    if (status === 'error') {
      message.error = errorText();
      // 3 (decode) and 4 (unsupported) mean canPlayType was too optimistic; the phone converts instead.
      message.errorCode = video.error ? video.error.code : 0;
    }
    send(message);
  }

  function setStatus(text) {
    playerStatus.textContent = text;
    playerStatus.hidden = !text || !tapToPlay.hidden;
  }

  function formatTime(seconds) {
    const total = Math.max(0, Math.floor(seconds || 0));
    const hours = Math.floor(total / 3600);
    const minutes = Math.floor((total % 3600) / 60);
    const rest = String(total % 60).padStart(2, '0');
    return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${rest}` : `${minutes}:${rest}`;
  }

  function updatePlayerUi() {
    if (!current) return;
    const status = statusNow();
    const playing = status === 'playing' || status === 'buffering';
    playToggle.setAttribute('aria-label', playing ? 'Pause' : 'Play');
    $('icon-play').toggleAttribute('hidden', playing);
    $('icon-pause').toggleAttribute('hidden', !playing);

    const live = Boolean(stream && stream.live);
    const durationS = durationSeconds();
    const positionS = seekingByUser ? Number(seek.value) : absolutePositionS();
    const timeText = live ? formatTime(video.currentTime) : `${formatTime(positionS)} / ${formatTime(durationS)}`;
    $('time').textContent = timeText;
    seek.hidden = live;
    seek.max = String(Math.max(0, Math.floor(durationS)));
    if (!seekingByUser) seek.value = String(Math.floor(positionS));
    seek.setAttribute('aria-valuetext', timeText);
    seek.disabled = live || durationS <= 0;

    setStatus(status === 'error' ? errorText() : status === 'loading' ? 'Loading…' : status === 'buffering' ? 'Buffering…' : '');
    if (!playing) showControls();
  }

  function showControls() {
    player.classList.remove('idle');
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      const focused = document.activeElement;
      const keyboardInControls = focused && $('controls').contains(focused) && focused.matches(':focus-visible');
      if (current && !video.paused && !seekingByUser && !keyboardInControls) player.classList.add('idle');
    }, CONTROLS_HIDE_MS);
  }

  function enterFullscreen() {
    const root = document.documentElement;
    if (!document.fullscreenElement && root.requestFullscreen) root.requestFullscreen().catch(() => undefined);
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    else enterFullscreen();
  }

  // Registered before the reporting listeners so the start position is applied before the first report.
  video.addEventListener('loadedmetadata', () => {
    if (pendingStartS === null) return;
    const startS = pendingStartS;
    pendingStartS = null;
    if (startS > 0 && startS < (durationSeconds() || Infinity)) video.currentTime = startS;
    playVideo();
  });

  for (const name of ['loadedmetadata', 'durationchange', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'ended', 'error', 'canplay']) {
    video.addEventListener(name, () => {
      updatePlayerUi();
      report();
    });
  }
  video.addEventListener('timeupdate', () => {
    updatePlayerUi();
    keepUpWithLive();
  });
  video.addEventListener('waiting', skipBufferGap);
  video.addEventListener('stalled', skipBufferGap);
  video.addEventListener('dblclick', toggleFullscreen);
  setInterval(report, STATE_REPORT_MS);

  playToggle.addEventListener('click', togglePlay);
  $('player-fullscreen').addEventListener('click', toggleFullscreen);

  tapToPlay.addEventListener('click', () => {
    started = true;
    enterFullscreen();
    playVideo();
  });

  seek.addEventListener('input', () => {
    seekingByUser = true;
    showControls();
    updatePlayerUi();
  });

  seek.addEventListener('change', () => {
    seekingByUser = false;
    seekTo(Number(seek.value));
  });

  for (const name of ['mousemove', 'pointerdown', 'keydown', 'touchstart']) {
    player.addEventListener(name, showControls, { passive: true });
  }

  document.addEventListener('keydown', (event) => {
    if (player.hidden || !current) return;
    const target = event.target;
    const inControl = target instanceof HTMLElement && (target.tagName === 'BUTTON' || target.tagName === 'INPUT');
    if ((event.key === ' ' || event.key === 'k') && !inControl) {
      event.preventDefault();
      togglePlay();
    } else if ((event.key === 'ArrowLeft' || event.key === 'ArrowRight') && target !== seek) {
      event.preventDefault();
      seekTo(absolutePositionS() + (event.key === 'ArrowLeft' ? -SEEK_STEP_S : SEEK_STEP_S));
    } else if (event.key === 'f' && !inControl) {
      toggleFullscreen();
    }
    showControls();
  });

  // endregion

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
    const fullscreen = Boolean(document.fullscreenElement);
    $('fullscreen-button').hidden = fullscreen;
    $('player-fullscreen').setAttribute('aria-label', fullscreen ? 'Exit full screen' : 'Full screen');
  });

  // A background tab has its timers slowed right down, so reconnect as soon as the tab or the network comes back.
  function reconnectNow() {
    if (stopped || socket || document.hidden) return;
    reconnectDelay = RECONNECT_MIN_MS;
    connect();
  }

  document.addEventListener('visibilitychange', reconnectNow);
  window.addEventListener('focus', reconnectNow);
  window.addEventListener('online', reconnectNow);

  $('reconnect-button').addEventListener('click', () => {
    stopped = false;
    failedAttempts = 0;
    reconnectDelay = RECONNECT_MIN_MS;
    show('connecting');
    connect();
  });

  connect();
})();
