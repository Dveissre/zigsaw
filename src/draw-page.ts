import "./styles.css";
import { CrisStore } from "./game/cris";
import { crisBalanceMarkup } from "./ui/cris";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

const cris = new CrisStore();

root.innerHTML = `
  <div class="app-shell page-draw">
    ${crisBalanceMarkup(cris.load(), false)}
    <a class="atlas-home" href="../" aria-label="返回主页">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M3.5 11 12 3.8l8.5 7.2"></path>
        <path d="M6.4 9.4v10.7h11.2V9.4"></path>
        <path d="M9.8 20.1v-6.2h4.4v6.2"></path>
      </svg>
    </a>
    <header class="masthead">
      <h1 class="wordmark">ZI<span>GSAW</span></h1>
    </header>
    <main class="draw-page-screen">
      <section class="draw-page-surface">
        <header class="draw-page-heading">
          <div class="tutorial-kicker">CARD DRAW</div>
          <h1>卡片抽选</h1>
        </header>
        <div class="draw-construction">施工中</div>
      </section>
    </main>
  </div>
`;
