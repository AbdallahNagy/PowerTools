export type StartupSplashScheme = "default" | "dark-orange";

/*
 * The wordmark follows the Dyno logo animation: a ring draws itself, the green arc lands at the
 * upper right, the ring spins once, then it settles in as the "o" of "dyno" while d, y and n fade in.
 *
 * The letters are outlines of Nunito Black (SIL Open Font License 1.1), so the splash needs no font
 * file. Units are the font's: 1000 per em, baseline at y = 0, y pointing down.
 * The ring is measured from the promo: center (1970, -237), mid radius 180, stroke 161.
 */
const LETTERS = [
  {
    letter: "d",
    path: "M244 11Q181 11 132 -20Q84 -51 56 -109Q29 -167 29 -246Q29 -327 56 -384Q84 -441 132 -472Q181 -503 244 -503Q299 -503 343 -477Q374 -458 391 -432V-624Q391 -668 414 -691Q437 -714 480 -714Q522 -714 546 -691Q569 -668 569 -624V-81Q569 -37 546 -14Q524 9 481 9Q439 9 416 -14Q397 -33 394 -65Q378 -36 346 -17Q301 11 244 11ZM301 -120Q328 -120 349 -134Q370 -147 382 -174Q393 -202 393 -246Q393 -313 367 -342Q341 -372 301 -372Q274 -372 253 -359Q232 -346 220 -318Q208 -291 208 -246Q208 -180 234 -150Q260 -120 301 -120Z",
  },
  {
    letter: "y",
    path: "M773 189Q742 189 723 173Q704 157 700 131Q695 105 708 76L759 -34L604 -388Q591 -418 596 -444Q600 -470 622 -486Q644 -501 682 -501Q714 -501 734 -486Q753 -472 769 -430L852 -213L941 -431Q957 -472 978 -486Q998 -501 1033 -501Q1063 -501 1081 -486Q1099 -470 1103 -444Q1107 -418 1094 -388L867 122Q849 162 828 176Q806 189 773 189Z",
  },
  {
    letter: "n",
    path: "M1219 9Q1177 9 1154 -14Q1131 -37 1131 -81V-412Q1131 -455 1154 -478Q1176 -501 1218 -501Q1260 -501 1282 -478Q1301 -458 1304 -424Q1326 -458 1362 -478Q1406 -503 1463 -503Q1522 -503 1560 -480Q1598 -458 1617 -410Q1636 -363 1636 -291V-81Q1636 -37 1613 -14Q1590 9 1547 9Q1504 9 1481 -14Q1458 -37 1458 -81V-284Q1458 -329 1442 -348Q1427 -367 1397 -367Q1357 -367 1333 -342Q1309 -316 1309 -273V-81Q1309 9 1219 9Z",
  },
];

/* Arcs in degrees clockwise from 12 o'clock, measured on the stroke's center line. */
const RING_ARC = { from: 118, to: 332 };
const ACCENT_ARC = { from: 22, to: 68 };

/* An SVG circle starts at 3 o'clock, so rotate by (start - 90) to begin the dash at `from`. */
function arc(cls: string, { from, to }: { from: number; to: number }) {
  return `<circle class="${cls}" style="--len: ${to - from}" cx="1970" cy="-237" r="180" pathLength="360" transform="rotate(${from - 90} 1970 -237)" />`;
}

function wordmarkSvg() {
  const letters = LETTERS.map(
    ({ letter, path }, index) => `<path class="letter l${index}" data-letter="${letter}" d="${path}" />`
  ).join("\n          ");

  return `<svg class="wordmark" viewBox="0 -730 2260 930" role="img" aria-label="dyno">
        <g class="letters">
          ${letters}
        </g>
        <g class="ring-move">
          <g class="ring-spin">
            ${arc("ring", RING_ARC)}
            ${arc("accent", ACCENT_ARC)}
          </g>
        </g>
      </svg>`;
}

