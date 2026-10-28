import "./styles.css";

const root = document.querySelector<HTMLDivElement>("#app");

if (!root) {
  throw new Error("Missing #app root element.");
}

root.innerHTML = `
  <div class="app-shell page-atlas">
    <header class="masthead">
      <h1 class="wordmark">ZI<span>GSAW</span></h1>
    </header>
    <main class="atlas-page-screen">
      <section class="atlas-page-surface">
        <header class="atlas-page-heading">
          <div>
            <div class="tutorial-kicker">COMPONENT INDEX</div>
            <h1 id="atlas-title">图鉴</h1>
          </div>
          <a class="atlas-back" href="../">返回</a>
        </header>
        <div class="atlas-page-placeholder">施工中</div>
      </section>
    </main>
  </div>
`;
