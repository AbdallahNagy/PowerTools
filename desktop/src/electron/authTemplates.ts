export function renderAuthenticationErrorTemplate(): string {
  return `
      <html><body style="font-family:sans-serif;padding:40px;text-align:center;background:#14171c;color:#d3d8df">
        <h2 style="color:#f48771">&#10007; Authentication failed</h2>
        <p>Sign-in did not complete. Close this window and return to PowerTools for details.</p>
      </body></html>`;
}
