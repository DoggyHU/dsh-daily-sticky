/**
 * Single-file client + ESM host build for dsh-daily-sticky.
 *
 * Mirrors the dsh-at-file esbuild template: the web server serves exactly one
 * file per plugin (/plugins/dsh-daily-sticky/client.js), so the client half is
 * one CJS bundle wrapped in the ModuleLoader factory handshake;
 * @deepseek-ai/dsh-* and react stay external (the profile's healed node_modules
 * and the app's module system provide them). The host half is plain ESM for
 * Node, externalizing @deepseek-ai/dsh-* plus cordis.
 */
import { build } from 'esbuild'
import { mkdirSync } from 'node:fs'

mkdirSync('lib', { recursive: true })

const dshExternal = ['@deepseek-ai/cordis', '@deepseek-ai/dsh-*']

await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/datastore.ts'],
  outfile: 'lib/datastore.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/stats.ts'],
  outfile: 'lib/stats.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: ['node22'],
  sourcemap: true,
  external: dshExternal,
  logLevel: 'info',
})

await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: ['es2022'],
  sourcemap: true,
  jsx: 'automatic',
  loader: { '.css': 'text' },
  external: [...dshExternal, 'react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime', 'scheduler'],
  banner: {
    js: "window.__ModuleLoader__.load({ id: 'dsh-daily-sticky', factory: (require) => { var module = { exports: {} }; var exports = module.exports;",
  },
  footer: {
    js: 'return module.exports; } });',
  },
  logLevel: 'info',
})

import { execFileSync } from 'node:child_process'
// Cross-platform: spawn the TS compiler through node (avoids the Windows
// .CMD shim that execFileSync cannot launch directly).
execFileSync(process.execPath, ['node_modules/typescript/bin/tsc', '-p', 'tsconfig.json'], { stdio: 'inherit' })
