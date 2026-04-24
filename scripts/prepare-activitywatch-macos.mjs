#!/usr/bin/env node

import { execFileSync } from 'child_process'
import { chmodSync, cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { dirname, join, relative, resolve } from 'path'
import { fileURLToPath } from 'url'

const DEFAULT_ACTIVITYWATCH_VERSION = 'v0.13.2'
const DEFAULT_MAC_BUILD_ARCH = 'x64'
const ACTIVITYWATCH_REPO = 'ActivityWatch/activitywatch'
const REQUIRED_BINARY_NAMES = ['aw-watcher-window', 'aw-watcher-afk']
const SERVER_BINARY_CANDIDATES = ['aw-server', 'aw-server-rust']

const scriptPath = fileURLToPath(import.meta.url)
const repoRoot = resolve(dirname(scriptPath), '..')
const stageRoot = join(repoRoot, 'resources', 'activitywatch', 'macos')
const activityWatchVersion =
  process.argv[2] || process.env.ACTIVITYWATCH_VERSION || DEFAULT_ACTIVITYWATCH_VERSION
const macBuildArch = normalizeMacBuildArch(process.env.MAC_BUILD_ARCH || DEFAULT_MAC_BUILD_ARCH)
const githubToken = process.env.GITHUB_TOKEN || process.env.GH_TOKEN || null

function log(message) {
  console.log(`[prepare-activitywatch-macos] ${message}`)
}

function fail(message) {
  throw new Error(message)
}

function normalizeMacBuildArch(value) {
  const normalized = value.trim().toLowerCase()

  if (normalized === 'x64' || normalized === 'x86_64') {
    return 'x64'
  }

  if (normalized === 'arm64' || normalized === 'aarch64') {
    return 'arm64'
  }

  fail(`Unsupported MAC_BUILD_ARCH "${value}". Expected "x64" or "arm64".`)
}

function run(command, args, options = {}) {
  execFileSync(command, args, {
    stdio: 'pipe',
    ...options
  })
}

function walkDirectories(rootDir) {
  const entries = readdirSync(rootDir, { withFileTypes: true })
  const results = []

  for (const entry of entries) {
    const fullPath = join(rootDir, entry.name)
    results.push(fullPath)
    if (entry.isDirectory()) {
      results.push(...walkDirectories(fullPath))
    }
  }

  return results
}

function findAppBundle(rootDir) {
  const matches = walkDirectories(rootDir).filter((candidate) => candidate.endsWith('.app'))
  const exact = matches.find((candidate) => candidate.endsWith('/ActivityWatch.app'))
  return exact ?? matches[0] ?? null
}

function findBinary(rootDir, candidates) {
  const files = walkDirectories(rootDir)
  for (const candidateName of candidates) {
    const match = files.find((candidate) => candidate.endsWith(`/${candidateName}`))
    if (match) {
      return match
    }
  }
  return null
}

function assetNameContainsArch(name, arch) {
  const normalized = name.toLowerCase()

  if (arch === 'x64') {
    return /(?:^|[-_.])(x64|x86_64)(?:[-_.]|$)/.test(normalized)
  }

  return /(?:^|[-_.])(arm64|aarch64)(?:[-_.]|$)/.test(normalized)
}

function assetNameIsUniversal(name) {
  return /(?:^|[-_.])universal(?:[-_.]|$)/i.test(name)
}

function assetNameHasExplicitArch(name) {
  return /(?:^|[-_.])(x64|x86_64|arm64|aarch64|universal)(?:[-_.]|$)/i.test(name)
}

function selectMacDmgAsset(assets, arch) {
  const exactMatch = assets.find((asset) => assetNameContainsArch(asset.name, arch))
  if (exactMatch) {
    return exactMatch
  }

  const universalMatch = assets.find((asset) => assetNameIsUniversal(asset.name))
  if (universalMatch) {
    return universalMatch
  }

  const genericMatch = assets.find((asset) => !assetNameHasExplicitArch(asset.name))
  if (genericMatch) {
    return genericMatch
  }

  const availableNames = assets.map((asset) => asset.name).join(', ')
  fail(
    `No macOS DMG asset compatible with MAC_BUILD_ARCH=${arch} was found for ` +
      `${activityWatchVersion}. Available DMGs: ${availableNames}`
  )
}

async function fetchJson(url) {
  const headers = {
    Accept: 'application/vnd.github+json',
    'User-Agent': 'canopy-build-prep'
  }

  if (githubToken) {
    headers.Authorization = `Bearer ${githubToken}`
  }

  const response = await fetch(url, { headers })
  if (!response.ok) {
    fail(
      `GitHub API returned ${response.status} for ${url}. ` +
        `Set ACTIVITYWATCH_VERSION to a valid tag or provide GITHUB_TOKEN/GH_TOKEN if rate limited.`
    )
  }

  return response.json()
}

async function downloadFile(url, outputPath) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'canopy-build-prep' }
  })

  if (!response.ok) {
    fail(`Failed to download ${url}: ${response.status}`)
  }

  const arrayBuffer = await response.arrayBuffer()
  writeFileSync(outputPath, Buffer.from(arrayBuffer))
}

