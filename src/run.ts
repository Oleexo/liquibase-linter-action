import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import type { Octokit } from '@octokit/action'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { type Context, getPullRequestNumber } from './github.js'

type Inputs = {
  path: string
  config: string
  version: string
  failOnCritical: boolean
}

type LinterViolation = {
  rule: string
  severity: 'critical' | 'warning' | 'info'
  message: string
  line: number
  file_path: string
  changeset_id?: string
  author?: string
}

type LinterOutput = {
  violations: LinterViolation[]
  metadata: {
    linter_version: string
    timestamp: string
    files_checked: number
    total_time_ms: number
  }
  summary: {
    total_violations: number
    critical: number
    warning: number
    info: number
  }
}

export const run = async (inputs: Inputs, octokit: Octokit, context: Context): Promise<void> => {
  core.info('🚀 Starting Liquibase Linter action...')

  // Download liquibase-linter binary
  const linterPath = await downloadLinter(inputs.version)
  core.info(`✓ Downloaded liquibase-linter to ${linterPath}`)

  // Execute linter
  const output = await executeLinter(linterPath, inputs.path, inputs.config)
  const result = parseLinterOutput(output)

  // Create check run with annotations
  await createCheckRun(octokit, context, result, inputs.failOnCritical)

  // Post or update PR comment
  const prNumber = getPullRequestNumber(context)
  if (prNumber) {
    await upsertPRComment(octokit, context, prNumber, result)
  } else {
    core.info('ℹ️  Skipping PR comment (not running in pull request context)')
  }

  // Log summary
  core.info(`\n📊 Summary:`)
  core.info(`  Files checked: ${result.metadata.files_checked}`)
  core.info(`  Total violations: ${result.summary.total_violations}`)
  core.info(`  🔴 Critical: ${result.summary.critical}`)
  core.info(`  ⚠️  Warning: ${result.summary.warning}`)
  core.info(`  ℹ️  Info: ${result.summary.info}`)

  // Fail if needed
  if (inputs.failOnCritical && result.summary.critical > 0) {
    core.setFailed(`Found ${result.summary.critical} critical violation(s)`)
  }
}

const downloadLinter = async (version: string): Promise<string> => {
  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'amd64'
  const binaryName = `liquibase-linter-${platform}-${arch}`

  let downloadUrl: string
  if (version === 'latest') {
    downloadUrl = `https://github.com/n2jsoft-public-org/liquibase-linter/releases/latest/download/${binaryName}`
  } else {
    downloadUrl = `https://github.com/n2jsoft-public-org/liquibase-linter/releases/download/${version}/${binaryName}`
  }

  core.info(`⬇️  Downloading from ${downloadUrl}`)

  const downloadPath = await tc.downloadTool(downloadUrl)
  const targetPath = path.join(path.dirname(downloadPath), 'liquibase-linter')

  await fs.rename(downloadPath, targetPath)
  await fs.chmod(targetPath, 0o755)

  return targetPath
}

const executeLinter = async (linterPath: string, targetPath: string, configPath: string): Promise<string> => {
  core.info(`🔍 Running linter on ${targetPath}...`)

  const args = ['check', '--format=json', targetPath]
  if (configPath) {
    args.splice(1, 0, `--config=${configPath}`)
  }

  let output = ''
  let errorOutput = ''

  const exitCode = await exec.exec(linterPath, args, {
    listeners: {
      stdout: (data: Buffer) => {
        output += data.toString()
      },
      stderr: (data: Buffer) => {
        errorOutput += data.toString()
      },
    },
    ignoreReturnCode: true,
  })

  // Exit codes: 0 = no violations, 1 = violations found, 2 = error
  if (exitCode === 2) {
    throw new Error(`Linter error: ${errorOutput || 'Unknown error'}`)
  }

  if (exitCode === 0 && !output.trim()) {
    // No violations - return empty result structure
    return JSON.stringify({
      violations: [],
      metadata: {
        linter_version: '1.0.0',
        timestamp: new Date().toISOString(),
        files_checked: 0,
        total_time_ms: 0,
      },
      summary: {
        total_violations: 0,
        critical: 0,
        warning: 0,
        info: 0,
      },
    })
  }

  return output
}

const parseLinterOutput = (output: string): LinterOutput => {
  try {
    return JSON.parse(output) as LinterOutput
  } catch (e) {
    throw new Error(`Failed to parse linter output: ${e instanceof Error ? e.message : String(e)}`)
  }
}

const createCheckRun = async (
  octokit: Octokit,
  context: Context,
  result: LinterOutput,
  failOnCritical: boolean,
): Promise<void> => {
  const annotations = buildAnnotations(result)
  const conclusion = getConclusion(result, failOnCritical)
  const summary = buildSummary(result)

  core.info(`📝 Creating check run with ${annotations.length} annotation(s)...`)

  // GitHub API limits annotations to 50 per request
  const MAX_ANNOTATIONS = 50

  for (let i = 0; i < annotations.length; i += MAX_ANNOTATIONS) {
    const batch = annotations.slice(i, i + MAX_ANNOTATIONS)

    await octokit.rest.checks.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: 'Liquibase Linter',
      head_sha: context.sha,
      status: 'completed',
      conclusion,
      output: {
        title: 'Liquibase Linter Results',
        summary,
        annotations: batch,
      },
    })

    // If there are more annotations, we need to update the check run
    // For simplicity, we create separate check runs for batches
    if (i + MAX_ANNOTATIONS < annotations.length) {
      core.info(`  Batch ${Math.floor(i / MAX_ANNOTATIONS) + 1} complete...`)
    }
  }

  // If no annotations, still create a check run
  if (annotations.length === 0) {
    await octokit.rest.checks.create({
      owner: context.repo.owner,
      repo: context.repo.repo,
      name: 'Liquibase Linter',
      head_sha: context.sha,
      status: 'completed',
      conclusion,
      output: {
        title: 'Liquibase Linter Results',
        summary,
      },
    })
  }

  core.info('✓ Check run created')
}

