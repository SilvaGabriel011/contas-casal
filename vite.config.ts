import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// GitHub Pages serves the app from /contas-casal/; Vercel and local dev use /.
export default defineConfig({
  base: process.env.GITHUB_PAGES ? '/contas-casal/' : '/',
  plugins: [react(), tailwindcss()],
})