/**
 * The splash stays up until the main window is ready to show, so the animation loops.
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
      /* Brand colors from the Dyno logo; canvas, fg and line mirror src/ui/styles/theme.css. */
      :root {
        color-scheme: dark light;
        font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        --canvas: #0f1013;
        --mark: #f3f4ec;
        --accent: #c6f232;
        --fg: #8b8f98;
        --line: #26282e;
        --cycle: 5.6s;
        --ease: cubic-bezier(0.65, 0, 0.35, 1);
        --ease-out: cubic-bezier(0.22, 1, 0.36, 1);
        background: var(--canvas);
      }

      @media (prefers-color-scheme: light) {
        :root {
          --canvas: #f6f7f9;
          --mark: #111214;
          --accent: #6f9a00;
          --fg: #5b616b;
          --line: #d6dae1;
        }
      }

      /* Dark Orange keeps the brand mark and takes the theme's warm canvas. */
      :root[data-theme="dark-orange"] {
        --canvas: #1f1e1d;
        --mark: #faf9f5;
        --accent: #c6f232;
        --fg: #9c9a92;
        --line: #3e3d39;
      }

      body {
        align-items: center;
        background: var(--canvas);
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
        width: 100%;
      }

      .scene {
        align-items: center;
        animation: scene var(--cycle) infinite both;
        display: flex;
        flex-direction: column;
        gap: 14px;
      }

      .wordmark {
        height: 103px;
        overflow: visible;
        width: 250px;
      }

      .letter {
        fill: var(--mark);
      }

      .l0 {
        animation: letter-0 var(--cycle) var(--ease-out) infinite both;
      }

      .l1 {
        animation: letter-1 var(--cycle) var(--ease-out) infinite both;
      }

      .l2 {
        animation: letter-2 var(--cycle) var(--ease-out) infinite both;
      }

      .ring,
      .accent {
        fill: none;
        stroke-linecap: round;
        stroke-width: 161;
      }

      .ring {
        animation: draw-ring var(--cycle) infinite both;
        stroke: var(--mark);
      }

      .accent {
        animation: draw-accent var(--cycle) infinite both;
        stroke: var(--accent);
      }

      /* Transforms on SVG elements use the viewBox's units. */
      .ring-move {
        animation: ring-move var(--cycle) infinite both;
        transform-origin: 1970px -237px;
      }

      .ring-spin {
        animation: ring-spin var(--cycle) infinite both;
        transform-origin: 1970px -237px;
      }

      .tagline {
        animation: tagline var(--cycle) infinite both;
        color: var(--fg);
        font-size: 12px;
        font-weight: 600;
        letter-spacing: 0.01em;
        margin: 0;
      }

      .status {
        align-items: center;
        bottom: 26px;
        display: flex;
        flex-direction: column;
        gap: 10px;
        left: 0;
        position: absolute;
        right: 0;
      }

      .status p {
        color: var(--fg);
        font-size: 12px;
        margin: 0;
      }

      .bar {
        background: var(--line);
        border-radius: 999px;
        height: 3px;
        overflow: hidden;
        width: 140px;
      }

      .bar::after {
        animation: slide 1.5s ease-in-out infinite;
        background: var(--accent);
        border-radius: inherit;
        content: "";
        display: block;
        height: 100%;
        width: 40%;
      }

      /* One cycle: 0-16% the ring draws, 16-22% the green arc lands, 22-40% one spin,
         40-52% the ring settles as the "o" and the letters fade in, 58% the tagline, 88-96% fade out. */
      @keyframes scene {
        0%,
        88% {
          opacity: 1;
        }
        96%,
        100% {
          opacity: 0;
        }
      }

      /* The big intro ring is thinner, like the app icon, and thickens as it becomes the "o". */
      @keyframes draw-ring {
        0%,
        3% {
          animation-timing-function: var(--ease);
          opacity: 0;
          stroke-dasharray: 0 360;
          stroke-width: 100;
        }
        4% {
          opacity: 1;
        }
        16%,
        40% {
          animation-timing-function: var(--ease);
          opacity: 1;
          stroke-dasharray: var(--len) 360;
          stroke-width: 100;
        }
        52%,
        100% {
          opacity: 1;
          stroke-dasharray: var(--len) 360;
          stroke-width: 161;
        }
      }

      @keyframes draw-accent {
        0%,
        16% {
          animation-timing-function: var(--ease-out);
          opacity: 0;
          stroke-dasharray: 0 360;
          stroke-width: 100;
        }
        22%,
        40% {
          animation-timing-function: var(--ease);
          opacity: 1;
          stroke-dasharray: var(--len) 360;
          stroke-width: 100;
        }
        52%,
        100% {
          opacity: 1;
          stroke-dasharray: var(--len) 360;
          stroke-width: 161;
        }
      }

      @keyframes ring-spin {
        0%,
        3% {
          animation-timing-function: var(--ease);
          transform: rotate(-150deg);
        }
        16%,
        22% {
          animation-timing-function: var(--ease);
          transform: rotate(0deg);
        }
        40%,
        100% {
          transform: rotate(360deg);
        }
      }

      @keyframes ring-move {
        0%,
        40% {
          animation-timing-function: var(--ease);
          transform: translate(-840px, -23px) scale(1.6);
        }
        52%,
        100% {
          transform: none;
        }
      }

      @keyframes letter-0 {
        0%,
        42% {
          opacity: 0;
          transform: translateX(-60px);
        }
        52%,
        100% {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes letter-1 {
        0%,
        45% {
          opacity: 0;
          transform: translateX(-60px);
        }
        55%,
        100% {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes letter-2 {
        0%,
        48% {
          opacity: 0;
          transform: translateX(-60px);
        }
        58%,
        100% {
          opacity: 1;
          transform: none;
        }
      }

      @keyframes tagline {
        0%,
        56% {
          opacity: 0;
          transform: translateY(6px);
        }
        64%,
        100% {
          opacity: 1;
          transform: none;
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

      /* Reduced motion: show the finished logo and keep only the loading bar moving. */
      @media (prefers-reduced-motion: reduce) {
        .scene,
        .letter,
        .ring,
        .accent,
        .ring-move,
        .ring-spin,
        .tagline {
          animation: none;
        }

        .ring,
        .accent {
          stroke-dasharray: var(--len) 360;
        }

        .bar::after {
          animation-duration: 3s;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell" role="status" aria-live="polite">
      <div class="scene">
        ${wordmarkSvg()}
        <p class="tagline">Dynamics toolbox + MCP server</p>
      </div>
      <div class="status">
        <p>Starting local services</p>
        <div class="bar" aria-hidden="true"></div>
      </div>
    </main>
  </body>
</html>`;
}