const buildAnnotations = (result: LinterOutput) => {
  const annotations: {
    path: string
    start_line: number
    end_line: number
    annotation_level: 'failure' | 'warning' | 'notice'
    message: string
    title: string
  }[] = []

  for (const violation of result.violations) {
    const level =
      violation.severity === 'critical' ? 'failure' : violation.severity === 'warning' ? 'warning' : 'notice'

    const title = `${violation.rule}${violation.changeset_id ? ` (changeset: ${violation.changeset_id})` : ''}`

    // Convert absolute path to relative path for GitHub annotations
    const relativePath = convertToRelativePath(violation.file_path)

    // Skip violations without a valid file path
    if (!relativePath) {
      continue
    }

    annotations.push({
      path: relativePath,
      start_line: violation.line || 1,
      end_line: violation.line || 1,
      annotation_level: level,
      message: violation.message,
      title,
    })
  }

  return annotations
}

const convertToRelativePath = (absolutePath: string | undefined): string => {
  // Handle undefined or empty paths
  if (!absolutePath) {
    return ''
  }

  // Get the workspace path from environment or use current directory
  const workspace = process.env.GITHUB_WORKSPACE || process.cwd()

  // If the path is already relative, return it
  if (!path.isAbsolute(absolutePath)) {
    return absolutePath
  }

  // Convert absolute path to relative
  const relativePath = path.relative(workspace, absolutePath)

  // If the relative path starts with .. or is outside workspace, try to extract just the relevant part
  if (relativePath.startsWith('..')) {
    // Try to find the first occurrence of a common directory like test_fixtures or db
    const parts = absolutePath.split(path.sep)
    const relevantIndex = parts.findIndex((p) => ['test_fixtures', 'db', 'src', 'changelog'].includes(p))
    if (relevantIndex !== -1) {
      return parts.slice(relevantIndex).join('/')
    }
  }

  return relativePath
}

const getConclusion = (result: LinterOutput, failOnCritical: boolean): 'success' | 'failure' | 'neutral' => {
  if (result.summary.critical > 0 && failOnCritical) {
    return 'failure'
  }
  if (result.summary.total_violations > 0) {
    return 'neutral'
  }
  return 'success'
}

const buildSummary = (result: LinterOutput): string => {
  const { summary, metadata } = result

  if (summary.total_violations === 0) {
    return '✅ **No violations found!**\n\nAll Liquibase changelogs passed linting checks.'
  }

  let summaryText = '## Liquibase Linter Results\n\n'
  summaryText += `**Files checked:** ${metadata.files_checked}\n\n`
  summaryText += `**Total violations:** ${summary.total_violations}\n\n`
  summaryText += '### Violations by Severity\n\n'
  summaryText += `- 🔴 **Critical:** ${summary.critical}\n`
  summaryText += `- ⚠️  **Warning:** ${summary.warning}\n`
  summaryText += `- ℹ️  **Info:** ${summary.info}\n\n`

  if (summary.critical > 0) {
    summaryText += '---\n\n'
    summaryText += '⚠️  **Critical violations found!** These should be addressed immediately.\n'
  }

  return summaryText
}

const buildPRCommentBody = (result: LinterOutput): string => {
  const { summary, metadata } = result
  const timestamp = new Date().toISOString()

  let body = '<!-- liquibase-linter-action-comment -->\n'
  body += '## 🔍 Liquibase Linter Results\n\n'

  if (summary.total_violations === 0) {
    body += '✅ **No violations found!**\n\n'
    body += 'All Liquibase changelogs passed linting checks.\n\n'
  } else {
    body += '| Severity | Count |\n'
    body += '|----------|-------|\n'
    body += `| 🔴 Critical | **${summary.critical}** |\n`
    body += `| ⚠️  Warning | **${summary.warning}** |\n`
    body += `| ℹ️  Info | **${summary.info}** |\n`
    body += `| **Total** | **${summary.total_violations}** |\n\n`

    if (summary.critical > 0) {
      body += '> ⚠️  **Critical violations found!** These should be addressed immediately.\n\n'
    }
  }

  body += `**Files checked:** ${metadata.files_checked}\n\n`
  body += `---\n`
  body += `*Updated by [Liquibase Linter](https://github.com/n2jsoft-public-org/liquibase-linter-action) at ${timestamp}*`

  return body
}

const findExistingComment = async (octokit: Octokit, context: Context, prNumber: number): Promise<number | null> => {
  const { data: comments } = await octokit.rest.issues.listComments({
    owner: context.repo.owner,
    repo: context.repo.repo,
    issue_number: prNumber,
  })

  const existingComment = comments.find((comment) => comment.body?.includes('<!-- liquibase-linter-action-comment -->'))

  return existingComment ? existingComment.id : null
}

const upsertPRComment = async (
  octokit: Octokit,
  context: Context,
  prNumber: number,
  result: LinterOutput,
): Promise<void> => {
  const body = buildPRCommentBody(result)
  const existingCommentId = await findExistingComment(octokit, context, prNumber)

  if (existingCommentId) {
    core.info(`💬 Updating existing PR comment...`)
    await octokit.rest.issues.updateComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      comment_id: existingCommentId,
      body,
    })
    core.info('✓ PR comment updated')
  } else {
    core.info(`💬 Creating new PR comment...`)
    await octokit.rest.issues.createComment({
      owner: context.repo.owner,
      repo: context.repo.repo,
      issue_number: prNumber,
      body,
    })
    core.info('✓ PR comment created')
  }
}
