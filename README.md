# Liquibase Linter GitHub Action

A GitHub Action that runs [liquibase-linter](https://github.com/n2jsoft-public-org/liquibase-linter) on your Liquibase changelogs and creates inline annotations on pull requests for any violations found.

## Features

- 🔍 **Automated Security Scanning** - Detects SQL injection, hardcoded credentials, and dangerous operations
- 📊 **Performance Analysis** - Identifies missing indexes, table locks, and large data operations  
- ✅ **Best Practices** - Enforces naming conventions, documentation requirements, and changelog organization
- 🎯 **PR Annotations** - Creates inline code comments on pull requests via GitHub Checks API
- ⚙️ **Highly Configurable** - Control which rules to run, severity thresholds, and failure conditions
- 🚀 **Fast & Efficient** - Written in Go for optimal performance
- 🌍 **Cross-Platform** - Works on Linux, macOS, and Windows runners

## Usage

### Basic Example

```yaml
name: Liquibase Lint

on:
  pull_request:
    paths:
      - 'db/changelog/**'

permissions:
  contents: read
  checks: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Liquibase Linter
        uses: n2jsoft-public-org/liquibase-linter-action@v1
        with:
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

### Advanced Example

```yaml
name: Liquibase Lint

on:
  pull_request:
    paths:
      - 'db/**'
  push:
    branches:
      - main

permissions:
  contents: read
  checks: write

jobs:
  lint:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      
      - name: Run Liquibase Linter
        uses: n2jsoft-public-org/liquibase-linter-action@v1
        with:
          version: v0.0.2
          directory: db/changelog
          config-file: .liquibase-linter.yaml
          severity-threshold: warning
          fail-on: critical
          github-token: ${{ secrets.GITHUB_TOKEN }}
          
      - name: Upload results
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: liquibase-linter-results
          path: liquibase-linter-results.json
```

### Multi-Directory Example

```yaml
name: Lint Multiple Directories

on:
  pull_request:

permissions:
  contents: read
  checks: write

jobs:
  lint:
    runs-on: ubuntu-latest
    strategy:
      matrix:
        directory:
          - db/changelog/app
          - db/changelog/auth
          - db/changelog/reporting
    steps:
      - uses: actions/checkout@v4
      
      - name: Lint ${{ matrix.directory }}
        uses: n2jsoft-public-org/liquibase-linter-action@v1
        with:
          directory: ${{ matrix.directory }}
          github-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Input                | Description                                                           | Required | Default            |
| -------------------- | --------------------------------------------------------------------- | -------- | ------------------ |
| `version`            | Version of liquibase-linter to use                                    | No       | `v0.0.2`           |
| `directory`          | Directory containing Liquibase changelogs                             | No       | `db/changelog`     |
| `config-file`        | Path to configuration file                                            | No       | _(auto-discovery)_ |
| `rules`              | Comma-separated list of rules to enable                               | No       | _(from config)_    |
| `severity-threshold` | Minimum severity to report (`info`, `warning`, `critical`)            | No       | `info`             |
| `fail-on`            | Severity that causes failure (`info`, `warning`, `critical`, `never`) | No       | `critical`         |
| `github-token`       | GitHub token for creating annotations                                 | **Yes**  | -                  |
| `annotate`           | Whether to create PR annotations                                      | No       | `true`             |
| `working-directory`  | Working directory to run in                                           | No       | `.`                |

## Outputs

| Output             | Description                                       |
| ------------------ | ------------------------------------------------- |
| `violations-found` | Whether violations were found (`true` or `false`) |
| `total-violations` | Total number of violations                        |
| `critical-count`   | Number of critical violations                     |
| `warning-count`    | Number of warning violations                      |
| `info-count`       | Number of info violations                         |
| `result-file`      | Path to JSON results file                         |

## Outputs Usage Example

```yaml
- name: Run Liquibase Linter
  id: linter
  uses: n2jsoft-public-org/liquibase-linter-action@v1
  with:
    github-token: ${{ secrets.GITHUB_TOKEN }}
    fail-on: never
    
- name: Check results
  run: |
    echo "Violations found: ${{ steps.linter.outputs.violations-found }}"
    echo "Total: ${{ steps.linter.outputs.total-violations }}"
    echo "Critical: ${{ steps.linter.outputs.critical-count }}"
    
- name: Comment on PR
  if: steps.linter.outputs.critical-count > 0
  run: |
    echo "❌ Found ${{ steps.linter.outputs.critical-count }} critical violations!"
```

## Configuration

### Configuration File

Create a `.liquibase-linter.yaml` file in your repository root:

```yaml
# Enable/disable rules
rules:
  sql-injection:
    enabled: true
    severity: critical
  hardcoded-credentials:
    enabled: true
    severity: critical
  dangerous-operations:
    enabled: true
    severity: critical
  missing-rollback:
    enabled: true
    severity: warning
  naming-conventions:
    enabled: true
    severity: info

# Ignore patterns
ignore:
  - "test/fixtures/*.xml"
  - "db/changelog/legacy/**"

# Output configuration
output:
  format: json
  colorize: false

# Severity threshold
severity_threshold: info
```

### Fail-On Behavior

The `fail-on` input controls when the action fails:

- `critical` (default) - Fails only on critical violations
- `warning` - Fails on warning or critical violations
- `info` - Fails on any violations
- `never` - Never fails (report only)

### Inline Rule Suppression

Suppress specific rules in changesets:

```xml
<changeSet id="legacy-migration" author="system">
  <comment>liquibase-linter:disable sql-injection,dangerous-operations</comment>
  <sql>
    -- Legacy SQL that can't be easily refactored
    ${dynamic_sql}
  </sql>
</changeSet>
```

## Permissions

The action requires the following permissions:

```yaml
permissions:
  contents: read      # Read repository contents
  checks: write       # Create check runs with annotations
```

For private repositories, you may also need:

```yaml
permissions:
  pull-requests: write  # For posting PR comments
```

## Violation Categories

### Security (Critical)
- `sql-injection` - SQL injection vulnerabilities
- `hardcoded-credentials` - Hardcoded passwords/secrets
- `dangerous-operations` - Unsafe DROP/TRUNCATE operations
- `privilege-escalation` - Excessive privilege grants

### Reliability (Warning)
- `missing-rollback` - Changesets without rollback scripts
- `non-idempotent` - Non-idempotent changes
- `missing-preconditions` - Risky operations without safety checks

### Performance (Warning/Info)
- `missing-indexes` - Missing indexes on foreign keys
- `table-locks` - Operations causing table locks
- `large-data-operations` - Unbounded data manipulation

### Best Practices (Info)
- `naming-conventions` - Inconsistent naming standards
- `changelog-organization` - Poor changelog structure
- `documentation` - Missing documentation

## Troubleshooting

### Action fails with "directory does not exist"

Ensure the directory path is relative to your working directory:

```yaml
- uses: n2jsoft-public-org/liquibase-linter-action@v1
  with:
    directory: db/changelog  # Not /db/changelog
```

### No annotations appear on PR

1. Verify permissions are set correctly:
   ```yaml
   permissions:
     checks: write
   ```

2. Check that the action ran on a pull request:
   ```yaml
   on:
     pull_request:
   ```

3. Ensure violations were found (check action logs)

### Action fails with "Failed to create annotations"

This usually means insufficient permissions. Add to your workflow:

```yaml
permissions:
  contents: read
  checks: write
  pull-requests: write
```

## Development

### Building

```bash
npm install
npm run build
```

### Testing Locally

```bash
# Set required environment variables
export INPUT_GITHUB-TOKEN=$GITHUB_TOKEN
export INPUT_DIRECTORY=db/changelog

# Run the action
node dist/index.js
```

## Contributing

Contributions are welcome! Please:

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Run `npm run all` to build, format, and lint
6. Commit dist/ changes (required for action to work)
7. Submit a pull request

## License

MIT

## Links

- [Liquibase Linter Repository](https://github.com/n2jsoft-public-org/liquibase-linter)
- [Liquibase Linter Documentation](https://github.com/n2jsoft-public-org/liquibase-linter/tree/main/docs)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)

## Support

- 🐛 [Report a bug](https://github.com/n2jsoft-public-org/liquibase-linter-action/issues)
- 💡 [Request a feature](https://github.com/n2jsoft-public-org/liquibase-linter-action/issues)
- 📖 [View documentation](https://github.com/n2jsoft-public-org/liquibase-linter/tree/main/docs)
