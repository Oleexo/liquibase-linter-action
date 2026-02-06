# Contributing to Liquibase Linter Action

Thank you for your interest in contributing! This document provides guidelines for contributing to this project.

## Code of Conduct

By participating in this project, you agree to maintain a respectful and collaborative environment.

## How to Contribute

### Reporting Bugs

Before creating a bug report:
1. Check the existing issues to avoid duplicates
2. Use the latest version of the action
3. Collect relevant information (logs, workflow files, etc.)

When creating a bug report, include:
- Clear description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Action version and runner OS
- Relevant workflow configuration
- Error messages or logs

### Suggesting Enhancements

Enhancement suggestions are welcome! Please:
1. Check if the feature has already been requested
2. Provide a clear use case
3. Explain why the enhancement would be useful
4. Consider backwards compatibility

### Pull Requests

1. **Fork the repository** and create a branch from `main`

2. **Make your changes**
   - Follow the existing code style
   - Add tests for new functionality
   - Update documentation as needed

3. **Test your changes**
   ```bash
   npm install
   npm run all
   ```

4. **Commit your changes**
   - Use clear, descriptive commit messages
   - Reference related issues

5. **Build the action**
   ```bash
   npm run build
   ```
   
   **Important**: You must commit the `dist/` directory! GitHub Actions run from the compiled code in `dist/`.

6. **Submit the pull request**
   - Provide a clear description of the changes
   - Reference any related issues
   - Explain the motivation and context

## Development Setup

### Prerequisites

- Node.js 20 or later
- npm 9 or later
- Git

### Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/liquibase-linter-action.git
cd liquibase-linter-action

# Install dependencies
npm install

# Build the action
npm run build

# Run linting and formatting
npm run lint
npm run format
```

### Project Structure

```
.
├── src/                 # TypeScript source files
│   ├── main.ts         # Entry point
│   ├── installer.ts    # Binary installation
│   ├── runner.ts       # Linter execution
│   ├── annotator.ts    # GitHub annotations
│   └── types.ts        # Type definitions
├── dist/               # Compiled JavaScript (must be committed!)
├── examples/           # Example workflows
├── .github/            # CI/CD workflows
│   └── workflows/
├── action.yml          # Action metadata
├── package.json        # Node.js dependencies
└── tsconfig.json       # TypeScript configuration
```

### Building

```bash
# Compile TypeScript and bundle
npm run build

# Just compile TypeScript
npx tsc

# Just bundle
npm run package
```

### Testing

```bash
# Run unit tests (when available)
npm test

# Test locally by setting environment variables
export INPUT_GITHUB-TOKEN=$GITHUB_TOKEN
export INPUT_DIRECTORY=test/fixtures
node dist/index.js
```

### Code Style

- **TypeScript**: We use TypeScript with strict mode enabled
- **Formatting**: Prettier with configuration in `.prettierrc.json`
- **Linting**: ESLint with TypeScript support
- **Line Length**: Maximum 100 characters

Run formatting and linting:
```bash
npm run format      # Auto-fix formatting
npm run lint        # Check for lint errors
```

## Commit Guidelines

### Commit Message Format

```
<type>: <subject>

<body>

<footer>
```

### Types

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes (formatting, etc.)
- `refactor`: Code refactoring
- `test`: Adding or updating tests
- `chore`: Maintenance tasks

### Examples

```
feat: add support for custom config file paths

Allow users to specify a custom path to the liquibase-linter
configuration file via the config-file input parameter.

Closes #123
```

```
fix: handle missing directory gracefully

Previously, the action would crash with an unclear error when
the target directory didn't exist. Now it fails early with a
helpful error message.
```

## Testing Your Changes

### Local Testing

1. Build your changes:
   ```bash
   npm run build
   ```

2. Create a test workflow in a separate repository:
   ```yaml
   - uses: YOUR_USERNAME/liquibase-linter-action@your-branch
     with:
       github-token: ${{ secrets.GITHUB_TOKEN }}
   ```

3. Test on multiple platforms if possible (Linux, macOS, Windows)

### Integration Testing

The action includes integration tests in `.github/workflows/test.yml`. These run automatically on pull requests.

## Release Process

Releases are managed by maintainers. The process:

1. Update version in `package.json`
2. Update `CHANGELOG.md`
3. Create a GitHub release with tag (e.g., `v1.2.3`)
4. Update major version tag (e.g., `v1`) to point to latest release

## Questions?

Feel free to:
- Open an issue for discussion
- Contact the maintainers
- Check existing issues and discussions

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
