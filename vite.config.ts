import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { fileURLToPath, URL } from 'node:url'

// https://vite.dev/config/
// Vitest config lives here too, so the @core/@react aliases below can never
// drift apart between the app and the test suite.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@core': fileURLToPath(new URL('./src/core', import.meta.url)),
      '@react': fileURLToPath(new URL('./src/react', import.meta.url)),
    },
  },
  test: {
    // Deliberately node, not jsdom: jsdom implements no 2D canvas context, so
    // it would buy nothing here. Renderers are tested with a fake ctx instead.
    // See docs/adr/0001-node-environment-for-core-tests.md.
    environment: 'node',
  },
})
