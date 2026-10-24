/*
 * Рантайм GG для игр на Phaser 3 (эксперимент): Phaser отвечает за отрисовку, физику, анимации и камеру,
 * а этот слой — за то же, что kit.js в обычных играх: протокол с оболочкой, экраны старта и финала,
 * текстуры из встроенных картинок, звук, музыку, хранилище и самодиагностику.
 * Код игры описывает сцену Phaser и вызывает GG.run(GameScene); саму игру создаёт рантайм.
 */
(function () {
  "use strict";

  /** Логический кадр в 2× от 360×640: Phaser масштабирует его по экрану, текст и спрайты остаются чёткими. */
  var W = 720;
  var H = 1280;
  var runId = (location.hash.match(/run=([\w-]+)/) || [])[1] || "";
  var hasParent = window.parent && window.parent !== window;
  var wantThumb = /[#&]thumb=1/.test(location.hash);

  function post(msg) {
    if (!hasParent) return;
    msg.gg = 1;
    msg.runId = runId;
    try {
      window.parent.postMessage(msg, "*");
    } catch (e) {}
  }

  // ---------- ошибки ----------
  var errorShown = false;
  /** Ошибка до конца самопроверки: игра не запускается. Ошибка во время раунда не блокирует «Ещё раз». */
  var failed = false;
  var readyDone = false;
  var reported = {};
  var reportCount = 0;
  function reportError(err, where) {
    if (!readyDone) failed = true;
    var message = (where ? where + ": " : "") + ((err && err.message) || String(err));
    var key = message;
    if (!reported[key] && reportCount < 5) {
      reported[key] = true;
      reportCount++;
      post({ type: "error", message: message, stack: err && err.stack ? String(err.stack).slice(0, 1500) : undefined });
    }
    if (!errorShown) {
      errorShown = true;
      var el = document.createElement("div");
      el.className = "gg-error";
      el.textContent = "Ошибка в игре: " + message;
      document.body.appendChild(el);
    }
  }
  window.addEventListener("error", function (e) {
    reportError(e.error || new Error(e.message), "");
  });
  window.addEventListener("unhandledrejection", function (e) {
    reportError(e.reason || new Error("unhandled rejection"), "promise");
  });
  post({ type: "boot" });

  // Дополнительный барьер (не граница безопасности): прячем WebRTC до кода игры.
  ["RTCPeerConnection", "webkitRTCPeerConnection", "RTCDataChannel"].forEach(function (name) {
    try { Object.defineProperty(window, name, { value: undefined, writable: false, configurable: false }); } catch (e) {}
  });

  // ---------- хранилище у оболочки ----------
  var reqSeq = 0;
  var pending = {};
  window.addEventListener("message", function (e) {
    if (e.source !== window.parent) return;
    var m = e.data;
    if (!m || m.gg !== 1) return;
    if (m.type === "storage:value" && pending[m.reqId]) {
      pending[m.reqId](typeof m.value === "string" ? m.value : null);
      delete pending[m.reqId];
    } else if (m.type === "pause") pauseGame();
  });
  var storage = {
    get: function (key) {
      return new Promise(function (ok) {
        if (!hasParent) {
          // Скачанный файл без оболочки: рекорд в localStorage самого файла (в песочнице его нет).
          try { return ok(localStorage.getItem("gg:" + document.title + ":" + String(key).slice(0, 64))); } catch (e) { return ok(null); }
        }
        var id = ++reqSeq;
        pending[id] = ok;
        post({ type: "storage:get", reqId: id, key: String(key).slice(0, 64) });
        setTimeout(function () { if (pending[id]) { delete pending[id]; ok(null); } }, 1500);
      });
    },
    set: function (key, value) {
      if (!hasParent) try { localStorage.setItem("gg:" + document.title + ":" + String(key).slice(0, 64), String(value).slice(0, 2048)); } catch (e) {}
      post({ type: "storage:set", key: String(key).slice(0, 64), value: String(value).slice(0, 2048) });
    },
  };

  // ---------- звук: эффекты и фоновая музыка (синтез WebAudio) ----------
  var audio = null;
  var muted = false;
  var master = null;
  function ensureAudio() {
    if (!audio) {
      var AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      try {
        audio = new AC();
        master = audio.createGain();
        master.gain.value = 1;
        master.connect(audio.destination);
      } catch (e) {
        audio = null;
        return null;
      }
    }
    if (audio.state !== "running" && audio.state !== "closed") audio.resume();
    return audio;
  }
  function tone(freq, dur, type, vol, slideTo, when) {
    if (muted || !audio || audio.state !== "running") return;
    var t = when || audio.currentTime;
    var o = audio.createOscillator();
    var g = audio.createGain();
    o.type = type || "sine";
    o.frequency.setValueAtTime(freq, t);
    if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(slideTo, 1), t + dur);
    g.gain.setValueAtTime(vol == null ? 0.15 : vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, when) {
    if (muted || !audio || audio.state !== "running") return;
    var t = when || audio.currentTime;
    var len = Math.floor(audio.sampleRate * dur);
    var buf = audio.createBuffer(1, len, audio.sampleRate);
    var d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
    var src = audio.createBufferSource();
    var g = audio.createGain();
    var f = audio.createBiquadFilter();
    f.type = "highpass";
    f.frequency.value = 6000;
    src.buffer = buf;
    g.gain.value = vol;
    src.connect(f);
    f.connect(g);
    g.connect(master);
    src.start(t);
  }
  var SFX = {
    tap: function () { tone(660, 0.06, "triangle", 0.12); },
    pop: function () { tone(520, 0.08, "square", 0.08, 900); },
    coin: function () { tone(880, 0.08, "square", 0.08); tone(1320, 0.12, "square", 0.08, null, audio && audio.currentTime + 0.07); },
    jump: function () { tone(300, 0.15, "square", 0.08, 700); },
    hit: function () { tone(180, 0.2, "sawtooth", 0.12, 60); noise(0.12, 0.08); },
    explode: function () { noise(0.4, 0.2); tone(120, 0.35, "sawtooth", 0.12, 40); },
    shoot: function () { var f = 820 + Math.random() * 180; tone(f, 0.08, "square", 0.045, f / 3); },
    powerup: function () { tone(400, 0.25, "triangle", 0.12, 1200); },
    levelup: function () { [523, 659, 784, 1047, 1319].forEach(function (f, i) { tone(f, 0.12, "square", 0.07, null, audio && audio.currentTime + i * 0.07); }); },
    win: function () { [523, 659, 784, 1047].forEach(function (f, i) { tone(f, 0.18, "triangle", 0.14, null, audio && audio.currentTime + i * 0.11); }); },
    lose: function () { [392, 330, 262].forEach(function (f, i) { tone(f, 0.25, "sawtooth", 0.1, null, audio && audio.currentTime + i * 0.15); }); },
  };

  /** Восьмибитная петля по настроению: бас, арпеджио и хай-хэт, планировщик на 16 шагов. */
  var MOODS = {
    happy: { bpm: 132, root: 60, scale: [0, 2, 4, 7, 9], prog: [0, 5, 3, 4] },
    calm: { bpm: 92, root: 57, scale: [0, 2, 4, 7, 9], prog: [0, 3, 4, 3] },
    tense: { bpm: 148, root: 52, scale: [0, 3, 5, 7, 10], prog: [0, 0, 5, 3] },
  };
  var music = { timer: null, step: 0, next: 0, mood: null };
  var midi = function (n) { return 440 * Math.pow(2, (n - 69) / 12); };
  function musicTick() {
    if (!audio || audio.state !== "running" || !music.mood) return;
    var m = MOODS[music.mood];
    var stepDur = 60 / m.bpm / 4;
    while (music.next < audio.currentTime + 0.12) {
      var s = music.step % 64;
      var bar = Math.floor(s / 16) % 4;
      var chordRoot = m.root + [0, 5, 7, 9, 3, 4][m.prog[bar] % 6];
      var t = music.next;
      if (s % 4 === 0) tone(midi(chordRoot - 12), stepDur * 3.5, "triangle", 0.09, null, t);
      if (s % 2 === 0) {
        var deg = m.scale[(s / 2 + bar) % m.scale.length];
        tone(midi(chordRoot + deg + 12), stepDur * 1.6, "square", 0.025, null, t);
      }
      if (s % 4 === 2) noise(0.03, 0.025, t);
      music.step++;
      music.next += stepDur;
    }
  }
  function startMusic() {
    if (!cfg.music || !MOODS[cfg.music] || !ensureAudio()) return;
    music.mood = cfg.music;
    music.next = audio.currentTime + 0.05;
    if (!music.timer) music.timer = setInterval(musicTick, 50);
  }
  function stopMusic() {
    if (music.timer) clearInterval(music.timer);
    music.timer = null;
  }

  // ---------- экраны и HUD рантайма (DOM поверх канваса, стили из kit.css) ----------
  var cfg = {};
  var overlay, muteBtn;
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  /** Тот же расчёт кадра, что у Phaser FIT + CENTER_BOTH: оверлеи kit.css встают ровно на игру. */
  function layout() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var scale = Math.min(vw / 360, vh / 640);
    var root = document.documentElement;
    root.style.setProperty("--gg-frame-w", 360 * scale + "px");
    root.style.setProperty("--gg-frame-h", 640 * scale + "px");
    root.style.setProperty("--gg-frame-x", (vw - 360 * scale) / 2 + "px");
    root.style.setProperty("--gg-frame-y", (vh - 640 * scale) / 2 + "px");
    root.style.setProperty("--gg-scale", String(scale));
  }
  function showOverlay(kind, message) {
    overlay.innerHTML = "";
    var card = el("div", "gg-card");
    if (kind === "start") {
      card.appendChild(el("h1", "gg-title", cfg.title || "Игра"));
      if (cfg.instructions) card.appendChild(el("p", "gg-text", cfg.instructions));
      if (best > 0) card.appendChild(el("p", "gg-sub", "Рекорд: " + best));
    } else if (kind === "paused") {
      card.appendChild(el("h1", "gg-title", "Пауза"));
    } else {
      card.appendChild(el("h1", "gg-title", kind === "won" ? "Победа!" : "Игра окончена"));
      if (message) card.appendChild(el("p", "gg-text", message));
      if (goal) {
        var gl = el("p", "gg-score", (goal.label || "Цель") + ": " + goal.done + " / " + goal.total);
        if (contrast(cfg.palette.primary, cfg.palette.background) < 3) gl.style.color = cfg.palette.text;
        card.appendChild(gl);
      }
      card.appendChild(el("p", goal ? "gg-sub" : "gg-score", "Счёт: " + score));
      card.appendChild(el("p", "gg-sub", newRecord ? "Новый рекорд!" : "Рекорд: " + best));
    }
    var btn = el("button", "gg-btn", kind === "start" ? "Играть" : kind === "paused" ? "Продолжить" : "Ещё раз");
    btn.style.color = readableOn(cfg.palette.primary);
    var shownAt = Date.now();
    btn.addEventListener("click", function () {
      // Защита от случайного тапа, которым игрок только что закончил раунд.
      if (Date.now() - shownAt < 600) return;
      ensureAudio();
      SFX.tap();
      if (kind === "paused") resumeGame();
      else startRound();
    });
    card.appendChild(btn);
    overlay.appendChild(card);
    overlay.style.display = "flex";
  }
  function lum(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || "");
    if (!m) return 0;
    var lin = function (v) { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
  }
  function contrast(a, b) {
    var x = lum(a), y = lum(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /** Цвет текста кнопки по яркости её фона: палитра модели бывает «белое на белом». */
  function readableOn(hex) {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(hex || "");
    if (!m) return "#111111";
    var lin = function (v) { v = parseInt(v, 16) / 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    var l = 0.2126 * lin(m[1]) + 0.7152 * lin(m[2]) + 0.0722 * lin(m[3]);
    return l > 0.45 ? "#111111" : "#ffffff";
  }
  function hideOverlay() {
    overlay.style.display = "none";
  }

  // ---------- состояние игры ----------
  var game = null;
  var SceneClass = null;
  var state = "start";
  var score = 0;
  var best = 0;
  var activeMs = 0;
  var playStartedAt = 0;
  /** Жизни, прощение первой ошибки и цель раунда ведёт рантайм: модель путала их порядок с разминкой. */
  var lives = 3;
  var forgiven = false;
  var softMistakes = 0;
  var softAt = 0;
  var goalMovedAt = 0;
  /** Раунд без таймера не должен длиться вечно: если цель не двигается 30 с после разминки — поражение. */
  setInterval(function () {
    if (state !== "playing" || !goal || GG.inWarmup()) return;
    var warm = ((cfg.balance && cfg.balance.warmupSec) || 8) * 1000;
    if (roundMs() - Math.max(goalMovedAt, warm) > 30000) finish(false, "Цель не сдвинулась 30 секунд");
  }, 1000);
  var invulnerableUntil = 0;
  var goal = null;
  function roundMs() {
    return activeMs + (state === "playing" && playStartedAt ? Date.now() - playStartedAt : 0);
  }

  function setState(s) {
    if (state === "playing" && playStartedAt) activeMs += Date.now() - playStartedAt;
    state = s;
    playStartedAt = s === "playing" ? Date.now() : 0;
    post({ type: "state", state: s, score: score, activeMs: activeMs });
  }
  function gameScene() {
    return game && game.scene.getScene("game");
  }
  function startRound() {
    if (failed || state === "playing") return;
    score = 0;
    activeMs = 0;
    lives = (cfg.balance && cfg.balance.lives) || 3;
    forgiven = false;
    softMistakes = 0;
    softAt = 0;
    goalMovedAt = 0;
    invulnerableUntil = 0;
    goal = null;
    recentHits = [];
    hideOverlay();
    var sc = gameScene();
    if (sc) sc.scene.restart();
    setState("playing");
    startMusic();
  }
  var newRecord = false;
  function finish(won, message) {
    if (state !== "playing") return;
    newRecord = score > best;
    best = Math.max(best, score);
    storage.set("best", String(best));
    setState(won ? "won" : "lost");
    stopMusic();
    (won ? SFX.win : SFX.lose)();
    vibrate(won ? [30, 40, 30] : 120);
    var sc = gameScene();
    // Победу часто даёт то же попадание, что включило замирание кадра: финал должен двигаться.
    if (hitstopActive && sc) sc.sys.resume();
    hitstopActive = false;
    if (won) fx.burst(W / 2, H * 0.45, null, 40, true);
    // Финальные частицы и вспышка видны: сцена живёт ещё 800 мс, потом замирает под карточкой.
    setTimeout(function () {
      if (state === "playing") return;
      if (sc) sc.scene.pause();
      showOverlay(won ? "won" : "lost", message);
    }, 800);
  }
  function pauseGame() {
    if (state !== "playing") return;
    var sc = gameScene();
    if (sc) sc.scene.pause();
    setState("paused");
    stopMusic();
    showOverlay("paused");
  }
  function resumeGame() {
    hideOverlay();
    var sc = gameScene();
    if (sc) sc.scene.resume();
    setState("playing");
    startMusic();
  }
  function vibrate(p) {
    try { if (navigator.vibrate) navigator.vibrate(p); } catch (e) {}
  }

  // ---------- текстуры ----------
  var images = {};
  function loadImages(done) {
    var list = [];
    var sprites = cfg.sprites || {};
    for (var key in sprites) if (sprites[key] && typeof sprites[key].src === "string" && sprites[key].src.indexOf("data:image/") === 0) list.push([key, sprites[key].src]);
    if (typeof cfg.background === "string" && cfg.background.indexOf("data:image/") === 0) list.push(["bg", cfg.background]);
    var left = list.length;
    if (!left) return done();
    list.forEach(function (it) {
      var img = new Image();
      img.onload = img.onerror = function () {
        if (img.naturalWidth) images[it[0]] = img;
        if (--left === 0) done();
      };
      img.src = it[1];
    });
  }
  /** Непрозрачная часть картинки в квадрате 256: хитбокс строится по ней, а не по пустым полям. */
  var opaque = {};
  function opaqueBounds(ctx) {
    try {
      var d = ctx.getImageData(0, 0, 256, 256).data;
      var x0 = 256, y0 = 256, x1 = -1, y1 = -1;
      for (var y = 0; y < 256; y += 2)
        for (var x = 0; x < 256; x += 2)
          if (d[(y * 256 + x) * 4 + 3] > 40) {
            if (x < x0) x0 = x;
            if (x > x1) x1 = x;
            if (y < y0) y0 = y;
            if (y > y1) y1 = y;
          }
      return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 2, h: y1 - y0 + 2 };
    } catch (e) {
      return null;
    }
  }
  /** Каждый ключ спрайта существует как текстура: картинка ИИ или нарисованный emoji, если её нет. */
  function makeTextures(scene) {
    var tx = scene.textures;
    var sprites = cfg.sprites || {};
    // Спрайты вписываются в прозрачный квадрат 256×256: setDisplaySize(s, s) никогда не сплющивает картинку.
    for (var key in images) {
      if (key === "bg") continue;
      var im = images[key];
      var sq = tx.createCanvas(key, 256, 256);
      var k2 = Math.min(256 / im.naturalWidth, 256 / im.naturalHeight);
      var dw = im.naturalWidth * k2, dh = im.naturalHeight * k2;
      sq.getContext().drawImage(im, (256 - dw) / 2, (256 - dh) / 2, dw, dh);
      sq.refresh();
      opaque[key] = opaqueBounds(sq.getContext());
    }
    // Фон есть всегда: картинка ИИ или вертикальный градиент палитры.
    var bgSrc = images.bg;
    if (!bgSrc) {
      var gc = document.createElement("canvas");
      gc.width = W;
      gc.height = H;
      var gx = gc.getContext("2d");
      var gr = gx.createLinearGradient(0, 0, 0, H);
      gr.addColorStop(0, cfg.palette.background);
      gr.addColorStop(1, cfg.palette.primary);
      gx.fillStyle = gr;
      gx.fillRect(0, 0, W, H);
      bgSrc = gc;
    }
    var bgc = tx.createCanvas("bg", W, H);
    bgc.getContext().drawImage(bgSrc, 0, 0, W, H);
    bgc.refresh();
    // bgLoop: фон и его зеркальная копия по вертикали — бесшовная лента для прокрутки tileSprite.
    var loop = tx.createCanvas("bgLoop", W, H * 2);
    var lc = loop.getContext();
    lc.drawImage(bgSrc, 0, 0, W, H);
    lc.save();
    lc.translate(0, H * 2);
    lc.scale(1, -1);
    lc.drawImage(bgSrc, 0, 0, W, H);
    lc.restore();
    loop.refresh();
    for (var k in sprites) {
      if (tx.exists(k)) continue;
      // Снаряд без картинки: светящаяся капсула цвета primary, а не emoji (☄️ путался с врагами).
      if (/bullet|laser|bolt|shot|projectile|missile|beam|dart/i.test(k)) {
        var cap = tx.createCanvas(k, 256, 256);
        var c2 = cap.getContext();
        var g2 = c2.createRadialGradient(128, 128, 10, 128, 128, 120);
        g2.addColorStop(0, "#ffffff");
        g2.addColorStop(0.35, cfg.palette.primary);
        g2.addColorStop(1, "rgba(0,0,0,0)");
        c2.fillStyle = g2;
        c2.beginPath();
        c2.ellipse(128, 128, 46, 118, 0, 0, Math.PI * 2);
        c2.fill();
        cap.refresh();
        continue;
      }
      var c = tx.createCanvas(k, 256, 256);
      var cx = c.getContext();
      cx.font = "200px system-ui, 'Apple Color Emoji', 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif";
      cx.textAlign = "center";
      cx.textBaseline = "middle";
      cx.fillText(sprites[k].fallback || "⭐", 128, 140);
      c.refresh();
    }
    var spark = tx.createCanvas("spark", 64, 64);
    var sc = spark.getContext();
    var grad = sc.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, "rgba(255,255,255,1)");
    grad.addColorStop(0.4, "rgba(255,255,255,0.8)");
    grad.addColorStop(1, "rgba(255,255,255,0)");
    sc.fillStyle = grad;
    sc.fillRect(0, 0, 64, 64);
    spark.refresh();
    var px = tx.createCanvas("px", 8, 8);
    px.getContext().fillStyle = "#fff";
    px.getContext().fillRect(0, 0, 8, 8);
    px.refresh();
  }

  function postThumb() {
    if (!wantThumb || failed || !game || !game.renderer) return;
    try {
      game.renderer.snapshot(function (img) {
        try {
          var c = document.createElement("canvas");
          c.width = 270;
          c.height = 480;
          c.getContext("2d").drawImage(img, 0, 0, 270, 480);
          post({ type: "thumb", image: c.toDataURL("image/jpeg", 0.82) });
        } catch (e) {}
      });
    } catch (e) {}
  }

  var sfxLast = {};

  // ---------- готовые эффекты: размеры и частота заданы здесь, а не на глаз в коде модели ----------
  var calmAudience = false; // kids и seniors: без резких вспышек
  var lastFlash = 0;
  /** Сцена для эффектов; на паузе hitstop тоже: объекты создаются сразу, твины пойдут после замирания. */
  function sceneNow() {
    var sc = gameScene();
    return sc && (sc.sys.isActive() || hitstopActive) ? sc : null;
  }
  function tintOf(c) {
    if (typeof c === "number") return c;
    var hex = typeof c === "string" ? c : cfg.palette.accent;
    try { return window.Phaser.Display.Color.HexStringToColor(hex).color; } catch (e) { return 0xffffff; }
  }
  /**
   * Базовый масштаб объекта для pop и squash. Запоминается, пока на объекте нет эффекта,
   * поэтому частые вызовы не раздувают объект, а намеренное изменение размера игрой учитывается.
   */
  function fxBase(obj) {
    if (!obj.__ggTween || !obj.__ggTween.isPlaying()) obj.__ggBase = { x: obj.scaleX, y: obj.scaleY };
    else obj.__ggTween.stop();
    obj.setScale(obj.__ggBase.x, obj.__ggBase.y);
    return obj.__ggBase;
  }
  var hitstopUntil = 0;
  var hitstopActive = false;
  var recentHits = [];
  /** Граница HUD: эффекты не рисуются выше неё, объекты появляются ниже. */
  var TOP = 200;
  /** Эффекты в мировых координатах не выше HUD в видимой области (с учётом прокрутки камеры). */
  var fxY = function (y) {
    var sc = gameScene();
    var top = sc ? sc.cameras.main.worldView.y : 0;
    return Math.max(y, top + TOP + 30);
  };
  /** На светлом фоне аддитивные искры сливаются в белые пятна: там обычное смешивание и насыщенный цвет. */
  function darkBg() {
    var m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})/i.exec(cfg.palette.background || "");
    if (!m) return true;
    return 0.2126 * parseInt(m[1], 16) + 0.7152 * parseInt(m[2], 16) + 0.0722 * parseInt(m[3], 16) < 110;
  }
  var fx = {
    /** Разлёт искр: попадание, сбор, взрыв (мировые координаты события). */
    burst: function (x, y, color, count, screen) {
      var sc = sceneNow();
      if (!sc) return;
      var n = Math.min(count || 18, 60);
      var dark = darkBg();
      var em = sc.add
        .particles(x, screen ? y : fxY(y), "spark", { speed: { min: 160, max: 520 }, scale: { start: dark ? 1.1 : 0.9, end: 0 }, lifespan: { min: 350, max: 650 }, tint: dark ? [tintOf(color), 0xffffff] : tintOf(color), blendMode: dark ? "ADD" : "NORMAL", emitting: false })
        .setDepth(40);
      if (screen) em.setScrollFactor(0);
      em.explode(n);
    },
    /** Всплывающий текст «+10» над местом события. */
    float: function (x, y, text, color, screen) {
      var sc = sceneNow();
      if (!sc) return;
      if (!screen) y = fxY(y);
      var t = sc.add
        .text(x, y, String(text), { fontFamily: GG.font, fontSize: Math.round(46 * Math.min(cfg.uiScale, 1.4)) + "px", fontStyle: "bold", color: color || "#ffffff", stroke: "#000000", strokeThickness: 8 })
        .setOrigin(0.5)
        .setDepth(45);
      if (screen) t.setScrollFactor(0);
      sc.tweens.add({ targets: t, y: y - 120, alpha: 0, scale: 1.25, duration: 750, ease: "Cubic.Out", onComplete: function () { t.destroy(); } });
    },
    /**
     * Попадание по объекту: остановка кадра на 60 мс (вся сцена, а не только физика), искры, отлёт
     * с вращением; объект сразу становится неактивным (GG.alive(obj) === false) и удаляется после анимации.
     */
    hit: function (obj, color) {
      var sc = sceneNow();
      if (!sc || !obj || !obj.active || obj.__ggDying) return;
      obj.__ggDying = true;
      fx.burst(obj.x, obj.y, color, 16);
      if (obj.body) obj.body.enable = false;
      if (obj.disableInteractive) obj.disableInteractive();
      obj.setActive(false);
      if (obj.__ggTween) obj.__ggTween.stop();
      sc.tweens.add({ targets: obj, scaleX: obj.scaleX * 1.35, scaleY: obj.scaleY * 1.35, angle: (obj.angle || 0) + window.Phaser.Math.Between(-200, 200), alpha: 0, y: obj.y - 60, duration: 320, ease: "Quad.Out", onComplete: function () { obj.destroy(); } });
      recentHits.push({ x: obj.x, y: obj.y, t: Date.now() });
      if (recentHits.length > 20) recentHits.shift();
      var now = Date.now();
      if (now > hitstopUntil + 150 && state === "playing") {
        hitstopUntil = now + 60;
        hitstopActive = true;
        // sys.pause/resume применяются сразу; scene.pause встаёт в очередь до следующего такта,
        // и тогда финал, начатый тем же тапом, замерзал.
        sc.sys.pause();
        setTimeout(function () {
          if (!hitstopActive) return;
          hitstopActive = false;
          // Пользовательская пауза (свернули вкладку) не снимается; победа и поражение — снимаются.
          if (state !== "paused") sc.sys.resume();
        }, 60);
      }
    },
    /** Промах или пропуск: серо-красный хлопок и «мимо», отличимый от поимки и попадания. */
    miss: function (x, y, text) {
      var sc = sceneNow();
      if (!sc) return;
      sc.add
        .particles(x, fxY(y), "spark", { speed: { min: 60, max: 200 }, scale: { start: 0.6, end: 0 }, lifespan: 320, tint: [0x9aa0a6, 0xd9534f], blendMode: "NORMAL", emitting: false })
        .setDepth(40)
        .explode(8);
      fx.float(x, y, text || "мимо", "#ff6b6b");
    },
    /** Тряска камеры: light — касание, medium — урон, heavy — взрыв. */
    shake: function (level) {
      var sc = sceneNow();
      if (!sc) return;
      var k = level === "heavy" ? [260, 0.02] : level === "medium" ? [170, 0.011] : [90, 0.005];
      sc.cameras.main.shake(k[0], calmAudience ? k[1] * 0.5 : k[1]);
    },
    /** Вспышка экрана для больших событий: не дольше 150 мс и не чаще раза в 3 с; для детей и пожилых — мягкий пульс. */
    flash: function (color) {
      var sc = sceneNow();
      var now = Date.now();
      if (!sc || now - lastFlash < 3000) return;
      lastFlash = now;
      var c = window.Phaser.Display.Color.IntegerToColor(tintOf(color || "#ffffff"));
      if (!calmAudience) return sc.cameras.main.flash(140, c.red, c.green, c.blue);
      var pulse = sc.add.rectangle(W / 2, H / 2, W, H, tintOf(color || "#ffffff"), 0.22).setDepth(47).setScrollFactor(0);
      sc.tweens.add({ targets: pulse, alpha: 0, duration: 380, ease: "Quad.Out", onComplete: function () { pulse.destroy(); } });
    },
    /** Баннер «Уровень 2!»: в экранных координатах поверх полосы HUD (игровое поле не закрывает), около секунды. */
    banner: function (text, color) {
      var sc = sceneNow();
      if (!sc) return;
      var y = TOP / 2;
      var bg = sc.add.rectangle(W / 2, y, W, TOP, 0x111318, 1).setDepth(150).setScrollFactor(0);
      var t = sc.add
        .text(W / 2, y, String(text), { fontFamily: GG.font, fontSize: "60px", fontStyle: "bold", color: color || "#ffffff", stroke: "#000000", strokeThickness: 10 })
        .setOrigin(0.5)
        .setDepth(151)
        .setScrollFactor(0);
      var fit = Math.min(1, 660 / Math.max(1, t.width));
      bg.scaleY = 0;
      t.setScale(fit * 0.4).setAlpha(0);
      sc.tweens.add({ targets: bg, scaleY: 1, duration: 160, ease: "Quad.Out" });
      sc.tweens.add({ targets: t, scale: fit, alpha: 1, duration: 260, ease: "Back.Out" });
      sc.tweens.add({ targets: [t, bg], alpha: 0, delay: 800, duration: 220, onComplete: function () { t.destroy(); bg.destroy(); } });
      SFX.levelup();
    },
    /** Появление объекта: вырастает из нуля до своего размера (вызывать после setDisplaySize). */
    pop: function (obj) {
      var sc = sceneNow();
      if (!sc || !obj) return obj;
      var b = fxBase(obj);
      obj.setScale(0);
      obj.__ggTween = sc.tweens.add({ targets: obj, scaleX: b.x, scaleY: b.y, duration: 240, ease: "Back.Out", onComplete: function () { obj.setScale(b.x, b.y); } });
      return obj;
    },
    /** Сплющивание при приземлении или поимке; повторные вызовы не накапливают масштаб. */
    squash: function (obj) {
      var sc = sceneNow();
      if (!sc || !obj || !obj.active) return;
      var b = fxBase(obj);
      // Тело физики растёт вместе с масштабом: у физических объектов сплющивание мягче, чтобы окно ловли не прыгало.
      var sx = obj.body ? 1.08 : 1.25, sy = obj.body ? 0.93 : 0.78;
      obj.__ggTween = sc.tweens.add({ targets: obj, scaleX: b.x * sx, scaleY: b.y * sy, duration: 70, yoyo: true, ease: "Quad.Out", onComplete: function () { obj.setScale(b.x, b.y); } });
    },
  };

  /**
   * Честный хитбокс: прямоугольник по центру, k — доля размера кадра (0.7 по умолчанию).
   * setSize масштабируется вместе с объектом; радиус setCircle Phaser не масштабирует (ловля «магнитом»).
   */
  function hitbox(obj, k, shape) {
    if (!obj || !obj.body) return obj;
    k = k || 0.7;
    var b = obj.texture && opaque[obj.texture.key];
    if (shape === "circle") {
      // Круг для пуль и круглых объектов: квадрат засчитывает диагональные касания раньше времени.
      // Радиус и центр в пикселях текстуры; коллизии Phaser берут halfWidth, он масштабируется сам.
      var cx = b ? b.x + b.w / 2 : obj.width / 2, cy = b ? b.y + b.h / 2 : obj.height / 2;
      var r = (Math.min(b ? b.w : obj.width, b ? b.h : obj.height) * k) / 2;
      obj.body.setCircle(r, cx - r, cy - r);
      if (obj.body.isStatic && obj.refreshBody) obj.refreshBody();
      return obj;
    }
    if (b && obj.width === 256 && obj.height === 256) {
      // Прямоугольник по видимой части картинки, по центру неё; смещения в пикселях текстуры.
      var w = b.w * k, h = b.h * k;
      obj.body.setSize(w, h, false);
      obj.body.setOffset(b.x + (b.w - w) / 2, b.y + (b.h - h) / 2);
    } else obj.body.setSize(obj.width * k, obj.height * k, true);
    if (obj.body.isStatic && obj.refreshBody) obj.refreshBody();
    return obj;
  }

  // ---------- публичный API для кода игры ----------
  var GG = {
    W: W,
    H: H,
    get palette() { return cfg.palette; },
    get uiScale() { return cfg.uiScale; },
    get speed() { return cfg.speed; },
    /** Шрифт для this.add.text: системный, жирный — веб-шрифты в песочнице не грузятся. */
    font: "system-ui, -apple-system, 'Segoe UI', Roboto, sans-serif",
    get state() { return state; },
    get score() { return score; },
    set score(v) { score = Math.max(0, Math.floor(Number(v) || 0)); },
    get best() { return best; },
    addScore: function (n) { score = Math.max(0, score + Math.floor(n == null ? 1 : n)); },
    win: function (message) { finish(true, message); },
    lose: function (message) { finish(false, message); },
    sfx: function (name) {
      if (name === "win" || name === "lose") return; // их играет рантайм в finish
      var f = SFX[name];
      var now = Date.now();
      if (!f || now - (sfxLast[name] || 0) < (name === "shoot" ? 300 : 50)) return;
      sfxLast[name] = now;
      f();
    },
    fx: fx,
    hitbox: hitbox,
    /** Нижняя граница HUD (y): игровые объекты появляются и поражаются только ниже. */
    top: TOP,
    /** Числа баланса из спеки: используйте их, а не свои. */
    get balance() { return cfg.balance || {}; },
    get lives() { return lives; },
    set lives(v) { lives = Math.max(0, Math.floor(Number(v) || 0)); },
    /**
     * Ошибка игрока (удар, пропуск, падение). Рантайм сам применяет порядок: разминка → прощение первой
     * ошибки → неуязвимость → минус жизнь → поражение. Возвращает "warmup" | "forgiven" | "invulnerable" | "hit" | "dead".
     */
    damage: function (reason, opts) {
      if (state !== "playing") return "invulnerable";
      var now = Date.now();
      if (GG.inWarmup()) return "warmup";
      if (now < invulnerableUntil) return "invulnerable";
      // Мягкая ошибка (тап мимо, неточность): три мягких = одна настоящая; каждые 3 с одна забывается.
      if (opts && opts.soft) {
        softMistakes = Math.max(0, softMistakes - Math.floor((now - softAt) / 3000));
        softAt = now;
        softMistakes++;
        if (softMistakes < 3) return "soft";
        softMistakes = 0;
      }
      invulnerableUntil = now + 900;
      if (!forgiven) {
        forgiven = true;
        fx.shake("light");
        fx.float(W / 2, TOP + 120, "Осторожно!", "#ffd166", true);
        return "forgiven";
      }
      lives = Math.max(0, lives - 1);
      fx.shake("medium");
      SFX.hit();
      vibrate(80);
      if (lives === 0) {
        finish(false, "Жизни закончились");
        return "dead";
      }
      return "hit";
    },
    /** Идёт разминка: ошибки не считаются, опасности не появляются. */
    inWarmup: function () { return state === "playing" && roundMs() < ((cfg.balance && cfg.balance.warmupSec) || 8) * 1000; },
    /** Прогресс цели для HUD и финальной карточки: GG.setGoal(12, 24, 'Фрукты'). */
    setGoal: function (done, total, label) {
      var d = Math.max(0, done | 0);
      if (!goal || d !== goal.done) goalMovedAt = roundMs();
      goal = { done: d, total: Math.max(1, total | 0), label: label ? String(label).slice(0, 24) : "" };
    },
    /** Был ли рядом недавний GG.fx.hit: тап по только что сбитому объекту не считается промахом. */
    recentlyHit: function (x, y, r, ms) {
      var now = Date.now();
      r = r || 120;
      ms = ms || 500;
      for (var i = recentHits.length - 1; i >= 0; i--) {
        var h = recentHits[i];
        if (now - h.t > ms) break;
        if (Math.abs(h.x - x) < r && Math.abs(h.y - y) < r) return true;
      }
      return false;
    },
    /** Объект участвует в игре: существует и не гибнет после GG.fx.hit. */
    alive: function (obj) { return !!(obj && obj.active && !obj.__ggDying); },
    vibrate: vibrate,
    storage: storage,
    hasImage: function (key) { return !!images[key]; },
    run: function (Scene) { SceneClass = Scene; },
  };

  // Загрузчик отдельно от API: код игры получает API как `var GG = __GG.init(cfg)`.
  window.__GG = {
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
      calmAudience = cfg.uiScale >= 1.3 || cfg.calm === true;
      var backdrop = el("div", "gg-backdrop");
      if (typeof cfg.background === "string" && cfg.background.indexOf("data:image/") === 0) backdrop.style.backgroundImage = "url(" + cfg.background + ")";
      document.body.appendChild(backdrop);
      overlay = el("div", "gg-overlay");
      document.body.appendChild(overlay);
      muteBtn = el("button", "gg-mute", "🔊");
      muteBtn.setAttribute("aria-label", "Звук");
      muteBtn.addEventListener("click", function () {
        muted = !muted;
        muteBtn.textContent = muted ? "🔇" : "🔊";
        if (master) master.gain.value = muted ? 0 : 1;
      });
      document.body.appendChild(muteBtn);
      layout();
      window.addEventListener("resize", layout);
      document.addEventListener("visibilitychange", function () { if (document.hidden) pauseGame(); });
      document.addEventListener("contextmenu", function (e) { e.preventDefault(); });
      // Первый жест на странице включает звук (политика автозапуска в браузерах).
      document.addEventListener("pointerdown", function () { ensureAudio(); }, { once: true });
      return GG;
    },
    api: GG,
    boot: function () {
      if (typeof window.Phaser === "undefined") return reportError(new Error("Phaser не загрузился"), "boot");
      if (typeof SceneClass !== "function") return reportError(new Error("game did not call GG.run(GameScene)"), "boot");
      storage.get("best").then(function (v) { best = Math.max(best, parseInt(v || "0", 10) || 0); });
      loadImages(function () {
        var frames = 0;
        var Boot = {
          key: "gg-boot",
          create: function () {
            try {
              makeTextures(this);
              this.scene.add("game", SceneClass, true);
            } catch (e) {
              reportError(e, "create");
            }
          },
        };
        try {
          game = new window.Phaser.Game({
            type: window.Phaser.AUTO,
            parent: "gg-root",
            width: W,
            height: H,
            backgroundColor: cfg.palette.background,
            scale: { mode: window.Phaser.Scale.FIT, autoCenter: window.Phaser.Scale.CENTER_BOTH },
            physics: { default: "arcade", arcade: { gravity: { x: 0, y: 0 }, debug: false } },
            audio: { noAudio: true },
            banner: false,
            input: { activePointers: 3 },
            render: { antialias: true, powerPreference: "high-performance" },
            scene: [Boot],
          });
        } catch (e) {
          return reportError(e, "Phaser.Game");
        }
        // Самопроверка: сцена игры отрабатывает create и 20 кадров update до экрана старта.
        game.events.on("postrender", function onFrame() {
          if (!gameScene() || !gameScene().sys.isActive()) return;
          frames++;
          if (frames === 20) {
            if (failed) return game.events.off("postrender", onFrame);
            gameScene().scene.restart();
          } else if (frames === 23) {
            game.events.off("postrender", onFrame);
            if (failed) return;
            gameScene().scene.pause();
            readyDone = true;
            post({ type: "frame", painted: true });
            post({ type: "ready" });
            showOverlay("start");
            setTimeout(postThumb, 100);
          }
        });
      });
    },
  };
})();
