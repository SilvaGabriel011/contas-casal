// Renders the app icon SVG to PNGs with the pre-installed Chromium.
import { chromium } from 'playwright'
import { mkdirSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

const svg = (size) => `<!doctype html><meta charset="utf-8">
<style>*{margin:0}body{width:${size}px;height:${size}px}</style>
<svg width="${size}" height="${size}" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#6d5cf6"/>
      <stop offset="1" stop-color="#ff5c8a"/>
    </linearGradient>
  </defs>
  <rect width="512" height="512" fill="url(#bg)"/>
  <circle cx="410" cy="96" r="150" fill="#ffffff" opacity="0.10"/>
  <circle cx="80" cy="440" r="130" fill="#000000" opacity="0.10"/>
  <text x="256" y="300" font-family="-apple-system, 'Segoe UI Emoji', 'Noto Color Emoji', sans-serif"
        font-size="270" text-anchor="middle">💞</text>
  <text x="256" y="448" font-family="-apple-system, 'SF Pro Text', 'Segoe UI', Roboto, sans-serif"
        font-size="86" font-weight="800" fill="#ffffff" text-anchor="middle" letter-spacing="2">A$ · R$</text>
</svg>`

const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || undefined,
})
const outDir = join(root, 'public', 'icons')
mkdirSync(outDir, { recursive: true })

for (const [file, size] of [
  ['icon-512.png', 512],
  ['icon-192.png', 192],
  ['apple-touch-icon.png', 180],
]) {
  const page = await browser.newPage({ viewport: { width: size, height: size }, deviceScaleFactor: 1 })
  await page.setContent(svg(size))
  const buf = await page.screenshot({ clip: { x: 0, y: 0, width: size, height: size } })
  writeFileSync(join(outDir, file), buf)
  await page.close()
  console.log(`${file} (${size}x${size})`)
}

await browser.close()
