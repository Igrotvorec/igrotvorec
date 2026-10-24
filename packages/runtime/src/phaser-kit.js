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
  var failed = false;
  var reported = {};
  var reportCount = 0;
  function reportError(err, where) {
    failed = true;
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
        if (!hasParent) return ok(null);
        var id = ++reqSeq;
        pending[id] = ok;
        post({ type: "storage:get", reqId: id, key: String(key).slice(0, 64) });
        setTimeout(function () { if (pending[id]) { delete pending[id]; ok(null); } }, 1500);
      });
    },
    set: function (key, value) {
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
    shoot: function () { tone(900, 0.09, "square", 0.06, 300); },
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
      card.appendChild(el("p", "gg-score", "Счёт: " + score));
      card.appendChild(el("p", "gg-sub", score >= best && score > 0 ? "Новый рекорд!" : "Рекорд: " + best));
    }
    var btn = el("button", "gg-btn", kind === "start" ? "Играть" : kind === "paused" ? "Продолжить" : "Ещё раз");
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
    if (failed) return;
    score = 0;
    activeMs = 0;
    hideOverlay();
    var sc = gameScene();
    if (sc) sc.scene.restart();
    setState("playing");
    startMusic();
  }
  function finish(won, message) {
    if (state !== "playing") return;
    best = Math.max(best, score);
    storage.set("best", String(best));
    setState(won ? "won" : "lost");
    stopMusic();
    (won ? SFX.win : SFX.lose)();
    vibrate(won ? [30, 40, 30] : 120);
    var sc = gameScene();
    // Даём кадру с последним эффектом дорисоваться, потом замораживаем сцену.
    setTimeout(function () { if (sc && state !== "playing") sc.scene.pause(); }, 350);
    showOverlay(won ? "won" : "lost", message);
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
  /** Каждый ключ спрайта существует как текстура: картинка ИИ или нарисованный emoji, если её нет. */
  function makeTextures(scene) {
    var tx = scene.textures;
    var sprites = cfg.sprites || {};
    for (var key in images) tx.addImage(key, images[key]);
    for (var k in sprites) {
      if (tx.exists(k)) continue;
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
    sfx: function (name) { var f = SFX[name]; if (f) f(); },
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
            game.events.off("postrender", onFrame);
            if (failed) return;
            gameScene().scene.pause();
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
