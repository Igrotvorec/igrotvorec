/**
 * Проверка рантайма Phaser без LLM: ручная сцена собирается, публикуется и прогоняется в Chrome.
 * Генерация игр на Phaser идёт через основной пайплайн (tools/bench.ts, интерфейс).
 *
 *   DATA_DIR=./data-demo bun --env-file=.env tools/phaser-spike.ts
 */
import { assemblePhaserGame } from "../packages/runtime/src/index";
import { addVersion, createGame } from "../apps/server/src/db";
import { tryGame } from "./try-game";

const BASE = process.env.BASE ?? "http://localhost:8787";
const OUT = "data/shots/phaser";
await Bun.$`mkdir -p ${OUT}`;

const SMOKE = `class GameScene extends Phaser.Scene {
  create() {
    this.add.rectangle(360, 640, 720, 1280, 0x1d3557);
    this.player = this.physics.add.image(360, 1100, 'hero').setDisplaySize(150, 150);
    this.stars = this.physics.add.group();
    this.time.addEvent({ delay: 500, loop: true, callback: () => {
      const s = this.stars.create(Phaser.Math.Between(60, 660), -40, 'star');
      s.setDisplaySize(90, 90);
      s.setVelocityY(380 * GG.speed);
      this.tweens.add({ targets: s, angle: 360, duration: 1500, repeat: -1 });
    } });
    this.scoreText = this.add.text(30, 30, 'Счёт: 0', { fontFamily: GG.font, fontSize: '52px', fontStyle: 'bold', color: '#fff', stroke: '#000', strokeThickness: 8 }).setDepth(10);
    this.physics.add.overlap(this.player, this.stars, (p, s) => {
      this.add.particles(s.x, s.y, 'spark', { speed: { min: 120, max: 400 }, scale: { start: 0.8, end: 0 }, lifespan: 500, tint: 0xffd34d, blendMode: 'ADD', emitting: false }).explode(16);
      s.destroy();
      GG.addScore(1);
      GG.sfx('coin');
      this.cameras.main.shake(80, 0.004);
      this.scoreText.setText('Счёт: ' + GG.score);
      if (GG.score >= 10) GG.win('Собрано 10 звёзд!');
    });
    this.input.on('pointermove', (p) => { this.player.x = Phaser.Math.Clamp(p.x, 75, 645); });
  }
  update() {}
}
GG.run(GameScene);`;

async function smoke() {
  const html = assemblePhaserGame(
    { title: "Проверка Phaser", instructions: "Лови звёзды корзинкой", palette: { background: "#1d3557", primary: "#ffd34d", accent: "#e63946", text: "#ffffff" }, uiScale: 1, speed: 1, sprites: { hero: { fallback: "🧺" }, star: { fallback: "⭐" } }, background: null, music: "happy" },
    SMOKE,
  );
  const gameId = createGame("[phaser smoke]", false);
  await addVersion({ gameId, baseVersionId: null, kind: "create", spec: { engine: "phaser", title: "Проверка Phaser", audience: "general", genre: "arcade", concept: "-", coreMechanic: "-", controls: "-", howToPlay: "-", winCondition: "-", loseCondition: "-", mustHave: [], palette: { background: "#1d3557", primary: "#ffd34d", accent: "#e63946", text: "#ffffff" }, difficulty: "normal", roundSeconds: 60, language: "ru", sprites: [] }, code: SMOKE, assets: {}, html, instruction: "[phaser smoke]", model: "handcrafted+phaser", genMs: 0 });
  console.log(`smoke ${gameId}`, JSON.stringify(await tryGame(gameId, OUT, BASE)));
}

await smoke();
