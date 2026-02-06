/**
 * Severity levels for violations
 */
export type SeverityLevel = 'critical' | 'warning' | 'info'

/**
 * A single violation found by liquibase-linter
 */
export interface Violation {
    rule: string
    severity: SeverityLevel
    message: string
    line: number
    changeset_id?: string
}

/**
 * Violations grouped by file
 */
export interface FileViolations {
    path: string
    violations: Violation[]
}

/**
 * Summary of all violations
 */
export interface ViolationSummary {
    files_checked: number
    total_violations: number
    critical: number
    warning: number
    info: number
}

/**
 * Complete linter results
 */
export interface LinterResults {
    version: string
    timestamp: string
    files: FileViolations[]
    summary: ViolationSummary
}

/**
 * Configuration for running the linter
 */
export interface LinterConfig {
    binaryPath: string
    directory: string
    configFile?: string
    rules?: string
    severityThreshold?: SeverityLevel
    workingDirectory: string
}

/**
 * Options for creating GitHub annotations
 */
export interface AnnotationOptions {
    owner: string
    repo: string
    sha: string
    results: LinterResults
    failOn: SeverityLevel | 'never'
}

/**
 * Result of creating annotations
 */
export interface AnnotationResult {
    checkRunId: number
    conclusion: 'success' | 'failure' | 'neutral'
    annotationCount: number
}
