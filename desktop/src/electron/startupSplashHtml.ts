export type StartupSplashScheme = "default" | "dark-orange";

const WORDMARK = "Dyno";

/**
 * The logo is drawn inline (same geometry as src/ui/assets/icons/dyno-icon.svg)
 * so its blades can fan out on their own. Each blade pivots on the hub at (30, 72).
 */
function logoSvg() {
  const blades = [
    { cls: "blade b3", angle: 66, delay: 280, fill: '#ffffff" fill-opacity="0.3' },
    { cls: "blade b2", angle: 44, delay: 140, fill: '#ffffff" fill-opacity="0.5' },
    { cls: "blade b1", angle: 22, delay: 0, fill: "#7fe3d4" },
  ]
    .map(
      ({ cls, angle, delay, fill }) =>
        `<rect class="${cls}" style="--angle: ${angle}deg; --delay: ${delay}ms" x="23" y="16" width="14" height="62" rx="7" fill="${fill}" />`
    )
    .join("\n          ");

  return `<svg class="logo" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="tile" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stop-color="#34b6a3" />
            <stop offset="0.5" stop-color="#1f8075" />
            <stop offset="1" stop-color="#0f4a43" />
          </linearGradient>
          <linearGradient id="front" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stop-color="#ffffff" />
            <stop offset="1" stop-color="#d4f3ee" />
          </linearGradient>
        </defs>
        <rect class="tile" x="4" y="4" width="92" height="92" rx="22" fill="url(#tile)" />
        <g class="fan">
          ${blades}
          <rect class="front" x="23" y="16" width="14" height="62" rx="7" fill="url(#front)" />
          <circle cx="30" cy="25" r="3" fill="#1f8075" />
          <circle cx="30" cy="72" r="5" fill="#0f4a43" />
        </g>
      </svg>`;
}

function wordmarkHtml() {
  const letters = [...WORDMARK]
    .map((letter, index) => `<span class="letter" style="--i: ${index}">${letter}</span>`)
    .join("");
  return `<h1 class="wordmark" aria-label="${WORDMARK}"><span class="word" aria-hidden="true">${letters}</span><span class="caret" aria-hidden="true"></span></h1>`;
}

/**
 * The splash stays up until the main window is ready to show, so every motion loops.
 * One cycle: the blades fan out and the name types in, both hold, then fold away and start over.
 * It uses CSS only: the window's content security policy allows no script.
 */
