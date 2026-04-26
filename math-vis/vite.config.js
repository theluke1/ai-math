import { defineConfig } from 'vite'
import glsl from 'vite-plugin-glsl'

export default defineConfig({
  plugins: [glsl()],
  // Ensures assets resolve correctly on Vercel
  base: './',
})
