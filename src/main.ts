import * as core from '@actions/core'
import * as github from '@actions/github'
import { createAnnotations } from './annotator'
import { installLinter } from './installer'
import { runLinter, validateConfigFile, validateDirectory } from './runner'
import { LinterConfig, SeverityLevel } from './types'

/**
 * Main entry point for the GitHub Action
 */
async function run(): Promise<void> {
  try {
    // Get inputs
    const version = core.getInput('version', { required: false }) || 'v0.0.1'
    const directory = core.getInput('directory', { required: false }) || 'db/changelog'
    const configFile = core.getInput('config-file', { required: false })
    const rules = core.getInput('rules', { required: false })
    const severityThreshold = (core.getInput('severity-threshold', { required: false }) ||
      'info') as SeverityLevel
    const failOn = core.getInput('fail-on', { required: false }) || 'critical'
    const githubToken = core.getInput('github-token', { required: true })
    const shouldAnnotate = core.getInput('annotate', { required: false }) !== 'false'
    const workingDirectory =
      core.getInput('working-directory', { required: false }) || process.cwd()

    // Validate inputs
    core.info('=== Input Configuration ===')
    core.info(`Version: ${version}`)
    core.info(`Directory: ${directory}`)
    core.info(`Config file: ${configFile || '(auto-discovery)'}`)
    core.info(`Rules: ${rules || '(from config or defaults)'}`)
    core.info(`Severity threshold: ${severityThreshold}`)
    core.info(`Fail on: ${failOn}`)
    core.info(`Annotate: ${shouldAnnotate}`)
    core.info(`Working directory: ${workingDirectory}`)

    // Validate severity threshold
    if (!['info', 'warning', 'critical'].includes(severityThreshold)) {
      throw new Error(`Invalid severity-threshold: ${severityThreshold}`)
    }

    // Validate fail-on
    if (!['info', 'warning', 'critical', 'never'].includes(failOn)) {
      throw new Error(`Invalid fail-on: ${failOn}`)
    }

    // Validate directory exists
    await validateDirectory(directory, workingDirectory)

    // Validate config file if specified
    if (configFile) {
      await validateConfigFile(configFile, workingDirectory)
    }

    // Step 1: Install liquibase-linter binary
    core.startGroup('Installing liquibase-linter')
    const binaryPath = await installLinter(version)
    core.info(`Binary installed at: ${binaryPath}`)
    core.endGroup()

    // Step 2: Run the linter
    core.startGroup('Running liquibase-linter')
    const config: LinterConfig = {
      binaryPath,
      directory,
      configFile: configFile || undefined,
      rules: rules || undefined,
      severityThreshold,
      workingDirectory
    }

    const results = await runLinter(config)
    core.endGroup()

    // Step 3: Create GitHub annotations if enabled and we have violations
    if (shouldAnnotate && results.summary.total_violations > 0) {
      core.startGroup('Creating GitHub annotations')

      try {
        const context = github.context
        const owner = context.repo.owner
        const repo = context.repo.repo
        const sha = context.sha

        core.info(`Repository: ${owner}/${repo}`)
        core.info(`SHA: ${sha}`)

        const annotationResult = await createAnnotations(githubToken, {
          owner,
          repo,
          sha,
          results,
          failOn: failOn as SeverityLevel | 'never'
        })

        core.info(`Check run created with ID: ${annotationResult.checkRunId}`)
        core.info(`Conclusion: ${annotationResult.conclusion}`)
        core.info(`Annotations created: ${annotationResult.annotationCount}`)
      } catch (error) {
        // Don't fail the action if annotations fail, just log a warning
        core.warning(
          `Failed to create annotations: ${error instanceof Error ? error.message : String(error)}`
        )
        core.warning('Continuing without annotations...')
      }

      core.endGroup()
    } else if (!shouldAnnotate) {
      core.info('Annotations disabled, skipping...')
    } else {
      core.info('No violations found, skipping annotations...')
    }

    // Step 4: Determine if action should fail
    const shouldFail = determineShouldFail(results, failOn)

    if (shouldFail) {
      const message = `Liquibase-linter found violations that meet the fail-on threshold (${failOn})`
      core.setFailed(message)
    } else {
      core.info('✅ Liquibase-linter check passed!')
    }
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error)
    core.setFailed(`Action failed: ${errorMessage}`)

    // Print stack trace for debugging
    if (error instanceof Error && error.stack) {
      core.debug(error.stack)
    }
  }
}

/**
 * Determines if the action should fail based on violations and fail-on setting
 */
function determineShouldFail(
  results: { summary: { critical: number; warning: number; total_violations: number } },
  failOn: string
): boolean {
  if (failOn === 'never') {
    return false
  }

  switch (failOn) {
    case 'critical':
      return results.summary.critical > 0
    case 'warning':
      return results.summary.warning > 0 || results.summary.critical > 0
    case 'info':
      return results.summary.total_violations > 0
    default:
      return results.summary.critical > 0
  }
}

// Run the action
run()
