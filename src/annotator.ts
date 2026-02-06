import * as core from '@actions/core'
import * as github from '@actions/github'
import { AnnotationOptions, AnnotationResult, SeverityLevel } from './types'

/**
 * Creates GitHub Check Run with annotations for violations
 */
export async function createAnnotations(
  token: string,
  options: AnnotationOptions
): Promise<AnnotationResult> {
  const octokit = github.getOctokit(token)

  try {
    core.info('Creating GitHub Check Run with annotations...')

    // Determine conclusion based on fail-on setting
    const conclusion = determineConclusion(options)

    // Prepare annotations
    const annotations = prepareAnnotations(options)

    core.info(`Total annotations to create: ${annotations.length}`)

    // Create the check run
    const checkRun = await octokit.rest.checks.create({
      owner: options.owner,
      repo: options.repo,
      name: 'Liquibase Linter',
      head_sha: options.sha,
      status: 'completed',
      conclusion,
      output: {
        title: 'Liquibase Linter Results',
        summary: generateSummary(options),
        annotations: annotations.slice(0, 50) // GitHub API limits to 50 annotations per request
      }
    })

    core.info(`Check run created: ${checkRun.data.html_url}`)

    // If we have more than 50 annotations, we need to add them separately
    if (annotations.length > 50) {
      core.warning(
        `Found ${annotations.length} annotations, but GitHub limits to 50 per request. Only the first 50 will be displayed.`
      )
      // Note: We could use the update endpoint to add more, but it's complex
      // For now, we log a warning and show the first 50
    }

    return {
      checkRunId: checkRun.data.id,
      conclusion: conclusion as 'success' | 'failure' | 'neutral',
      annotationCount: annotations.length
    }
  } catch (error) {
    throw new Error(
      `Failed to create GitHub annotations: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Determines the check run conclusion based on violations and fail-on setting
 */
function determineConclusion(options: AnnotationOptions): 'success' | 'failure' | 'neutral' {
  const { results, failOn } = options
  const { summary } = results

  if (failOn === 'never') {
    return summary.total_violations > 0 ? 'neutral' : 'success'
  }

  // Check if we have violations that should cause failure
  switch (failOn) {
    case 'critical':
      return summary.critical > 0 ? 'failure' : 'success'
    case 'warning':
      return summary.warning > 0 || summary.critical > 0 ? 'failure' : 'success'
    case 'info':
      return summary.total_violations > 0 ? 'failure' : 'success'
    default:
      return summary.critical > 0 ? 'failure' : 'success'
  }
}

/**
 * Prepares annotations from linter results
 */
function prepareAnnotations(options: AnnotationOptions) {
  const annotations: Array<{
    path: string
    start_line: number
    end_line: number
    annotation_level: 'failure' | 'warning' | 'notice'
    message: string
    title?: string
  }> = []

  for (const file of options.results.files) {
    for (const violation of file.violations) {
      const level = mapSeverityToLevel(violation.severity)

      // Build message with rule and changeset info
      let message = violation.message
      if (violation.changeset_id) {
        message = `[Changeset: ${violation.changeset_id}] ${message}`
      }

      annotations.push({
        path: file.path,
        start_line: violation.line,
        end_line: violation.line,
        annotation_level: level,
        message,
        title: `${violation.rule} (${violation.severity})`
      })
    }
  }

  return annotations
}

/**
 * Maps severity level to GitHub annotation level
 */
function mapSeverityToLevel(severity: SeverityLevel): 'failure' | 'warning' | 'notice' {
  switch (severity) {
    case 'critical':
      return 'failure'
    case 'warning':
      return 'warning'
    case 'info':
      return 'notice'
    default:
      return 'notice'
  }
}

/**
 * Generates a summary markdown for the check run
 */
function generateSummary(options: AnnotationOptions): string {
  const { summary, files } = options.results

  let markdown = '## Liquibase Linter Results\n\n'

  if (summary.total_violations === 0) {
    markdown += '✅ **No violations found!**\n\n'
    markdown += `Checked ${summary.files_checked} file(s).`
    return markdown
  }

  // Summary table
  markdown += '### Summary\n\n'
  markdown += '| Severity | Count |\n'
  markdown += '|----------|-------|\n'
  markdown += `| 🔴 Critical | ${summary.critical} |\n`
  markdown += `| 🟡 Warning | ${summary.warning} |\n`
  markdown += `| 🔵 Info | ${summary.info} |\n`
  markdown += `| **Total** | **${summary.total_violations}** |\n\n`

  // Files with violations
  if (files.length > 0) {
    markdown += '### Files with Violations\n\n'
    for (const file of files) {
      if (file.violations.length > 0) {
        markdown += `- **${file.path}** (${file.violations.length} violation(s))\n`
      }
    }
    markdown += '\n'
  }

  // Top violations by rule
  const ruleCount = new Map<string, number>()
  for (const file of files) {
    for (const violation of file.violations) {
      ruleCount.set(violation.rule, (ruleCount.get(violation.rule) || 0) + 1)
    }
  }

  if (ruleCount.size > 0) {
    markdown += '### Violations by Rule\n\n'
    const sortedRules = Array.from(ruleCount.entries()).sort((a, b) => b[1] - a[1])
    for (const [rule, count] of sortedRules.slice(0, 10)) {
      markdown += `- **${rule}**: ${count}\n`
    }
  }

  return markdown
}

/**
 * Posts a comment on a pull request with linter results
 */
export async function postPRComment(
  token: string,
  owner: string,
  repo: string,
  prNumber: number,
  options: AnnotationOptions
): Promise<void> {
  const octokit = github.getOctokit(token)

  try {
    const body = generateSummary(options)

    await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body
    })

    core.info(`Posted comment on PR #${prNumber}`)
  } catch (error) {
    // Don't fail the action if we can't post a comment
    core.warning(
      `Failed to post PR comment: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
