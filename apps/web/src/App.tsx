import { GameControllerIcon as GameController } from "@phosphor-icons/react";
import { GameView } from "./GameView";
import { Home } from "./Home";
import { Stats } from "./Stats";
import { Link, usePath } from "./router";

export function App() {
  const path = usePath();
  const gameMatch = path.match(/^\/games\/([a-f0-9]{10})$/);
  const section = path === "/stats" ? "stats" : "games";
  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <Link to="/" className="wordmark">
            <span className="wordmark-mark" aria-hidden>
              <GameController size={18} weight="fill" />
            </span>
            Игротворец
          </Link>
          <nav className="nav" aria-label="Разделы">
            <Link to="/" aria-current={section === "games" ? "page" : undefined}>
              Игры
            </Link>
            <Link to="/stats" aria-current={section === "stats" ? "page" : undefined}>
              Аналитика
            </Link>
          </nav>
        </div>
      </header>
      {gameMatch ? <GameView key={gameMatch[1]} id={gameMatch[1]!} /> : path === "/stats" ? <Stats /> : <Home />}
    </>
  );
}
