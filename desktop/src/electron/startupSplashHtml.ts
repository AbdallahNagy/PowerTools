export function buildStartupSplashHtml(iconDataUrl?: string) {
  const markHtml = iconDataUrl
    ? `<img class="mark" src="${iconDataUrl}" alt="" />`
    : `<div class="mark">PT</div>`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
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
        --shadow: rgba(0, 0, 0, 0.28);
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
          --shadow: rgba(15, 18, 22, 0.12);
        }
      }

      * {
        box-sizing: border-box;
      }

      body {
        align-items: center;
        background:
          linear-gradient(135deg, color-mix(in srgb, var(--accent-text) 16%, transparent), transparent 42%),
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
        gap: 18px;
        padding: 28px;
        text-align: center;
        width: 100%;
      }

      .mark {
        border-radius: 8px;
        box-shadow: 0 18px 36px var(--shadow);
        height: 64px;
        object-fit: cover;
        width: 64px;
      }

      h1 {
        font-size: 21px;
        font-weight: 600;
        line-height: 1.25;
        margin: 0;
      }

      p {
        color: var(--fg);
        font-size: 13px;
        line-height: 1.5;
        margin: 0;
      }

      .status {
        align-items: center;
        display: flex;
        gap: 10px;
        justify-content: center;
      }

      .spinner {
        animation: spin 0.9s linear infinite;
        border: 2px solid var(--line);
        border-top-color: var(--accent-text);
        border-radius: 999px;
        height: 18px;
        width: 18px;
      }

      @keyframes spin {
        to {
          transform: rotate(360deg);
        }
      }
    </style>
  </head>
  <body>
    <main class="shell" aria-live="polite">
      ${markHtml}
      <div>
        <h1>Power Tools</h1>
        <p>Starting local services...</p>
      </div>
      <div class="status">
        <div class="spinner" aria-hidden="true"></div>
        <p>Preparing your workspace</p>
      </div>
    </main>
  </body>
</html>`;
}
