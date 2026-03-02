import * as fs from 'node:fs/promises'
import * as core from '@actions/core'
import * as exec from '@actions/exec'
import * as tc from '@actions/tool-cache'
import type { Octokit } from '@octokit/action'
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
    vi.mocked(core.info).mockImplementation(() => {})
  })

  it('should successfully run with no violations', async () => {
    // Mock linter execution with no violations
    vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
      const output = JSON.stringify({
        violations: [],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 5,
          total_time_ms: 100,
        },
        summary: {
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
        prCommentEnabled: false,
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
        violations: [
          {
            rule: 'sql-injection',
            severity: 'critical',
            message: 'Potential SQL injection detected',
            line: 15,
            file_path: 'db/changelog/001.xml',
            changeset_id: 'create-user-1',
          },
          {
            rule: 'missing-rollback',
            severity: 'warning',
            message: 'Changeset does not include rollback',
            line: 10,
            file_path: 'db/changelog/001.xml',
          },
        ],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 1,
          total_time_ms: 150,
        },
        summary: {
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
        prCommentEnabled: false,
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
        violations: [
          {
            rule: 'sql-injection',
            severity: 'critical',
            message: 'SQL injection detected',
            line: 15,
            file_path: 'db/changelog/001.xml',
          },
        ],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 1,
          total_time_ms: 120,
        },
        summary: {
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
        prCommentEnabled: false,
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
        violations: [
          {
            rule: 'sql-injection',
            severity: 'critical',
            message: 'SQL injection detected',
            line: 15,
            file_path: 'db/changelog/001.xml',
          },
        ],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 1,
          total_time_ms: 120,
        },
        summary: {
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
        prCommentEnabled: false,
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
        violations: [],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 0,
          total_time_ms: 50,
        },
        summary: {
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
        prCommentEnabled: false,
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
        violations: [],
        metadata: {
          linter_version: '1.0.0',
          timestamp: '2024-02-04T10:30:00Z',
          files_checked: 0,
          total_time_ms: 50,
        },
        summary: {
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
        prCommentEnabled: false,
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
          prCommentEnabled: false,
        },
        mockOctokit,
        mockContext,
      ),
    ).rejects.toThrow('Linter error: File not found')
  })

  describe('PR comment uniqueness by path', () => {
    const noViolationsOutput = JSON.stringify({
      violations: [],
      metadata: { linter_version: '1.0.0', timestamp: '2024-02-04T10:30:00Z', files_checked: 1, total_time_ms: 50 },
      summary: { total_violations: 0, critical: 0, warning: 0, info: 0 },
    })

    const prContext: Context = {
      repo: { owner: 'test-owner', repo: 'test-repo' },
      sha: 'abc123',
      payload: { pull_request: { number: 42 } } as unknown as Context['payload'],
    }

    beforeEach(() => {
      vi.mocked(exec.exec).mockImplementation(async (_commandLine, _args, options) => {
        options?.listeners?.stdout?.(Buffer.from(noViolationsOutput))
        return 0
      })
    })

    it('should create a new comment with the path-specific marker when no existing comment exists', async () => {
      const listComments = vi.fn().mockResolvedValue({ data: [] })
      const createComment = vi.fn().mockResolvedValue({})
      const updateComment = vi.fn().mockResolvedValue({})

      mockOctokit = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          issues: { listComments, createComment, updateComment },
        },
      } as unknown as Octokit

      await run(
        { path: 'db/changelog', config: '', version: 'latest', failOnCritical: false, prCommentEnabled: true },
        mockOctokit,
        prContext,
      )

      expect(createComment).toHaveBeenCalledOnce()
      expect(createComment).toHaveBeenCalledWith(
        expect.objectContaining({
          issue_number: 42,
          body: expect.stringContaining('<!-- liquibase-linter-action-comment:db/changelog -->'),
        }),
      )
      expect(updateComment).not.toHaveBeenCalled()
    })

    it('should update the existing path-specific comment when one is found', async () => {
      const existingComment = {
        id: 99,
        body: '<!-- liquibase-linter-action-comment:db/changelog -->\n## old content',
      }
      const listComments = vi.fn().mockResolvedValue({ data: [existingComment] })
      const createComment = vi.fn().mockResolvedValue({})
      const updateComment = vi.fn().mockResolvedValue({})

      mockOctokit = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          issues: { listComments, createComment, updateComment },
        },
      } as unknown as Octokit

      await run(
        { path: 'db/changelog', config: '', version: 'latest', failOnCritical: false, prCommentEnabled: true },
        mockOctokit,
        prContext,
      )

      expect(updateComment).toHaveBeenCalledOnce()
      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: 99,
          body: expect.stringContaining('<!-- liquibase-linter-action-comment:db/changelog -->'),
        }),
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('should fall back to updating the legacy static comment when no path-specific comment exists', async () => {
      const legacyComment = {
        id: 77,
        body: '<!-- liquibase-linter-action-comment -->\n## old legacy content',
      }
      const listComments = vi.fn().mockResolvedValue({ data: [legacyComment] })
      const createComment = vi.fn().mockResolvedValue({})
      const updateComment = vi.fn().mockResolvedValue({})

      mockOctokit = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          issues: { listComments, createComment, updateComment },
        },
      } as unknown as Octokit

      await run(
        { path: 'db/changelog', config: '', version: 'latest', failOnCritical: false, prCommentEnabled: true },
        mockOctokit,
        prContext,
      )

      expect(updateComment).toHaveBeenCalledOnce()
      expect(updateComment).toHaveBeenCalledWith(
        expect.objectContaining({
          comment_id: 77,
          body: expect.stringContaining('<!-- liquibase-linter-action-comment:db/changelog -->'),
        }),
      )
      expect(createComment).not.toHaveBeenCalled()
    })

    it('should create separate comments for different paths', async () => {
      // Two existing comments, one per path
      const comment1 = { id: 11, body: '<!-- liquibase-linter-action-comment:db/changelog -->' }
      const comment2 = { id: 22, body: '<!-- liquibase-linter-action-comment:db/other -->' }
      const listComments = vi.fn().mockResolvedValue({ data: [comment1, comment2] })
      const createComment = vi.fn().mockResolvedValue({})
      const updateComment = vi.fn().mockResolvedValue({})

      mockOctokit = {
        ...mockOctokit,
        rest: {
          ...mockOctokit.rest,
          issues: { listComments, createComment, updateComment },
        },
      } as unknown as Octokit

      // Run for first path
      await run(
        { path: 'db/changelog', config: '', version: 'latest', failOnCritical: false, prCommentEnabled: true },
        mockOctokit,
        prContext,
      )

      // Run for second path
      await run(
        { path: 'db/other', config: '', version: 'latest', failOnCritical: false, prCommentEnabled: true },
        mockOctokit,
        prContext,
      )

      expect(updateComment).toHaveBeenCalledTimes(2)
      const calls = vi.mocked(updateComment).mock.calls.map((c) => c[0] as { comment_id: number })
      expect(calls.map((c) => c.comment_id).sort()).toEqual([11, 22])
      expect(createComment).not.toHaveBeenCalled()
    })
  })
})
