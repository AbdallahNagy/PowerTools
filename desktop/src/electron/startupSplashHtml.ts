export function buildStartupSplashHtml() {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <style>
      :root {
        color-scheme: dark;
        font-family: "Segoe UI", system-ui, -apple-system, BlinkMacSystemFont, sans-serif;
        background: #1e1e1e;
        color: #ffffff;
      }

      * {
        box-sizing: border-box;
      }

      body {
        align-items: center;
        background:
          linear-gradient(135deg, rgba(0, 122, 204, 0.16), transparent 42%),
          #1e1e1e;
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
        align-items: center;
        background: #007acc;
        border-radius: 8px;
        box-shadow: 0 18px 36px rgba(0, 0, 0, 0.28);
        display: flex;
        font-size: 24px;
        font-weight: 700;
        height: 64px;
        justify-content: center;
        letter-spacing: 0;
        width: 64px;
      }

      h1 {
        font-size: 21px;
        font-weight: 600;
        line-height: 1.25;
        margin: 0;
      }

      p {
        color: #cccccc;
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
        border: 2px solid rgba(255, 255, 255, 0.22);
        border-top-color: #4fc1ff;
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
      <div class="mark">PT</div>
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
