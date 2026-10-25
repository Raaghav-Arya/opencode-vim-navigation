import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { spawnSync } from 'node:child_process'

const root = fileURLToPath(new URL('../', import.meta.url))
const temp = mkdtempSync(join(tmpdir(), 'opencode-vim-package-'))
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm'
function run(command, args, cwd = root) {
  const result = spawnSync(command, args, { cwd, encoding: 'utf8', timeout: 120_000 })
  if (result.error) throw result.error
  assert.equal(result.status, 0, `${command} ${args.join(' ')}\n${result.stdout}\n${result.stderr}`)
  return result.stdout
}
try {
  const [packed] = JSON.parse(run(npm, ['pack', '--json', '--pack-destination', temp]))
  const files = packed.files.map(file => file.path)
  for (const expected of ['LICENSE', 'README.md', 'package.json', 'tui.ts', 'src/tui.mjs', 'src/adapter.mjs', 'src/navigation.mjs']) {
    assert.ok(files.includes(expected), `Missing packed file: ${expected}`)
  }
  assert.ok(files.every(file => !file.startsWith('tests/') && !file.startsWith('scripts/') && !file.startsWith('.github/')))
  const consumer = join(temp, 'consumer')
  run(npm, ['install', '--prefix', consumer, '--ignore-scripts', '--no-audit', '--no-fund', join(temp, packed.filename)])
  const installed = join(consumer, 'node_modules', 'opencode-vim-navigation')
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'))
  assert.equal(manifest.version, JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).version)
  assert.equal(manifest.exports['./tui'], './tui.ts')
  const entry = readFileSync(join(installed, 'tui.ts'), 'utf8')
  assert.match(entry, /["']\.\/src\/tui\.mjs["']/)
  for (const name of readdirSync(join(installed, 'src'))) {
    assert.ok(name.endsWith('.mjs'), `Runtime source must be native JS, not JSX: ${name}`)
    const file = join(installed, 'src', name)
    const source = readFileSync(file, 'utf8')
    assert.doesNotMatch(source, /(?:from\s+|import\s*\()["']react(?:[\/"'])/)
    run(process.execPath, ['--check', file])
    for (const match of source.matchAll(/(?:from\s+|import\s*\()["'](\.[^"']+)["']/g)) {
      assert.ok(readFileSync(join(dirname(file), match[1])).length, `Missing relative import ${match[1]}`)
    }
  }
  console.log(`Packed ${manifest.name}@${manifest.version}: contents, dependency installation, native JS syntax, and relative imports verified.`)
  console.log('This is not an OpenCode runtime rendering test; host-provided modules require a separate live trial.')
} finally {
  rmSync(temp, { recursive: true, force: true })
}
