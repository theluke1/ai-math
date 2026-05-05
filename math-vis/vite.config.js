import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // Ensures assets resolve correctly on Vercel
  base: './',
  server: {
    proxy: {
      // Run `npx wrangler dev` in another terminal; Vite will forward AI calls.
      '/ask': 'http://127.0.0.1:8787',
    },
  },
})
