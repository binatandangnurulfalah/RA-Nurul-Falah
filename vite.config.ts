import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const buildId = (process.env.GITHUB_SHA || process.env.VITE_BUILD_ID || 'local').slice(0, 40)

export default defineConfig({
  base: '/RA-Nurul-Falah/',
  define: {
    __RA_BUILD_ID__: JSON.stringify(buildId),
  },
  plugins: [
    react(),
    {
      name: 'ra-pwa-build-stamp',
      apply: 'build',
      closeBundle() {
        const swPath = resolve('dist/sw.js')
        const source = readFileSync(swPath, 'utf8')
        writeFileSync(swPath, source.replaceAll('__RA_BUILD_ID__', buildId))
        writeFileSync(
          resolve('dist/version.json'),
          JSON.stringify({ buildId, generatedAt: new Date().toISOString() }),
        )
      },
    },
  ],
})
