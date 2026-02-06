import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as fs from 'fs'
import * as path from 'path'
import { LinterConfig, LinterResults } from './types'

/**
 * Runs liquibase-linter with the specified configuration
 */
export async function runLinter(config: LinterConfig): Promise<LinterResults> {
  try {
    core.info('Running liquibase-linter...')

    // Build command arguments
    const args = ['check']

    // Add optional flags
    if (config.configFile) {
      args.push(`--config=${config.configFile}`)
    }

    if (config.severityThreshold) {
      args.push(`--severity-threshold=${config.severityThreshold}`)
    }

    // Always use JSON format for parsing
    args.push('--format=json')
    args.push(config.directory)

    core.info(`Command: ${config.binaryPath} ${args.join(' ')}`)
    core.info(`Working directory: ${config.workingDirectory}`)

    // Execute the linter
    let stdout = ''
    let stderr = ''
    let exitCode = 0

    const options = {
      cwd: config.workingDirectory,
      ignoreReturnCode: true, // We handle exit codes ourselves
      listeners: {
        stdout: (data: Buffer) => {
          stdout += data.toString()
        },
        stderr: (data: Buffer) => {
          stderr += data.toString()
        }
      }
    }

    try {
      exitCode = await exec.exec(config.binaryPath, args, options)
    } catch (error) {
      throw new Error(
        `Failed to execute liquibase-linter: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Log stderr if present (may contain warnings or info messages)
    if (stderr) {
      core.info(`Linter stderr: ${stderr}`)
    }

    // Handle exit codes
    if (exitCode === 2) {
      throw new Error(`Liquibase-linter execution error: ${stderr || 'Unknown error'}`)
    }

    // Parse JSON output
    let results: LinterResults
    try {
      if (!stdout.trim()) {
        // No output might mean no violations found
        results = {
          version: '1.0.0',
          timestamp: new Date().toISOString(),
          files: [],
          summary: {
            files_checked: 0,
            total_violations: 0,
            critical: 0,
            warning: 0,
            info: 0
          }
        }
      } else {
        results = JSON.parse(stdout)
      }
    } catch (error) {
      core.error(`Failed to parse JSON output: ${stdout}`)
      throw new Error(
        `Failed to parse liquibase-linter JSON output: ${error instanceof Error ? error.message : String(error)}`
      )
    }

    // Save results to a file
    const resultsFile = path.join(config.workingDirectory, 'liquibase-linter-results.json')
    await fs.promises.writeFile(resultsFile, JSON.stringify(results, null, 2))
    core.info(`Results saved to: ${resultsFile}`)
    core.setOutput('result-file', resultsFile)

    // Log summary
    core.info('=== Liquibase Linter Results ===')
    core.info(`Files checked: ${results.summary.files_checked}`)
    core.info(`Total violations: ${results.summary.total_violations}`)
    core.info(`  Critical: ${results.summary.critical}`)
    core.info(`  Warning: ${results.summary.warning}`)
    core.info(`  Info: ${results.summary.info}`)

    // Set outputs
    core.setOutput('violations-found', results.summary.total_violations > 0 ? 'true' : 'false')
    core.setOutput('total-violations', results.summary.total_violations.toString())
    core.setOutput('critical-count', results.summary.critical.toString())
    core.setOutput('warning-count', results.summary.warning.toString())
    core.setOutput('info-count', results.summary.info.toString())

    return results
  } catch (error) {
    throw new Error(
      `Failed to run liquibase-linter: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Validates that the target directory exists
 */
export async function validateDirectory(dirPath: string, workingDir: string): Promise<void> {
  const fullPath = path.isAbsolute(dirPath) ? dirPath : path.join(workingDir, dirPath)

  try {
    const stats = await fs.promises.stat(fullPath)
    if (!stats.isDirectory()) {
      throw new Error(`Path is not a directory: ${fullPath}`)
    }
    core.info(`Target directory validated: ${fullPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Target directory does not exist: ${fullPath}`)
    }
    throw error
  }
}

/**
 * Validates that a config file exists (if specified)
 */
export async function validateConfigFile(configFile: string, workingDir: string): Promise<void> {
  const fullPath = path.isAbsolute(configFile) ? configFile : path.join(workingDir, configFile)

  try {
    const stats = await fs.promises.stat(fullPath)
    if (!stats.isFile()) {
      throw new Error(`Config path is not a file: ${fullPath}`)
    }
    core.info(`Config file validated: ${fullPath}`)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      throw new Error(`Config file does not exist: ${fullPath}`)
    }
    throw error
  }
}
