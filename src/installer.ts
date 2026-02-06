import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import * as fs from 'fs'
import * as path from 'path'

interface Platform {
  os: string
  arch: string
}

/**
 * Determines the platform and architecture for the current runner
 */
function getPlatform(): Platform {
  const platform = process.platform
  const arch = process.arch

  // Map Node.js platform names to liquibase-linter binary names
  let os: string
  switch (platform) {
    case 'linux':
      os = 'linux'
      break
    case 'darwin':
      os = 'darwin'
      break
    case 'win32':
      os = 'windows'
      break
    default:
      throw new Error(`Unsupported platform: ${platform}`)
  }

  // Map Node.js architecture names to liquibase-linter binary architectures
  let mappedArch: string
  switch (arch) {
    case 'x64':
      mappedArch = 'amd64'
      break
    case 'arm64':
      mappedArch = 'arm64'
      break
    default:
      throw new Error(`Unsupported architecture: ${arch}`)
  }

  return { os, arch: mappedArch }
}

/**
 * Constructs the download URL for the liquibase-linter binary
 */
function getDownloadUrl(version: string, platform: Platform): string {
  const baseUrl = 'https://github.com/n2jsoft-public-org/liquibase-linter/releases/download'
  const binaryName = `liquibase-linter-${platform.os}-${platform.arch}`
  const extension = platform.os === 'windows' ? '.exe' : ''
  return `${baseUrl}/${version}/${binaryName}${extension}`
}

/**
 * Downloads and installs the liquibase-linter binary
 */
export async function installLinter(version: string): Promise<string> {
  try {
    core.info(`Installing liquibase-linter ${version}...`)

    // Check if already cached
    const cachedPath = tc.find('liquibase-linter', version)
    if (cachedPath) {
      core.info(`Found cached liquibase-linter at ${cachedPath}`)
      const binaryPath = await getBinaryPath(cachedPath, version)
      return binaryPath
    }

    // Determine platform and architecture
    const platform = getPlatform()
    core.info(`Detected platform: ${platform.os}-${platform.arch}`)

    // Download the binary
    const url = getDownloadUrl(version, platform)
    core.info(`Downloading from: ${url}`)

    let downloadPath: string
    try {
      downloadPath = await tc.downloadTool(url)
      core.info(`Downloaded to: ${downloadPath}`)
    } catch (error) {
      throw new Error(
        `Failed to download liquibase-linter ${version} from ${url}: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Create a directory for the tool
    const toolDir = path.join(
      process.env['RUNNER_TEMP'] || '/tmp',
      `liquibase-linter-${Date.now()}`
    )
    await fs.promises.mkdir(toolDir, { recursive: true })

    // Move and rename the binary
    const binaryName = platform.os === 'windows' ? 'liquibase-linter.exe' : 'liquibase-linter'
    const binaryPath = path.join(toolDir, binaryName)
    await fs.promises.copyFile(downloadPath, binaryPath)

    // Make executable (Unix-like systems)
    if (platform.os !== 'windows') {
      await fs.promises.chmod(binaryPath, 0o755)
      core.info(`Made binary executable: ${binaryPath}`)
    }

    // Verify the binary works
    try {
      await exec.exec(binaryPath, ['--version'], { silent: true })
      core.info('Binary verification successful')
    } catch (error) {
      throw new Error(
        `Binary verification failed: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Cache the tool
    const cachedToolPath = await tc.cacheDir(toolDir, 'liquibase-linter', version)
    core.info(`Cached liquibase-linter to ${cachedToolPath}`)

    // Add to PATH
    core.addPath(path.dirname(binaryPath))
    core.info(`Added ${path.dirname(binaryPath)} to PATH`)

    return binaryPath
  } catch (error) {
    throw new Error(
      `Failed to install liquibase-linter: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Gets the path to the binary from a cached directory
 */
async function getBinaryPath(cachedPath: string, version: string): Promise<string> {
  const platform = getPlatform()
  const binaryName = platform.os === 'windows' ? 'liquibase-linter.exe' : 'liquibase-linter'

  // Try to find the binary in the cached directory
  const possiblePaths = [
    path.join(cachedPath, binaryName),
    path.join(cachedPath, 'bin', binaryName),
    path.join(cachedPath, version, binaryName)
  ]

  for (const possiblePath of possiblePaths) {
    if (fs.existsSync(possiblePath)) {
      core.addPath(path.dirname(possiblePath))
      return possiblePath
    }
  }

  throw new Error(`Could not find liquibase-linter binary in cached directory: ${cachedPath}`)
}
