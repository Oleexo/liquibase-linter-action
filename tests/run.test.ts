import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import type { Octokit } from '@octokit/action'
import * as fs from 'node:fs/promises'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context } from '../src/github.js'
import { run } from '../src/run.js'

vi.mock('@actions/core')
vi.mock('@actions/exec')
vi.mock('@actions/tool-cache')
vi.mock('node:fs/promises')

describe('run', () => {
  let mockOctokit: Octokit
  let mockContext: Context

  beforeEach(() => {
    vi.resetAllMocks()

    mockOctokit = {
      rest: {
        checks: {
          create: vi.fn().mockResolvedValue({ data: { id: 123 } }),
        },
      },
    } as unknown as Octokit

    mockContext = {
      repo: {
        owner: 'test-owner',
        repo: 'test-repo',
      },
      sha: 'abc123',
      payload: {} as unknown as Context['payload'],
    }

    // Mock tool-cache download
    vi.mocked(tc.downloadTool).mockResolvedValue('/tmp/downloaded-linter')

    // Mock fs operations
    vi.mocked(fs.rename).mockResolvedValue(undefined)
    vi.mocked(fs.chmod).mockResolvedValue(undefined)

    // Mock core.info to avoid noise in tests
    vi.mocked(core.info).mockImplementation(() => { })
  })

  it('should successfully run with no violations', async () => {
    // Mock linter execution with no violations
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [],
        summary: {
          files_checked: 5,
          total_violations: 0,
          critical: 0,
          warning: 0,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 0
    })

    await run(
      {
        path: 'db/changelog',
        config: '',
        version: 'latest',
        failOnCritical: true,
      },
      mockOctokit,
      mockContext,
    )

    expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        owner: 'test-owner',
        repo: 'test-repo',
        name: 'Liquibase Linter',
        head_sha: 'abc123',
        conclusion: 'success',
      }),
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should create annotations for violations', async () => {
    // Mock linter execution with violations
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [
          {
            path: 'db/changelog/001.xml',
            violations: [
              {
                rule: 'sql-injection',
                severity: 'critical',
                message: 'Potential SQL injection detected',
                line: 15,
                changeset_id: 'create-user-1',
              },
              {
                rule: 'missing-rollback',
                severity: 'warning',
                message: 'Changeset does not include rollback',
                line: 10,
              },
            ],
          },
        ],
        summary: {
          files_checked: 1,
          total_violations: 2,
          critical: 1,
          warning: 1,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 1
    })

    await run(
      {
        path: 'db/changelog',
        config: '',
        version: 'latest',
        failOnCritical: false,
      },
      mockOctokit,
      mockContext,
    )

    expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        output: expect.objectContaining({
          annotations: expect.arrayContaining([
            expect.objectContaining({
              path: 'db/changelog/001.xml',
              start_line: 15,
              end_line: 15,
              annotation_level: 'failure',
              message: 'Potential SQL injection detected',
              title: 'sql-injection (changeset: create-user-1)',
            }),
            expect.objectContaining({
              path: 'db/changelog/001.xml',
              start_line: 10,
              end_line: 10,
              annotation_level: 'warning',
              message: 'Changeset does not include rollback',
              title: 'missing-rollback',
            }),
          ]),
        }),
      }),
    )
  })

  it('should fail on critical violations when failOnCritical is true', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [
          {
            path: 'db/changelog/001.xml',
            violations: [
              {
                rule: 'sql-injection',
                severity: 'critical',
                message: 'SQL injection detected',
                line: 15,
              },
            ],
          },
        ],
        summary: {
          files_checked: 1,
          total_violations: 1,
          critical: 1,
          warning: 0,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 1
    })

    await run(
      {
        path: 'db/changelog',
        config: '',
        version: 'latest',
        failOnCritical: true,
      },
      mockOctokit,
      mockContext,
    )

    expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: 'failure',
      }),
    )
    expect(core.setFailed).toHaveBeenCalledWith('Found 1 critical violation(s)')
  })

  it('should not fail on critical violations when failOnCritical is false', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [
          {
            path: 'db/changelog/001.xml',
            violations: [
              {
                rule: 'sql-injection',
                severity: 'critical',
                message: 'SQL injection detected',
                line: 15,
              },
            ],
          },
        ],
        summary: {
          files_checked: 1,
          total_violations: 1,
          critical: 1,
          warning: 0,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 1
    })

    await run(
      {
        path: 'db/changelog',
        config: '',
        version: 'latest',
        failOnCritical: false,
      },
      mockOctokit,
      mockContext,
    )

    expect(mockOctokit.rest.checks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        conclusion: 'neutral',
      }),
    )
    expect(core.setFailed).not.toHaveBeenCalled()
  })

  it('should include config parameter when provided', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [],
        summary: {
          files_checked: 0,
          total_violations: 0,
          critical: 0,
          warning: 0,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 0
    })

    await run(
      {
        path: 'db/changelog',
        config: '.liquibase-linter.yaml',
        version: 'latest',
        failOnCritical: true,
      },
      mockOctokit,
      mockContext,
    )

    expect(exec.exec).toHaveBeenCalledWith(
      expect.any(String),
      expect.arrayContaining(['check', '--config=.liquibase-linter.yaml', '--format=json', 'db/changelog']),
      expect.any(Object),
    )
  })

  it('should download specific version when provided', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        version: '1.0.0',
        timestamp: '2024-02-04T10:30:00Z',
        files: [],
        summary: {
          files_checked: 0,
          total_violations: 0,
          critical: 0,
          warning: 0,
          info: 0,
        },
      })
      options?.listeners?.stdout?.(Buffer.from(output))
      return 0
    })

    await run(
      {
        path: 'db/changelog',
        config: '',
        version: 'v0.0.1',
        failOnCritical: true,
      },
      mockOctokit,
      mockContext,
    )

    expect(tc.downloadTool).toHaveBeenCalledWith(expect.stringContaining('releases/download/v0.0.1/'))
  })

  it('should throw error on linter execution error', async () => {
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      options?.listeners?.stderr?.(Buffer.from('File not found'))
      return 2
    })

    await expect(
      run(
        {
          path: 'db/changelog',
          config: '',
          version: 'latest',
          failOnCritical: true,
        },
        mockOctokit,
        mockContext,
      ),
    ).rejects.toThrow('Linter error: File not found')
  })
})
