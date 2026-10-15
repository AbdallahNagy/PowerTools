import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { sentryVitePlugin } from '@sentry/vite-plugin'
import { contentSecurityPolicyPlugin } from './contentSecurityPolicy'

const { version } = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf-8'))

// Release builds set SENTRY_AUTH_TOKEN. The renderer source maps are then
// uploaded to Sentry and deleted, so crash reports show readable frames and
// no .map files ship in the installer. Local builds skip all of this.
const uploadSourceMaps = Boolean(process.env.SENTRY_AUTH_TOKEN)

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    contentSecurityPolicyPlugin(),
    uploadSourceMaps &&
      sentryVitePlugin({
        org: 'powertools',
        project: 'powertools-desktop',
        authToken: process.env.SENTRY_AUTH_TOKEN,
        // Must match the release set in src/electron/sentry.ts.
        release: { name: `power-tools@${version}` },
        sourcemaps: { filesToDeleteAfterUpload: ['./dist-react/**/*.map'] },
        telemetry: false,
      }),
  ],
  base: './',
  build: {
    outDir : 'dist-react',
    sourcemap: uploadSourceMaps ? 'hidden' : false,
  },
  server: {
    port: 5123,
    strictPort: true
  }
})
