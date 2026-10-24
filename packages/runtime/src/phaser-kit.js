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
  /** Превью автора просит подобрать сложность ботами (#…&tune=1). */
  var wantTune = /[#&]tune=1/.test(location.hash);
  /** Симуляция баланса: время виртуальное, без звука, эффектов, телеметрии и экранов. */
  var sim = false;
  /**
   * Во сколько раз подбор ускорил игру. Игры двигают мир на dt × GG.speed, поэтому разминка считается
   * в игровом времени: иначе при ускорении в неё влезает больше прогресса и игра становится легче.
   */
  var speedFactor = 1;
  var simNow = 0;
  function clock() { return sim ? simNow : Date.now(); }

  function post(msg) {
    if (!hasParent || (sim && msg.type !== "error")) return;
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
    if (muted || sim || !audio || audio.state !== "running") return;
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
    if (muted || sim || !audio || audio.state !== "running") return;
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
  /** Начало текущего отрезка игры; null — не играем (0 — законное время на виртуальных часах). */
  var playStartedAt = null;
  /** Жизни, прощение первой ошибки и цель раунда ведёт рантайм: модель путала их порядок с разминкой. */
  var lives = 3;
  var forgiven = false;
  var softMistakes = 0;
  var softAt = 0;
  var goalMovedAt = 0;
  /** Раунд без таймера не должен длиться вечно: если цель не двигается 30 с после разминки — поражение. */
  var STALL_MSG = "Цель не сдвинулась 30 секунд";
  function stallCheck() {
    if (state !== "playing" || !goal || GG.inWarmup()) return;
    var warm = ((cfg.balance && cfg.balance.warmupSec) || 8) * 1000 / speedFactor;
    if (roundMs() - Math.max(goalMovedAt, warm) > 30000) finish(false, STALL_MSG);
  }
  setInterval(function () { if (!sim) stallCheck(); }, 1000);
  var invulnerableUntil = 0;
  var goal = null;
  function roundMs() {
    return activeMs + (state === "playing" && playStartedAt !== null ? clock() - playStartedAt : 0);
  }

  function setState(s) {
    if (state === "playing" && playStartedAt !== null) activeMs += clock() - playStartedAt;
    state = s;
    playStartedAt = s === "playing" ? clock() : null;
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
  var simResult = null;
  function finish(won, message) {
    if (state !== "playing") return;
    if (sim) {
      simResult = { won: won, ms: roundMs(), stall: !won && message === STALL_MSG };
      state = won ? "won" : "lost";
      return;
    }
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
    // bgLoop: две копии фона подряд, шов скрыт плавным переходом низа картинки в её верх
    // (зеркальная копия давала «два солнца» и перевёрнутые пейзажи).
    var loop = tx.createCanvas("bgLoop", W, H * 2);
    var lc = loop.getContext();
    lc.drawImage(bgSrc, 0, 0, W, H);
    lc.drawImage(bgSrc, 0, H, W, H);
    var SEAM = 220;
    var strip = document.createElement("canvas");
    strip.width = W;
    strip.height = SEAM;
    var stc = strip.getContext("2d");
    // Нижняя полоса картинки продолжается за шов и растворяется в её верхней части.
    stc.drawImage(bgSrc, 0, (bgSrc.height || H) * (1 - SEAM / H), bgSrc.width || W, (bgSrc.height || H) * (SEAM / H), 0, 0, W, SEAM);
    stc.globalCompositeOperation = "destination-in";
    var fade = stc.createLinearGradient(0, 0, 0, SEAM);
    fade.addColorStop(0, "rgba(0,0,0,1)");
    fade.addColorStop(1, "rgba(0,0,0,0)");
    stc.fillStyle = fade;
    stc.fillRect(0, 0, W, SEAM);
    lc.drawImage(strip, 0, H);
    lc.drawImage(strip, 0, 0);
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
      if (!sc || sim) return;
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
      if (!sc || sim) return;
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
      recentHits.push({ x: obj.x, y: obj.y, t: clock() });
      if (sim) return void obj.destroy();
      if (obj.__ggTween) obj.__ggTween.stop();
      sc.tweens.add({ targets: obj, scaleX: obj.scaleX * 1.35, scaleY: obj.scaleY * 1.35, angle: (obj.angle || 0) + window.Phaser.Math.Between(-200, 200), alpha: 0, y: obj.y - 60, duration: 320, ease: "Quad.Out", onComplete: function () { obj.destroy(); } });
      if (recentHits.length > 20) recentHits.shift();
      var now = clock();
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
      if (!sc || sim) return;
      var k = level === "heavy" ? [260, 0.02] : level === "medium" ? [170, 0.011] : [90, 0.005];
      sc.cameras.main.shake(k[0], calmAudience ? k[1] * 0.5 : k[1]);
    },
    /** Вспышка экрана для больших событий: не дольше 150 мс и не чаще раза в 3 с; для детей и пожилых — мягкий пульс. */
    flash: function (color) {
      var sc = sceneNow();
      var now = clock();
      if (!sc || sim || now - lastFlash < 3000) return;
      lastFlash = now;
      var c = window.Phaser.Display.Color.IntegerToColor(tintOf(color || "#ffffff"));
      if (!calmAudience) return sc.cameras.main.flash(140, c.red, c.green, c.blue);
      var pulse = sc.add.rectangle(W / 2, H / 2, W, H, tintOf(color || "#ffffff"), 0.22).setDepth(47).setScrollFactor(0);
      sc.tweens.add({ targets: pulse, alpha: 0, duration: 380, ease: "Quad.Out", onComplete: function () { pulse.destroy(); } });
    },
    /** Баннер «Уровень 2!»: в экранных координатах поверх полосы HUD (игровое поле не закрывает), около секунды. */
    banner: function (text, color) {
      var sc = sceneNow();
      if (!sc || sim) return;
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
      // Сначала гаснет текст, потом фон: HUD под баннером не просвечивает сквозь полупрозрачный текст.
      sc.tweens.add({ targets: t, alpha: 0, delay: 800, duration: 160, onComplete: function () { t.destroy(); } });
      sc.tweens.add({ targets: bg, alpha: 0, delay: 960, duration: 160, onComplete: function () { bg.destroy(); } });
      SFX.levelup();
    },
    /** Появление объекта: вырастает из нуля до своего размера (вызывать после setDisplaySize). */
    pop: function (obj) {
      var sc = sceneNow();
      if (!sc || !obj || sim) return obj;
      var b = fxBase(obj);
      obj.setScale(0);
      obj.__ggTween = sc.tweens.add({ targets: obj, scaleX: b.x, scaleY: b.y, duration: 240, ease: "Back.Out", onComplete: function () { obj.setScale(b.x, b.y); } });
      return obj;
    },
    /** Сплющивание при приземлении или поимке; повторные вызовы не накапливают масштаб. */
    squash: function (obj) {
      var sc = sceneNow();
      if (!sc || !obj || !obj.active || sim) return;
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

  // ---------- ввод ботов: настоящие события мыши на канвасе, игра обрабатывает их как касания ----------
  var botHeld = false;
  /** Последняя точка пальца бота: отпускание без координат — там же, иначе свайп превращается в рывок к центру. */
  var botX = W / 2, botY = H / 2;
  function botEvent(type, x, y) {
    if (!game || !game.canvas) return;
    var r = game.canvas.getBoundingClientRect();
    botX = x;
    botY = y;
    var cx = r.left + (x / W) * r.width, cy = r.top + (y / H) * r.height;
    var ev = new MouseEvent(type, { clientX: cx, clientY: cy, button: 0, buttons: type === "mouseup" ? 0 : 1, bubbles: true, cancelable: true });
    game.canvas.dispatchEvent(ev);
  }
  var bot = {
    tap: function (x, y) { botEvent("mousedown", x, y); botEvent("mouseup", x, y); botHeld = false; },
    down: function (x, y) { botEvent("mousedown", x, y); botHeld = true; },
    move: function (x, y) { botEvent("mousemove", x, y); },
    up: function (x, y) { botEvent("mouseup", x == null ? botX : x, y == null ? botY : y); botHeld = false; },
  };
  /**
   * Навык бота задаёт рантайм, одинаково для всех игр: модель пишет только хорошего игрока, а
   * небрежного рантайм делает сам — команды исполняются с задержкой реакции, с промахом по координатам
   * и пропадают во время отвлечений. Раньше «небрежного» писала модель, и в каждой игре он был своим.
   */
  var botSkill = 1;
  var botQueue = [];
  var botNoise = { x: 0, y: 0 };
  var noiseTarget = { x: 0, y: 0 }, noiseRetarget = 0;
  var distractedUntil = 0, nextDistraction = 0;
  function botReaction() { return 120 + 300 * (1 - botSkill); }
  function newNoise() {
    var spread = 130 * (1 - botSkill);
    return { x: (Math.random() * 2 - 1) * spread, y: (Math.random() * 2 - 1) * spread * 0.5 };
  }
  function botCommand(type, x, y) {
    if (!sim) return bot[type](x, y);
    var gesture = type === "tap" || type === "down";
    // Человек ждёт результата касания: пока своё касание ещё «в пути», новое не делает (иначе веер выстрелов).
    if (gesture && botQueue.some(function (c) { return c.type === "tap" || c.type === "down"; })) return;
    // Во время отвлечения теряются только движения; нажатия и отпускания доходят после него.
    if (simNow < distractedUntil && type === "move") return;
    if (gesture) {
      botNoise = newNoise();
      noiseTarget = { x: botNoise.x, y: botNoise.y };
    }
    var at = Math.max(simNow + botReaction(), type === "move" ? 0 : distractedUntil);
    botQueue.push({ t: at, type: type, rx: x, ry: y });
  }
  function botFlush() {
    // Промах дрейфует и во время долгого удержания: новая цель раз в 0,5-1 с, плавный переход.
    if (simNow >= noiseRetarget) {
      noiseTarget = newNoise();
      noiseRetarget = simNow + 500 + Math.random() * 500;
    }
    botNoise.x += (noiseTarget.x - botNoise.x) * 0.06;
    botNoise.y += (noiseTarget.y - botNoise.y) * 0.06;
    if (botSkill < 1 && simNow >= nextDistraction) {
      distractedUntil = simNow + 700 + Math.random() * 600;
      nextDistraction = distractedUntil + 4000 + Math.random() * 5000;
    }
    botQueue.sort(function (a, b) { return a.t - b.t; });
    while (botQueue.length && botQueue[0].t <= simNow) {
      var c = botQueue.shift();
      var cx = c.rx == null ? null : Math.max(4, Math.min(W - 4, c.rx + botNoise.x));
      var cy = c.ry == null ? null : Math.max(4, Math.min(H - 4, c.ry + botNoise.y));
      bot[c.type](cx, cy);
    }
  }

  // ---------- автоподбор сложности: раунды ботами на виртуальном времени без отрисовки ----------
  var STEP = 1000 / 60;
  /** Множители скорости, которые пробует подбор (тот же список проверяет сервер). */
  var TUNE_LADDER = [0.6, 0.75, 0.9, 1, 1.15, 1.35, 1.6, 1.9];
  /** «Наугад»: каждые 0,4–1 с касание или протяжка в случайную точку игрового поля. */
  function randomBot() {
    var next = 0, dragTo = null;
    return function () {
      if (simNow < next) {
        if (dragTo && botHeld) bot.move(dragTo.x, dragTo.y);
        return;
      }
      next = simNow + 400 + Math.random() * 600;
      var x = 40 + Math.random() * (W - 80), y = TOP + 40 + Math.random() * (H - TOP - 80);
      if (Math.random() < 0.5) {
        if (botHeld) bot.up(x, y);
        bot.tap(x, y);
        dragTo = null;
      } else {
        if (!botHeld) bot.down(x, y);
        dragTo = { x: 40 + Math.random() * (W - 80), y: TOP + 40 + Math.random() * (H - TOP - 80) };
      }
    };
  }
  /** Один раунд: kind — idle | random | число (навык бота игры от 0 до 1). */
  function simRound(kind, maxMs) {
    var sc = gameScene();
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
    simResult = null;
    if (botHeld) bot.up();
    sc.scene.restart();
    simNow = 0;
    state = "playing";
    playStartedAt = simNow;
    var act = kind === "random" ? randomBot() : null;
    botSkill = typeof kind === "number" ? kind : 1;
    botQueue = [];
    botNoise = { x: 0, y: 0 };
    noiseTarget = { x: 0, y: 0 };
    noiseRetarget = 0;
    distractedUntil = 0;
    nextDistraction = 3000 + Math.random() * 4000;
    var steps = 0;
    var warmFrac = null;
    while (state === "playing" && simNow < maxMs) {
      game.headlessStep(simNow, STEP);
      simNow += STEP;
      steps++;
      if (failed) return null;
      var live = gameScene();
      if (kind === "random") act();
      else if (typeof kind === "number" && live && typeof live.bot === "function") {
        try {
          live.bot(1, STEP);
        } catch (e) {
          reportError(e, "bot");
          return null;
        }
        botFlush();
      }
      if (steps % 60 === 0) stallCheck();
      if (warmFrac === null && !GG.inWarmup()) warmFrac = goal ? goal.done / goal.total : 0;
    }
    if (warmFrac === null) warmFrac = goal ? goal.done / goal.total : 0;
    if (botHeld) bot.up();
    var res = simResult || { won: false, ms: roundMs(), timeout: true };
    res.warmFrac = warmFrac;
    return res;
  }

  /**
   * Подбирает множитель скорости игры (GG.speed) так, чтобы небрежный игрок выигрывал примерно в
   * половине раундов (у детей и пожилых — чаще), хороший выигрывал, а «наугад» — нет. Игра должна
   * реализовать метод bot(skill, dtMs). Возвращает отчёт или null, если подбор невозможен.
   */
  function tuneDifficulty() {
    var sc = gameScene();
    if (!sc || typeof sc.bot !== "function" || typeof game.headlessStep !== "function") return null;
    // Множители абсолютные, от неоткалиброванной скорости: подбор поверх уже откалиброванной версии
    // иначе перемножил бы их.
    var tunedSpeed = cfg.speed;
    var baseFactor = speedFactor;
    var base = cfg.speed / (speedFactor || 1);
    var baseLives = (cfg.balance && cfg.balance.lives) || 3;
    var lives0 = baseLives;
    var baseTime = (cfg.balance && cfg.balance.timeLimitSec) || 0;
    var timeLimit0 = baseTime;
    var calm = calmAudience;
    var limit = ((cfg.balance && cfg.balance.timeLimitSec) || 0) > 0 ? cfg.balance.timeLimitSec * 1000 + 2000 : 150000;
    var started = Date.now();
    var BUDGET_MS = 25000;
    var ladder = TUNE_LADDER;
    var idx = ladder.indexOf(1);
    var tried = {};
    var chosen = null;
    var midTried = false;
    var inWindow = null;
    var probed = false;
    /** После вставки промежуточной ступени индексы выше неё сдвигаются на один. */
    function remapTried(t, at) {
      var out = {};
      for (var k in t) {
        var parts = k.split(":");
        var i = +parts[0];
        if (i >= at) t[k].idx = i + 1;
        out[(i >= at ? i + 1 : i) + ":" + parts[1] + ":" + parts[2]] = t[k];
      }
      return out;
    }
    game.loop.sleep();
    sim = true;
    try {
      for (var attempt = 0; attempt < 10; attempt++) {
        var f = ladder[idx];
        cfg.speed = base * f;
        speedFactor = f;
        if (cfg.balance) cfg.balance.lives = lives0;
        if (cfg.balance && timeLimit0) cfg.balance.timeLimitSec = timeLimit0;
        var lim = timeLimit0 ? timeLimit0 * 1000 + 2000 : limit;
        // Раунды дешёвые (без отрисовки), поэтому выборка большая: разброс случайности меньше.
        var goods = [simRound(1, lim), simRound(1, lim)];
        var careless = [];
        for (var c = 0; c < 16; c++) careless.push(simRound(0.5, lim));
        var randoms = [simRound("random", lim), simRound("random", lim), simRound("random", lim)];
        var idle = simRound("idle", lim);
        var all = goods.concat(careless, randoms, [idle]);
        for (var a = 0; a < all.length; a++) if (!all[a]) return null;
        var gWins = goods.filter(function (g) { return g.won; }).length;
        var cWins = careless.filter(function (g) { return g.won; }).length;
        var cTimeouts = careless.filter(function (g) { return !g.won && timeLimit0 && g.ms >= timeLimit0 * 1000 - 500; }).length;
        var rWins = randoms.filter(function (g) { return g.won; }).length;
        var cStalls = careless.filter(function (g) { return g.stall; }).length;
        var r = { idx: idx, factor: f, lives: lives0, timeLimitSec: timeLimit0, goodWon: gWins > 0, goodMs: Math.round(goods[0].ms), carelessWins: cWins, carelessMs: Math.round(careless.reduce(function (s, g) { return s + g.ms; }, 0) / careless.length), randomWon: rWins > 0 };
        // Цель: хороший выигрывает, наугад нет; небрежный выигрывает 3-5 из 8 (дети и пожилые 5-8 из 8).
        r.tooHard = gWins === 0 || cWins < (calm ? 10 : 6);
        r.idleWon = !!idle.won;
        r.tooEasy = rWins > 0 || idle.won || (!calm && cWins > 10);
        // Цель собирается в разминке: ускорение тут не помогает, нужна правка самой игры.
        r.warmupLeak = goods.some(function (g) { return g.warmFrac > 0.3; });
        // Небрежный проигрывает по таймеру, а не по ошибкам — помогает только больше времени.
        r.timerBound = r.tooHard && timeLimit0 && cTimeouts >= (16 - cWins) / 2;
        // Небрежный «проигрывает» по правилу 30 с при живых жизнях: в игре зацикливание, а не сложность.
        r.stallBound = cStalls * 3 > 16 - cWins && 16 - cWins > 0;
        tried[idx + ":" + lives0 + ":" + timeLimit0] = r;
        if (/[#&]tunedebug=1/.test(location.hash)) console.log("TUNEDBG " + JSON.stringify(r));
        if (r.stallBound) {
          chosen = r;
          break;
        }
        if (!r.tooHard && !r.tooEasy) {
          inWindow = r;
          // Одна выборка в окне ещё не точка цели: пробуем соседнюю ступень, чтобы было что интерполировать.
          var probe = r.carelessWins / 16 > (calm ? 0.75 : 0.5) ? idx + 1 : idx - 1;
          if (probe >= 0 && probe < ladder.length && !tried[probe + ":" + lives0 + ":" + timeLimit0] && !probed) {
            probed = true;
            idx = probe;
            continue;
          }
          break;
        }
        var next = r.tooHard ? idx - 1 : idx + 1;
        if (Date.now() - started > BUDGET_MS) break;
        // Третья ручка — время раунда, когда небрежный не успевает (не больше чем вдвое).
        if (r.timerBound && timeLimit0 < baseTime * 2) {
          timeLimit0 = Math.min(baseTime * 2, Math.round(timeLimit0 * 1.25));
          continue;
        }
        // Скорость упёрлась в край лестницы: вторая ручка — жизни (больше, если слишком сложно).
        if (next < 0 && cfg.balance && lives0 < 9) {
          lives0 = Math.min(9, lives0 + 2);
          continue;
        }
        if (next >= ladder.length && cfg.balance && lives0 > 2) {
          lives0 = Math.max(2, lives0 - 1);
          continue;
        }
        if (next >= 0 && next < ladder.length && tried[next + ":" + lives0 + ":" + timeLimit0]) {
          // Соседняя ступень по другую сторону окна: переход резкий, пробуем середину между ними.
          var other = tried[next + ":" + lives0 + ":" + timeLimit0];
          if (other.tooHard !== r.tooHard && !midTried) {
            midTried = true;
            ladder = ladder.slice();
            var mid = Math.round(((ladder[idx] + ladder[next]) / 2) * 100) / 100;
            ladder.splice(Math.max(idx, next), 0, mid);
            idx = Math.max(idx, next);
            tried = remapTried(tried, idx);
            continue;
          }
          break;
        }
        if (next < 0 || next >= ladder.length) break;
        idx = next;
      }
      // Бот игры сломан (хороший не выигрывает нигде или проигрывает там, где бездействие выигрывает):
      // результат подбора ничего не говорит о сложности, оставляем исходные числа.
      var triedList = Object.keys(tried).map(function (k) { return tried[k]; });
      if (!triedList.some(function (t) { return t.goodWon; }) || triedList.some(function (t) { return t.idleWon && !t.goodWon; })) {
        return { skipped: true, reason: "bot", factor: 1, lives: baseLives, timeLimitSec: baseTime, goodMs: 0, carelessWins: 0, carelessMs: 0, randomWon: false, tried: triedList.length, ms: Date.now() - started };
      }
      // Выборка из 16 раундов шумит на ±2 победы, а окно 6-10: точку цели берём по кривой через
      // испробованные ступени (линейно между соседями по разные стороны цели) и проверяем 32 раундами.
      var target = calm ? 0.75 : 0.5;
      var pts = triedList.filter(function (t) { return t.lives === lives0 && t.timeLimitSec === timeLimit0 && t.goodWon && !t.stallBound; }).sort(function (a, b) { return a.factor - b.factor; });
      for (var pi = 0; !chosen && pi + 1 < pts.length; pi++) {
        var lo = pts[pi], hi = pts[pi + 1];
        var wl = lo.carelessWins / 16, wh = hi.carelessWins / 16;
        if (wl >= target && wh <= target && wl !== wh && Date.now() - started < BUDGET_MS) {
          var fi = Math.round((lo.factor + ((wl - target) / (wl - wh)) * (hi.factor - lo.factor)) * 100) / 100;
          cfg.speed = base * fi;
          speedFactor = fi;
          var lim2 = timeLimit0 ? timeLimit0 * 1000 + 2000 : limit;
          var big = [];
          for (var bi = 0; bi < 32; bi++) big.push(simRound(0.5, lim2));
          var g2 = simRound(1, lim2);
          if (g2 && big.every(Boolean)) {
            var bw = big.filter(function (g) { return g.won; }).length;
            chosen = { factor: fi, lives: lives0, timeLimitSec: timeLimit0, goodWon: g2.won, goodMs: Math.round(g2.ms), carelessWins: Math.round(bw / 2), carelessMs: Math.round(big.reduce(function (s, g) { return s + g.ms; }, 0) / big.length), randomWon: lo.randomWon && hi.randomWon, tooHard: !g2.won || bw < (calm ? 18 : 10), tooEasy: (lo.randomWon && hi.randomWon) || (!calm && bw > 22), interpolated: true };
          }
          break;
        }
      }
      if (!chosen && inWindow) chosen = inWindow;
      if (!chosen) {
        // Точно в цель не попали. Если есть не слишком сложные варианты — самый сложный из них;
        // если всё слишком сложно — самый лёгкий, где хороший игрок ещё выигрывает.
        var list = Object.keys(tried).map(function (k) { return tried[k]; }).filter(function (t) { return t.goodWon; });
        var easier = list.filter(function (t) { return !t.tooHard; });
        if (easier.length) easier.sort(function (a, b) { return b.factor - a.factor || a.lives - b.lives; });
        else list.sort(function (a, b) { return a.factor - b.factor || b.lives - a.lives; });
        chosen = (easier.length ? easier : list)[0] || null;
      }
      // Подбор не справился: упёрлись в край и баланс всё ещё не в цели, наугад выигрывает или цель набирается в разминке.
      // Потолок игры: на верхних испробованных ступенях доля побед небрежного не падает — скорость упёрлась в константы кода.
      var easySteps = triedList.filter(function (t) { return t.tooEasy && t.lives === (chosen && chosen.lives); }).sort(function (a, b) { return b.factor - a.factor; });
      var ceiling = easySteps.length >= 2 && easySteps[0].carelessWins >= easySteps[1].carelessWins - 1;
      var failedTune = !!chosen && (chosen.tooEasy || chosen.tooHard || chosen.randomWon || chosen.warmupLeak || chosen.stallBound);
      // При зацикливании множитель не подбирается: оставляем исходные числа и отмечаем провал.
      if (chosen && chosen.stallBound) chosen = { factor: 1, lives: baseLives, timeLimitSec: baseTime, goodMs: chosen.goodMs, carelessWins: chosen.carelessWins, carelessMs: chosen.carelessMs, randomWon: chosen.randomWon, stallBound: true };
      return chosen ? { failed: failedTune, warmupLeak: !!chosen.warmupLeak, stall: !!chosen.stallBound, ceiling: failedTune && ceiling, factor: chosen.factor, lives: chosen.lives, timeLimitSec: chosen.timeLimitSec, goodMs: chosen.goodMs, carelessWins: chosen.carelessWins, carelessMs: chosen.carelessMs, randomWon: chosen.randomWon, tried: Object.keys(tried).length, ms: Date.now() - started } : null;
    } catch (e) {
      reportError(e, "tune");
      return null;
    } finally {
      sim = false;
      cfg.speed = tunedSpeed;
      speedFactor = baseFactor;
      if (cfg.balance) {
        cfg.balance.lives = baseLives;
        cfg.balance.timeLimitSec = baseTime;
      }
      state = "start";
      score = 0;
      goal = null;
      playStartedAt = null;
      game.loop.wake();
      var live = gameScene();
      if (live) {
        live.scene.restart();
        live.scene.pause();
      }
    }
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
      var now = clock();
      if (!f || now - (sfxLast[name] || 0) < (name === "shoot" ? 300 : 50)) return;
      sfxLast[name] = now;
      f();
    },
    fx: fx,
    hitbox: hitbox,
    /** Ввод для метода bot(skill): касание, нажатие, перемещение с зажатым пальцем, отпускание (координаты игры). */
    botTap: function (x, y) { botCommand("tap", x, y); },
    botDown: function (x, y) { botCommand("down", x, y); },
    botMove: function (x, y) { botCommand("move", x, y); },
    botUp: function (x, y) { botCommand("up", x, y); },
    /** Идёт автоподбор сложности (время виртуальное, экрана не видно). */
    get simulating() { return sim; },
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
      var now = clock();
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
      if (!sim) vibrate(80);
      if (lives === 0) {
        finish(false, "Жизни закончились");
        return "dead";
      }
      return "hit";
    },
    /** Идёт разминка: ошибки не считаются, опасности не появляются. */
    inWarmup: function () { return state === "playing" && roundMs() * speedFactor < ((cfg.balance && cfg.balance.warmupSec) || 8) * 1000; },
    /** Прогресс цели для HUD и финальной карточки: GG.setGoal(12, 24, 'Фрукты'). */
    setGoal: function (done, total, label) {
      var d = Math.max(0, done | 0);
      if (!goal || d !== goal.done) goalMovedAt = roundMs();
      goal = { done: d, total: Math.max(1, total | 0), label: label ? String(label).slice(0, 24) : "" };
    },
    /** Был ли рядом недавний GG.fx.hit: тап по только что сбитому объекту не считается промахом. */
    recentlyHit: function (x, y, r, ms) {
      var now = clock();
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

  // Модель часто удаляет объекты прямо в group.getChildren().forEach(...): живой массив сдвигается
  // при каждом destroy, и каждый второй объект пропускается (враги «переживали» появление босса).
  if (window.Phaser && window.Phaser.GameObjects && window.Phaser.GameObjects.Group) {
    window.Phaser.GameObjects.Group.prototype.getChildren = function () { return this.children.entries.slice(); };
  }

  // Загрузчик отдельно от API: код игры получает API как `var GG = __GG.init(cfg)`.
  window.__GG = {
    init: function (config) {
      cfg = config || {};
      speedFactor = cfg.speedFactor || 1;
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
            if (wantTune) {
              // После снимка: подбор останавливает цикл игры на несколько секунд.
              setTimeout(function () {
                if (state !== "start") return;
                var btn = overlay.querySelector(".gg-btn");
                if (btn) { btn.disabled = true; btn.textContent = "Подбираю сложность…"; }
                setTimeout(function () {
                  var report = tuneDifficulty();
                  post({ type: "tune", report: report });
                  if (btn) { btn.disabled = false; btn.textContent = "Играть"; }
                }, 30);
              }, 1500);
            }
          }
        });
      });
    },
  };
})();