export function buildStartupSplashHtml(scheme: StartupSplashScheme = "default") {
  return `<!doctype html>
<html lang="en"${scheme === "dark-orange" ? ' data-theme="dark-orange"' : ""}>
  <head>
    <meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; style-src 'unsafe-inline'" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Dyno</title>
    <style>
      /* Mirrors canvas, fg-strong, fg, line and accent-text in src/ui/styles/theme.css. */
      :root {
        color-scheme: dark light;
        font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        --canvas: #14171c;
        --fg-strong: #f3f5f8;
        --fg: #d3d8df;
        --line: #2e3540;
        --accent-text: #3fbfae;
        --shadow: rgba(0, 0, 0, 0.32);
        --cycle: 4.2s;
        --spring: cubic-bezier(0.34, 1.56, 0.64, 1);
        --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
        --ease-in: cubic-bezier(0.55, 0, 0.75, 0.2);
        background: var(--canvas);
        color: var(--fg-strong);
      }

      @media (prefers-color-scheme: light) {
        :root {
          --canvas: #f6f7f9;
          --fg-strong: #0f1216;
          --fg: #2a303a;
          --line: #d6dae1;
          --accent-text: #1a6e64;
          --shadow: rgba(15, 18, 22, 0.14);
        }
      }

      /* Dark Orange. Mirrors the [data-theme="dark-orange"] values in theme.css. */
      :root[data-theme="dark-orange"] {
        --canvas: #1f1e1d;
        --fg-strong: #faf9f5;
        --fg: #c2c0b6;
        --line: #3e3d39;
        --accent-text: #d97757;
        --shadow: rgba(0, 0, 0, 0.32);
      }

      * {
        box-sizing: border-box;
      }

      body {
        align-items: center;
        background:
          radial-gradient(ellipse at 30% 20%, color-mix(in srgb, var(--accent-text) 18%, transparent), transparent 60%),
          var(--canvas);
        display: flex;
        height: 100vh;
        justify-content: center;
        margin: 0;
        overflow: hidden;
        user-select: none;
      }

      .shell {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 30px;
        padding: 28px;
        width: 100%;
      }

      .brand {
        align-items: center;
        display: flex;
        height: 84px;
        justify-content: center;
      }

      /* Logo: the tile pops in once, then the blades fan out and fold back each cycle. */
      .logo {
        animation: float 2.8s ease-in-out infinite;
        filter: drop-shadow(0 12px 18px var(--shadow));
        flex: none;
        height: 84px;
        overflow: visible;
        width: 84px;
      }

      .tile {
        animation: pop 0.7s var(--spring) both;
        transform-origin: 50px 50px;
      }

      .fan {
        animation: fade-in 0.3s 0.25s both;
      }

      .blade {
        animation: fan var(--cycle) var(--delay) infinite both;
        transform-origin: 30px 72px;
      }

      /* Wordmark: letters type in one by one behind a caret, and the logo slides aside to make room. */
      .wordmark {
        align-items: center;
        display: flex;
        font-size: 46px;
        font-weight: 700;
        letter-spacing: -0.02em;
        line-height: 1;
        margin: 0;
      }

      .word {
        animation: word var(--cycle) infinite both;
        display: inline-flex;
        padding-left: 16px;
      }

      .letter {
        animation: type var(--cycle) calc(var(--i) * 160ms) infinite both;
        display: inline-block;
        overflow: hidden;
        white-space: pre;
      }

      .caret {
        animation: blink 0.9s step-end infinite;
        background: var(--accent-text);
        border-radius: 2px;
        height: 40px;
        margin-left: 4px;
        width: 3px;
      }

      /* Loading state: plain text plus a bar that never stops sliding. */
      .status {
        align-items: center;
        display: flex;
        flex-direction: column;
        gap: 12px;
      }

      .status p {
        color: var(--fg);
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
      }

      .dot {
        animation: dot 1.4s infinite both;
        animation-delay: calc(var(--i) * 0.2s);
      }

      .bar {
        background: var(--line);
        border-radius: 999px;
        height: 3px;
        overflow: hidden;
        width: 168px;
      }

      .bar::after {
        animation: slide 1.5s ease-in-out infinite;
        background: var(--accent-text);
        border-radius: inherit;
        content: "";
        display: block;
        height: 100%;
        width: 40%;
      }

      @keyframes pop {
        from {
          opacity: 0;
          transform: scale(0.4) rotate(-25deg);
        }
        to {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes fade-in {
        from {
          opacity: 0;
        }
      }

      @keyframes float {
        50% {
          transform: translateY(-3px);
        }
      }

      @keyframes fan {
        0%,
        6% {
          animation-timing-function: var(--spring);
          opacity: 0;
          transform: rotate(0deg);
        }
        22%,
        72% {
          animation-timing-function: var(--ease-in);
          opacity: 1;
          transform: rotate(var(--angle));
        }
        86%,
        100% {
          opacity: 0;
          transform: rotate(0deg);
        }
      }

      /* The last letter starts 480ms late, so it must be gone by 88% to finish before the next cycle. */
      @keyframes type {
        0%,
        8% {
          animation-timing-function: var(--ease-out);
          max-width: 0;
          opacity: 0;
          transform: translateY(12px);
        }
        18%,
        82% {
          animation-timing-function: ease-in-out;
          max-width: 1em;
          opacity: 1;
          transform: none;
        }
        88%,
        100% {
          max-width: 0;
          opacity: 0;
          transform: none;
        }
      }

      @keyframes word {
        0%,
        76% {
          opacity: 1;
        }
        82%,
        100% {
          opacity: 0;
        }
      }

      @keyframes blink {
        50% {
          opacity: 0;
        }
      }

      @keyframes dot {
        0%,
        20% {
          opacity: 0.2;
        }
        50% {
          opacity: 1;
        }
        80%,
        100% {
          opacity: 0.2;
        }
      }

      @keyframes slide {
        from {
          transform: translateX(-100%);
        }
        to {
          transform: translateX(250%);
        }
      }

      /* Reduced motion: show the finished logo and name, keep only the loading bar moving. */
      @media (prefers-reduced-motion: reduce) {
        .logo,
        .tile,
        .fan,
        .blade,
        .word,
        .letter,
        .caret,
        .dot {
          animation: none;
        }

        .blade {
          transform: rotate(var(--angle));
        }

        .caret {
          display: none;
        }

        .bar::after {
          animation-duration: 3s;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell" role="status" aria-live="polite">
      <div class="brand">
      ${logoSvg()}
      ${wordmarkHtml()}
      </div>
      <div class="status">
        <p>Starting local services<span class="dot" style="--i: 0">.</span><span class="dot" style="--i: 1">.</span><span class="dot" style="--i: 2">.</span></p>
        <div class="bar" aria-hidden="true"></div>
      </div>
    </main>
  </body>
</html>`;
}
