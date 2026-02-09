# Liquibase Linter Action

A GitHub Action that runs [liquibase-linter](https://github.com/n2jsoft-public-org/liquibase-linter) on your Liquibase changelogs and creates inline annotations on pull requests for any violations found.

## Features

- 🔒 **Security First**: Detects SQL injection risks, hardcoded credentials, and dangerous operations
- ✨ **Inline Annotations**: Violations appear directly on pull request file diffs at the exact line
- � **PR Comments**: Summary comment in pull request conversation (updated on each run)
- �📊 **Rich Check Reports**: Detailed summary with violation counts by severity
- ⚡ **Fast**: Built on Go-based liquibase-linter for optimal performance
- 🔧 **Configurable**: Supports custom configuration files and rule settings
- 🎯 **Smart Failing**: Optionally fail workflows only on critical violations

## Usage

### Basic Example

Add this workflow to your repository at `.github/workflows/liquibase-lint.yml`:

```yaml
name: Liquibase Linting

on:
  pull_request:
    paths:
      - 'db/**'
  push:
    branches:
      - main

jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Liquibase Linter
        uses: n2jsoft-public-org/liquibase-linter-action@v1
        with:
          path: db/changelog
```

### Advanced Example with Configuration

```yaml
name: Liquibase Linting

on:
  pull_request:

jobs:
  lint:
    runs-on: ubuntu-latest
    permissions:
      contents: read
      checks: write
      pull-requests: write
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Liquibase Linter
        uses: n2jsoft-public-org/liquibase-linter-action@v1
        with:
          path: db/changelog
          config: .liquibase-linter.yaml
          version: v0.0.1
          fail-on-critical: true
```

## Inputs

| Name                 | Required | Default               | Description                                                                                                               |
| -------------------- | -------- | --------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `path`               | No       | `.`                   | Directory or file to check. Defaults to repository root.                                                                  |
| `config`             | No       |                       | Path to `.liquibase-linter.yaml` configuration file (optional). If not specified, linter will auto-discover config files. |
| `version`            | No       | `v0.0.2`              | Version of liquibase-linter to use (e.g., `v0.0.2` or `latest`).                                                          |
| `fail-on-critical`   | No       | `true`                | Whether to fail the workflow on critical violations. Set to `false` for annotation-only mode.                             |
| `pr-comment-enabled` | No       | `true`                | Whether to post/update PR comments with summary. Set to `false` to disable (requires `pull-requests: write` permission).  |
| `token`              | No       | `${{ github.token }}` | GitHub token for creating check runs. Automatically provided.                                                             |

## Permissions

This action requires the following permissions:

```yaml
permissions:
  contents: read        # To checkout code
  checks: write         # To create check runs with annotations
  pull-requests: write  # To post/update PR comments
```

**Note**: The `pull-requests: write` permission is required for posting summary comments to pull requests. If you only want check run annotations, you can omit this permission (the action will skip PR comments gracefully).

## Configuration

You can customize linter behavior by creating a `.liquibase-linter.yaml` file in your repository:

```yaml
rules:
  sql-injection:
    enabled: true
    severity: critical
  hardcoded-credentials:
    enabled: true
    severity: critical
  missing-rollback:
    enabled: true
    severity: warning
  naming-conventions:
    enabled: true
    severity: info

ignore:
  - "test/fixtures/*.xml"
  - "db/changelog/legacy/**"

severity_threshold: warning
```

For complete configuration options, see the [liquibase-linter configuration guide](https://github.com/n2jsoft-public-org/liquibase-linter/blob/main/docs/configuration.md).

## Available Rules

Liquibase-linter includes rules for:

- **Security**: SQL injection, hardcoded credentials, dangerous operations, privilege escalation
- **Reliability**: Missing rollbacks, non-idempotent changes, missing preconditions
- **Performance**: Missing indexes, table locks, large data operations
- **Best Practices**: Naming conventions, changelog organization, documentation

See the [rules reference](https://github.com/n2jsoft-public-org/liquibase-linter/blob/main/docs/rules.md) for details.

## Example Output

When violations are found, they appear as inline annotations on your pull request:

```
db/changelog/001.xml

🔴 sql-injection (changeset: create-user-1)
Line 15: Potential SQL injection: String concatenation detected in SQL statement
Use parameterized queries or Liquibase's built-in change types instead.

⚠️  missing-rollback
Line 10: Changeset does not include a rollback script
Add a <rollback> block to enable safe rollback of this change.
```

**Pull Request Comment**: A summary comment is posted to the PR conversation showing violation counts by severity:

| Severity   | Count |
| ---------- | ----- |
| 🔴 Critical | **2** |
| ⚠️  Warning | **5** |
| ℹ️  Info    | **1** |
| **Total**  | **8** |

The comment is automatically updated on subsequent runs (no duplicate comments).

**Check Run Summary**: A detailed check run is also created showing:
- Files checked
- Total violations
- Breakdown by severity (critical, warning, info)

## Development

### Setup

```bash
pnpm install
```

### Run Tests

```bash
pnpm test
```

### Build

```bash
pnpm run build
```

This compiles TypeScript and bundles the action with `@vercel/ncc`.

## License

MIT License - see [LICENSE](LICENSE) for details.

## About

Built with ❤️ by [n2jsoft](https://github.com/n2jsoft)

For issues and questions about:
- This action: [liquibase-linter-action issues](https://github.com/n2jsoft-public-org/liquibase-linter-action/issues)
- The linter itself: [liquibase-linter issues](https://github.com/n2jsoft-public-org/liquibase-linter/issues)
