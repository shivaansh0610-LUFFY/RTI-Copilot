import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
    restoreMocks: true,
    // Tests run on the built-in mock data whatever the developer's own .env says, so a
    // VITE_API_URL set for local runs never makes them call a real backend.
    env: { VITE_API_URL: '' },
  },
})
