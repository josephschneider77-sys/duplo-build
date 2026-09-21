import { defineConfig } from 'vite'

// GitHub Pages subdirectory. Local `vite` / `vite preview` stay at `/`
// so the cloud and desktop previews work at the server root.
const pagesBase = '/duplo-build/'

export default defineConfig(({ command }) => ({
  base: command === 'build' ? pagesBase : '/',
  server: {
    host: true,
    port: 43173,
    strictPort: true,
  },
  preview: {
    host: true,
    port: 43173,
    strictPort: true,
  },
}))