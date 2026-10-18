import { GameView } from "./GameView";
import { Home } from "./Home";
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
      </header>
      {gameMatch ? <GameView id={gameMatch[1]!} /> : <Home />}
    </>
  );
}
