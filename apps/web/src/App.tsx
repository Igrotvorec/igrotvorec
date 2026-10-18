import { GameView } from "./GameView";
import { Home } from "./Home";
import { Stats } from "./Stats";
import { navigate, usePath } from "./router";

export function App() {
  const path = usePath();
  const gameMatch = path.match(/^\/games\/([a-f0-9]{10})$/);
  return (
    <>
      <header className="topbar">
        <a
          href="/"
          className="logo"
          onClick={(e) => {
            e.preventDefault();
            navigate("/");
          }}
        >
          <span className="logo-mark" />
          Игротворец
        </a>
        <nav>
          <a
            href="/stats"
            className={path === "/stats" ? "active" : ""}
            onClick={(e) => {
              e.preventDefault();
              navigate("/stats");
            }}
          >
            Статистика
          </a>
        </nav>
      </header>
      {gameMatch ? <GameView id={gameMatch[1]!} /> : path === "/stats" ? <Stats /> : <Home />}
    </>
  );
}