function createWrapper(targetDir, expectedBinaryName, actualBinaryPath) {
  mkdirSync(targetDir, { recursive: true })

  const wrapperPath = join(targetDir, expectedBinaryName)
  const actualRelativePath = relative(targetDir, actualBinaryPath)
  const wrapperContents = `#!/bin/bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$SCRIPT_DIR/${actualRelativePath}" "$@"
`

  writeFileSync(wrapperPath, wrapperContents)
  chmodSync(wrapperPath, 0o755)
}

async function main() {
  if (process.platform !== 'darwin') {
    fail('This script must run on macOS so it can mount the upstream ActivityWatch DMG.')
  }

  log(`Using ActivityWatch release ${activityWatchVersion} for MAC_BUILD_ARCH=${macBuildArch}`)

  const release = await fetchJson(
    `https://api.github.com/repos/${ACTIVITYWATCH_REPO}/releases/tags/${encodeURIComponent(activityWatchVersion)}`
  )

  const dmgAssets = (release.assets ?? []).filter((asset) => asset.name?.endsWith('.dmg'))
  if (dmgAssets.length === 0) {
    fail(`No macOS DMG asset found for ActivityWatch release ${activityWatchVersion}.`)
  }

  const dmgAsset = selectMacDmgAsset(dmgAssets, macBuildArch)
  const tempRoot = join(tmpdir(), `canopy-activitywatch-${Date.now()}`)
  const dmgPath = join(tempRoot, dmgAsset.name)
  const mountPath = join(tempRoot, 'mount')

  mkdirSync(mountPath, { recursive: true })
  log(`Downloading ${dmgAsset.name}`)
  await downloadFile(dmgAsset.browser_download_url, dmgPath)

  log(`Mounting ${dmgAsset.name}`)
  run('hdiutil', ['attach', dmgPath, '-nobrowse', '-readonly', '-mountpoint', mountPath])

  try {
    const appBundlePath = findAppBundle(mountPath)
    if (!appBundlePath) {
      fail(`Could not find ActivityWatch.app inside ${dmgAsset.name}.`)
    }

    const serverBinaryPath = findBinary(appBundlePath, SERVER_BINARY_CANDIDATES)
    if (!serverBinaryPath) {
      fail(
        `Could not find any server binary (${SERVER_BINARY_CANDIDATES.join(', ')}) inside ActivityWatch.app.`
      )
    }

    const watcherBinaryPaths = REQUIRED_BINARY_NAMES.map((binaryName) => {
      const binaryPath = findBinary(appBundlePath, [binaryName])
      if (!binaryPath) {
        fail(`Could not find ${binaryName} inside ActivityWatch.app.`)
      }
      return { binaryName, binaryPath }
    })

    rmSync(stageRoot, { recursive: true, force: true })
    mkdirSync(stageRoot, { recursive: true })

    const stagedAppBundlePath = join(stageRoot, 'ActivityWatch.app')
    log('Copying ActivityWatch.app into macOS staging resources')
    cpSync(appBundlePath, stagedAppBundlePath, {
      recursive: true,
      verbatimSymlinks: true
    })

    const stagedServerBinaryPath = join(
      stagedAppBundlePath,
      relative(appBundlePath, serverBinaryPath)
    )
    createWrapper(join(stageRoot, 'aw-server'), 'aw-server', stagedServerBinaryPath)

    for (const { binaryName, binaryPath } of watcherBinaryPaths) {
      const stagedBinaryPath = join(stagedAppBundlePath, relative(appBundlePath, binaryPath))
      createWrapper(join(stageRoot, binaryName), binaryName, stagedBinaryPath)
    }

    log(`Staged ActivityWatch.app and wrapper binaries under ${stageRoot}`)
  } finally {
    try {
      run('hdiutil', ['detach', mountPath, '-quiet'])
    } catch (error) {
      console.warn(
        `[prepare-activitywatch-macos] Failed to detach ${mountPath}: ${
          error instanceof Error ? error.message : String(error)
        }`
      )
    }
    rmSync(tempRoot, { recursive: true, force: true })
  }
}

main().catch((error) => {
  console.error(
    `[prepare-activitywatch-macos] ${
      error instanceof Error ? error.message : String(error)
    }`
  )
  process.exitCode = 1
})
