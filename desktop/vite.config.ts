import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { contentSecurityPolicyPlugin } from './contentSecurityPolicy'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), contentSecurityPolicyPlugin()],
  base: './',
  build: {
    outDir : 'dist-react'
  },
  server: {
    port: 5123,
    strictPort: true
  }
})
