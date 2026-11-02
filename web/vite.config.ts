import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // The API lives on the same origin in production (Firebase Hosting rewrites
  // /api to Cloud Run); in development, the local server stands in for it.
  server: {
    proxy: { '/api': `http://localhost:${process.env.KUBI_API_PORT ?? 8080}` },
  },
})
