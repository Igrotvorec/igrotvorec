/*
 * Рантайм GG: фиксированная библиотека, встроенная в каждую сгенерированную игру.
 * Отвечает за масштабирование канваса, ввод, состояния (start/playing/won/lost), экраны, звук,
 * хранилище через оболочку и самодиагностику. Сгенерированный код пишет только логику игры через `kit`.
 */
(function () {
  "use strict";

  var W = 360;
  var H = 640;
  var runId = (location.hash.match(/run=([\w-]+)/) || [])[1] || "";
  var hasParent = window.parent && window.parent !== window;

  function post(msg) {
    if (!hasParent) return;
    msg.gg = 1;
    msg.runId = runId;
    try {
      window.parent.postMessage(msg, "*");
    } catch (e) {}
  }

  var errorShown = false;
  var reported = {};
  var reportCount = 0;
  /** Каждая уникальная ошибка отправляется один раз, не больше 5 за загрузку страницы. */
  function postError(msg) {
    var key = msg.message + "|" + (msg.line || "");
    if (reported[key] || reportCount >= 5) return;
    reported[key] = true;
    reportCount++;
    post(msg);
  }
  function reportError(err, where) {
    var message = (err && err.message) || String(err);
    var stack = err && err.stack ? String(err.stack).slice(0, 1500) : undefined;
    postError({ type: "error", message: (where ? where + ": " : "") + message, stack: stack });
    if (!errorShown) {
      errorShown = true;
      var el = document.createElement("div");
      el.className = "gg-error";
      el.textContent = "Ошибка в игре: " + message;
      document.body.appendChild(el);
    }
  }

  window.addEventListener("error", function (e) {
    postError({
      type: "error",
      message: e.message || "Script error",
      line: e.lineno,
      col: e.colno,
      stack: e.error && e.error.stack ? String(e.error.stack).slice(0, 1500) : undefined,
    });
  });
  window.addEventListener("unhandledrejection", function (e) {
    reportError(e.reason, "unhandledrejection");
  });

  post({ type: "boot" });

  // Дополнительный барьер (не граница безопасности): прячем WebRTC до кода игры,
  // потому что CSP connect-src не распространяется на ICE/STUN.
  ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel"].forEach(function (name) {
    try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  });

  // ---------- хранилище (у оболочки; в sandbox-iframe localStorage недоступен) ----------
  var reqSeq = 0;
  var pending = {};
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.gg !== 1) return;
    if (m.type === "storage:value" && pending[m.reqId]) {
      pending[m.reqId](typeof m.value === "string" ? m.value : null);
      delete pending[m.reqId];
    } else if (m.type === "pause") {
      pause();
    }
  });
  var memStore = {};
  var storage = {
    get: function (key) {
      key = String(key);
      if (!hasParent) return Promise.resolve(key in memStore ? memStore[key] : null);
      return new Promise(function (resolve) {
        var id = ++reqSeq;
        pending[id] = resolve;
        post({ type: "storage:get", reqId: id, key: key });
        setTimeout(function () {
          if (pending[id]) {
            delete pending[id];
            resolve(key in memStore ? memStore[key] : null);
          }
        }, 600);
      });
    },
    set: function (key, value) {
      key = String(key);
      value = String(value).slice(0, 2048);
      memStore[key] = value;
      post({ type: "storage:set", key: key, value: value });
    },
  };

  // ---------- канвас и масштабирование ----------
  var canvas, ctx, dpr, scale, offX, offY;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh * dpr);
    canvas.style.width = vw + "px";
    canvas.style.height = vh + "px";
    scale = Math.min(vw / W, vh / H);
    offX = (vw - W * scale) / 2;
    offY = (vh - H * scale) / 2;
    var root = document.documentElement;
    root.style.setProperty("--gg-frame-w", W * scale + "px");
    root.style.setProperty("--gg-frame-h", H * scale + "px");
    root.style.setProperty("--gg-frame-x", offX + "px");
    root.style.setProperty("--gg-frame-y", offY + "px");
    root.style.setProperty("--gg-scale", String(scale));
  }

  function toLogical(clientX, clientY) {
    return { x: (clientX - offX) / scale, y: (clientY - offY) / scale };
  }

  // ---------- звук (синтез WebAudio, включается после первого жеста) ----------
  var audio = null;
  var muted = false;
  function ensureAudio() {
    if (audio) {
      if (audio.state !== "running" && audio.state !== "closed") audio.resume();
      return audio;
    }
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      audio = new AC();
    } catch (e) {
      audio = null;
    }
    return audio;
  }
  function tone(freq, dur, type, vol, slideTo) {
    if (muted || smoking) return;
    var ac = audio;
    if (!ac || ac.state !== "running") return;
    var t = ac.currentTime;
    var o = ac.createOscillator();
    var g = ac.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + (dur || 0.1));
    g.gain.setValueAtTime(vol == null ? 0.15 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + (dur || 0.1));
    o.connect(g);
    g.connect(ac.destination);
    o.start(t);
    o.stop(t + (dur || 0.1) + 0.02);
  }
  var SFX = {
    tap: function () { tone(660, 0.06, "triangle", 0.12); },
    pop: function () { tone(520, 0.08, "square", 0.08, 900); },
    coin: function () { tone(880, 0.08, "square", 0.08); setTimeout(function () { tone(1320, 0.12, "square", 0.08); }, 70); },
    jump: function () { tone(300, 0.15, "square", 0.08, 700); },
    hit: function () { tone(180, 0.2, "sawtooth", 0.12, 60); },
    powerup: function () { tone(400, 0.25, "triangle", 0.12, 1200); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { setTimeout(function () { tone(f, 0.18, "triangle", 0.14); }, i * 110); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { setTimeout(function () { tone(f, 0.25, "sawtooth", 0.1); }, i * 150); }); },
  };

  // ---------- спрайты (data:URI, встроены в документ) ----------
  var images = {};
  function loadSprites() {
    var list = cfg.sprites || {};
    for (var key in list) {
      var src = list[key] && list[key].src;
      if (typeof src !== "string" || src.indexOf("data:image/") !== 0) continue;
      var img = new Image();
      img.src = src;
      images[key] = img;
    }
  }
  /** Рисует спрайт с сохранением пропорций внутри прямоугольника; пока картинки нет — emoji. */
  function sprite(key, x, y, w, h, o) {
    o = o || {};
    h = h == null ? w : h;
    var img = images[key];
    ctx.save();
    if (o.alpha != null) ctx.globalAlpha = Math.max(0, Math.min(1, o.alpha));
    ctx.translate(x + w / 2, y + h / 2);
    if (o.rotate) ctx.rotate(o.rotate);
    if (o.flipX) ctx.scale(-1, 1);
    if (img && img.complete && img.naturalWidth) {
      var k = Math.min(w / img.naturalWidth, h / img.naturalHeight);
      var dw = img.naturalWidth * k;
      var dh = img.naturalHeight * k;
      ctx.drawImage(img, -dw / 2, -dh / 2, dw, dh);
    } else {
      var fb = (cfg.sprites && cfg.sprites[key] && cfg.sprites[key].fallback) || "⭐";
      ctx.font = Math.round(Math.min(w, h) * 0.85) + "px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(fb, 0, Math.min(w, h) * 0.04);
    }
    ctx.restore();
  }

  // ---------- частицы ----------
  var parts = [];
  function particles(x, y, color, count) {
    count = Math.min(count || 12, 60);
    for (var i = 0; i < count; i++) {
      var a = Math.random() * Math.PI * 2;
      var s = 40 + Math.random() * 160;
      parts.push({ x: x, y: y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: 0.5 + Math.random() * 0.4, color: color || "#fff" });
    }
    if (parts.length > 400) parts.splice(0, parts.length - 400);
  }

  // ---------- состояние ----------
  var handlers = { start: [], update: [], render: [], tap: [], down: [], move: [], up: [], swipe: [], key: [] };
  var state = "start";
  var smoking = false;
  var score = 0;
  var best = 0;
  var paused = false;
  var last = 0;
  var time = 0;
  var cfg = {};
  var overlay, hud;

  function call(list, args, where) {
    for (var i = 0; i < list.length; i++) {
      try {
        list[i].apply(null, args);
      } catch (e) {
        reportError(e, where);
        return false;
      }
    }
    return true;
  }

  function setState(s) {
    state = s;
    post({ type: "state", state: s, score: score, activeMs: Math.round(time * 1000) });
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  var overlayShownAt = 0;
  /** Экран результата ненадолго игнорирует ввод, чтобы случайный тап не пропустил счёт. */
  function overlayClickable() {
    return performance.now() - overlayShownAt > 700;
  }

  function showOverlay(kind, message) {
    overlayShownAt = kind === "won" || kind === "lost" ? performance.now() : 0;
    overlay.innerHTML = "";
    overlay.className = "gg-overlay gg-" + kind;
    var card = el("div", "gg-card");
    if (kind === "start") {
      card.appendChild(el("h1", "gg-title", cfg.title || "Игра"));
      if (cfg.instructions) card.appendChild(el("p", "gg-text", cfg.instructions));
      if (best > 0) card.appendChild(el("p", "gg-sub", "Рекорд: " + best));
      card.appendChild(button("Играть", startRound));
    } else if (kind === "won" || kind === "lost") {
      card.appendChild(el("h1", "gg-title", kind === "won" ? "Победа!" : "Игра окончена"));
      if (message) card.appendChild(el("p", "gg-text", message));
      card.appendChild(el("p", "gg-score", "Счёт: " + score));
      if (best > 0) card.appendChild(el("p", "gg-sub", "Рекорд: " + best));
      card.appendChild(button("Ещё раз", startRound));
    } else if (kind === "paused") {
      card.appendChild(el("h1", "gg-title", "Пауза"));
      card.appendChild(button("Продолжить", resume));
    }
    overlay.appendChild(card);
    overlay.style.display = "flex";
  }
  function hideOverlay() {
    overlay.style.display = "none";
  }
  function button(label, fn) {
    var b = el("button", "gg-btn", label);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      if (!overlayClickable()) return;
      ensureAudio();
      SFX.tap();
      fn();
    });
    return b;
  }

  function resetRound() {
    score = 0;
    parts.length = 0;
    time = 0;
    return call(handlers.start, [], "onStart");
  }

  function startRound() {
    if (!resetRound()) return;
    hideOverlay();
    setState("playing");
    paused = false;
  }

  function finish(won, message) {
    if (smoking || state !== "playing") return;
    if (score > best) {
      best = score;
      storage.set("best", String(best));
    }
    setState(won ? "won" : "lost");
    (won ? SFX.win : SFX.lose)();
    vibrate(won ? 40 : 120);
    showOverlay(won ? "won" : "lost", message);
  }

  function pause() {
    releaseAll();
    if (state !== "playing" || paused) return;
    paused = true;
    if (audio && audio.state === "running") audio.suspend();
    showOverlay("paused");
  }
  function resume() {
    paused = false;
    last = 0;
    hideOverlay();
  }

  function vibrate(ms) {
    if (smoking) return;
    try {
      if (navigator.vibrate) navigator.vibrate(ms);
    } catch (e) {}
  }

  // ---------- главный цикл ----------
  var frameReported = false;
  function frame(ts) {
    requestAnimationFrame(frame);
    var dt = last ? Math.min((ts - last) / 1000, 0.05) : 0;
    last = ts;
    if (state === "playing" && !paused) {
      time += dt;
      if (!call(handlers.update, [dt, time], "onUpdate")) {
        setState("lost");
        showOverlay("lost", "Игра остановилась из-за ошибки");
      }
      for (var i = parts.length - 1; i >= 0; i--) {
        var p = parts[i];
        p.life -= dt;
        if (p.life <= 0) {
          parts.splice(i, 1);
          continue;
        }
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        p.vy += 300 * dt;
      }
    }
    draw();
    if (!frameReported) {
      frameReported = true;
      post({ type: "frame", painted: checkPainted() });
    }
    hud.textContent = state === "playing" && cfg.hud !== false ? String(score) : "";
  }

  function draw() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = cfg.palette.background;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(scale * dpr, 0, 0, scale * dpr, offX * dpr, offY * dpr);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, W, H);
    ctx.clip();
    call(handlers.render, [ctx, time], "onRender");
    for (var i = 0; i < parts.length; i++) {
      var p = parts[i];
      ctx.globalAlpha = Math.max(p.life * 2, 0);
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x - 3, p.y - 3, 6, 6);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** true, если отрисовка нарисовала что-то кроме однотонного фона. */
  function checkPainted() {
    try {
      var w = canvas.width;
      var h = canvas.height;
      var data = ctx.getImageData(0, 0, w, h).data;
      var step = Math.max(4, Math.floor((w * h) / 4000)) * 4;
      var r = data[0], g = data[1], b = data[2];
      for (var i = 0; i < data.length; i += step) {
        if (Math.abs(data[i] - r) + Math.abs(data[i + 1] - g) + Math.abs(data[i + 2] - b) > 24) return true;
      }
      return false;
    } catch (e) {
      return true;
    }
  }

  // ---------- ввод ----------
  var pointer = { x: 0, y: 0, down: false };
  var keys = {};
  /** Активные жесты по pointerId, чтобы мультитач не путал тапы и свайпы. */
  var gestures = {};
  var SWIPE_PX = 30;
  var inputReported = false;
  function markInput() {
    if (!inputReported) {
      inputReported = true;
      post({ type: "input" });
    }
  }
  function anyDown() {
    for (var id in gestures) return true;
    return false;
  }
  function swipeDir(dx, dy) {
    return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? "right" : "left") : dy > 0 ? "down" : "up";
  }
  function releaseAll() {
    gestures = {};
    pointer.down = false;
    for (var k in keys) {
      if (keys[k]) {
        keys[k] = false;
        if (state === "playing") call(handlers.key, [k, false], "onKey");
      }
    }
  }

  function bindInput() {
    canvas.addEventListener("pointerdown", function (e) {
      e.preventDefault();
      ensureAudio();
      markInput();
      var p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x;
      pointer.y = p.y;
      pointer.down = true;
      gestures[e.pointerId] = { x: p.x, y: p.y, swiped: false };
      try { canvas.setPointerCapture(e.pointerId); } catch (err) {}
      if (state === "playing" && !paused) call(handlers.down, [p.x, p.y, e.pointerId], "onPointerDown");
    });
    canvas.addEventListener("pointermove", function (e) {
      var p = toLogical(e.clientX, e.clientY);
      pointer.x = p.x;
      pointer.y = p.y;
      if (state !== "playing" || paused) return;
      call(handlers.move, [p.x, p.y, e.pointerId], "onPointerMove");
      var g = gestures[e.pointerId];
      // Свайп срабатывает, как только палец сместился достаточно далеко: медленные свайпы тоже считаются.
      if (g && !g.swiped) {
        var dx = p.x - g.x;
        var dy = p.y - g.y;
        if (dx * dx + dy * dy > SWIPE_PX * SWIPE_PX) {
          g.swiped = true;
          call(handlers.swipe, [swipeDir(dx, dy)], "onSwipe");
        }
      }
    });
    function up(e, cancelled) {
      var p = toLogical(e.clientX, e.clientY);
      var g = gestures[e.pointerId];
      delete gestures[e.pointerId];
      pointer.down = anyDown();
      if (state !== "playing" || paused) return;
      call(handlers.up, [p.x, p.y, e.pointerId], "onPointerUp");
      if (cancelled || !g || g.swiped) return;
      var dx = p.x - g.x;
      var dy = p.y - g.y;
      if (dx * dx + dy * dy > SWIPE_PX * SWIPE_PX) call(handlers.swipe, [swipeDir(dx, dy)], "onSwipe");
      else call(handlers.tap, [p.x, p.y], "onTap");
    }
    canvas.addEventListener("pointerup", function (e) { up(e, false); });
    canvas.addEventListener("pointercancel", function (e) { up(e, true); });

    var KEYMAP = { ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right", KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right", Space: "space", Enter: "enter" };
    window.addEventListener("keydown", function (e) {
      var k = KEYMAP[e.code];
      if (!k) return;
      e.preventDefault();
      ensureAudio();
      markInput();
      if (state !== "playing") {
        // Автоповтор игнорируем, чтобы зажатая клавиша не пропускала экран результата.
        if (!e.repeat && (k === "space" || k === "enter") && overlayClickable()) startRound();
        return;
      }
      if (paused) return;
      if (!keys[k]) {
        keys[k] = true;
        call(handlers.key, [k, true], "onKey");
        if (k === "up" || k === "down" || k === "left" || k === "right") call(handlers.swipe, [k], "onSwipe");
        if (k === "space") call(handlers.tap, [pointer.x || W / 2, pointer.y || H / 2], "onTap");
      }
    });
    window.addEventListener("keyup", function (e) {
      var k = KEYMAP[e.code];
      if (!k) return;
      keys[k] = false;
      if (state === "playing") call(handlers.key, [k, false], "onKey");
    });

    document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
    document.addEventListener("gesturestart", function (e) { e.preventDefault(); });
    document.addEventListener("visibilitychange", function () {
      if (document.hidden) pause();
    });
    window.addEventListener("blur", function () {
      releaseAll();
      pause();
    });
  }

  // ---------- smoke-тест: прогоняем колбэки до того, как игрок начнёт ----------
  function smoke() {
    smoking = true;
    var ok = resetRound();
    var prev = state;
    state = "playing";
    for (var i = 0; ok && i < 30; i++) {
      time += 1 / 60;
      ok = call(handlers.update, [1 / 60, time], "onUpdate");
      if (ok) ok = call(handlers.render, [ctx, time], "onRender");
    }
    if (ok) ok = call(handlers.down, [W / 2, H / 2, 1], "onPointerDown");
    if (ok) ok = call(handlers.up, [W / 2, H / 2, 1], "onPointerUp");
    if (ok) ok = call(handlers.tap, [W / 2, H / 2], "onTap");
    if (ok) ok = call(handlers.swipe, ["left"], "onSwipe");
    for (var j = 0; ok && j < 10; j++) ok = call(handlers.update, [1 / 60, time], "onUpdate");
    state = prev;
    smoking = false;
    if (ok) ok = resetRound();
    return ok;
  }

  // ---------- публичный API ----------
  var kit = {
    W: W,
    H: H,
    get ctx() { return ctx; },
    get state() { return state; },
    get time() { return time; },
    get score() { return score; },
    set score(v) { score = Math.max(0, Math.floor(Number(v) || 0)); },
    get best() { return best; },
    set best(v) {},
    pointer: pointer,
    keys: keys,
    storage: storage,
    onStart: function (fn) { handlers.start.push(fn); },
    onUpdate: function (fn) { handlers.update.push(fn); },
    onRender: function (fn) { handlers.render.push(fn); },
    onTap: function (fn) { handlers.tap.push(fn); },
    onPointerDown: function (fn) { handlers.down.push(fn); },
    onPointerMove: function (fn) { handlers.move.push(fn); },
    onPointerUp: function (fn) { handlers.up.push(fn); },
    onSwipe: function (fn) { handlers.swipe.push(fn); },
    onKey: function (fn) { handlers.key.push(fn); },
    addScore: function (n) { score = Math.max(0, score + Math.floor(n == null ? 1 : n)); },
    win: function (message) { finish(true, message); },
    lose: function (message) { finish(false, message); },
    sfx: function (name) { var f = SFX[name]; if (f) f(); },
    tone: tone,
    vibrate: vibrate,
    particles: particles,
    sprite: function (key, x, y, w, h, o) { sprite(key, x, y, w, h, o); },
    /** Игра, которая рисует свой счётчик, выключает встроенный HUD, чтобы счёт не дублировался. */
    showHud: function (on) { cfg.hud = !!on; },
    hasSprite: function (key) { var img = images[key]; return !!(img && img.complete && img.naturalWidth); },
    rand: function (a, b) { return a + Math.random() * (b - a); },
    randInt: function (a, b) { return Math.floor(a + Math.random() * (b - a + 1)); },
    pick: function (arr) { return arr[Math.floor(Math.random() * arr.length)]; },
    clamp: function (v, a, b) { return v < a ? a : v > b ? b : v; },
    dist: function (x1, y1, x2, y2) { var dx = x2 - x1, dy = y2 - y1; return Math.sqrt(dx * dx + dy * dy); },
    inRect: function (px, py, x, y, w, h) { return px >= x && px <= x + w && py >= y && py <= y + h; },
    rectsOverlap: function (a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; },
    text: function (str, x, y, o) {
      o = o || {};
      ctx.font = (o.weight || "700") + " " + (o.size || 20) + "px " + (o.font || "system-ui, -apple-system, Roboto, sans-serif");
      ctx.textAlign = o.align || "center";
      ctx.textBaseline = o.baseline || "middle";
      ctx.fillStyle = o.color || cfg.palette.text;
      ctx.fillText(String(str), x, y);
    },
    roundRect: function (x, y, w, h, r, fill, stroke) {
      r = Math.min(r || 0, w / 2, h / 2);
      ctx.beginPath();
      ctx.moveTo(x + r, y);
      ctx.arcTo(x + w, y, x + w, y + h, r);
      ctx.arcTo(x + w, y + h, x, y + h, r);
      ctx.arcTo(x, y + h, x, y, r);
      ctx.arcTo(x, y, x + w, y, r);
      ctx.closePath();
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    },
    circle: function (x, y, r, fill, stroke) {
      ctx.beginPath();
      ctx.arc(x, y, Math.max(r, 0), 0, Math.PI * 2);
      if (fill) { ctx.fillStyle = fill; ctx.fill(); }
      if (stroke) { ctx.strokeStyle = stroke; ctx.stroke(); }
    },
    // Сгенерированный код иногда присваивает эти поля — принимаем значение, а не падаем.
    get palette() { return cfg.palette; },
    set palette(v) { if (v && typeof v === "object") for (var k in v) if (typeof v[k] === "string") cfg.palette[k] = v[k]; },
    get uiScale() { return cfg.uiScale; },
    set uiScale(v) { if (v > 0) cfg.uiScale = Number(v); },
    get speed() { return cfg.speed; },
    set speed(v) { if (v > 0) cfg.speed = Number(v); },
  };

  window.GG = {
    init: function (config) {
      cfg = config || {};
      cfg.palette = cfg.palette || { background: "#10131a", primary: "#ffcc00", accent: "#ff4d6d", text: "#ffffff" };
      cfg.uiScale = cfg.uiScale || 1;
      cfg.speed = cfg.speed || 1;
      var root = document.documentElement;
      root.style.setProperty("--gg-bg", cfg.palette.background);
      root.style.setProperty("--gg-primary", cfg.palette.primary);
      root.style.setProperty("--gg-accent", cfg.palette.accent);
      root.style.setProperty("--gg-text", cfg.palette.text);
      root.style.setProperty("--gg-ui", String(cfg.uiScale));
      canvas = document.getElementById("gg-canvas");
      ctx = canvas.getContext("2d");
      overlay = el("div", "gg-overlay");
      hud = el("div", "gg-hud");
      document.body.appendChild(hud);
      document.body.appendChild(overlay);
      resize();
      window.addEventListener("resize", resize);
      bindInput();
      loadSprites();
      return kit;
    },
    boot: function () {
      if (!handlers.render.length) reportError(new Error("game did not register kit.onRender"), "boot");
      if (!handlers.start.length) reportError(new Error("game did not register kit.onStart"), "boot");
      var ok = smoke();
      storage.get("best").then(function (v) {
        best = Math.max(best, parseInt(v || "0", 10) || 0);
        if (state === "start") showOverlay("start");
      });
      showOverlay("start");
      requestAnimationFrame(frame);
      if (ok) post({ type: "ready" });
    },
  };
})();
