# Contributing to Vidralo

First off, thank you for considering contributing to Vidralo! It's people like you that make Vidralo such a great tool.

## Code of Conduct

This project and everyone participating in it is governed by respect and professionalism. Please be kind and courteous to others.

## How Can I Contribute?

### Reporting Bugs

Before creating bug reports, please check the existing issues to avoid duplicates. When you create a bug report, include as many details as possible:

- Use a clear and descriptive title
- Describe the exact steps to reproduce the problem
- Provide specific examples
- Describe the behavior you observed and what you expected
- Include screenshots if applicable
- Note your OS, Vidralo version, and system architecture

### Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion:

- Use a clear and descriptive title
- Provide a detailed description of the proposed feature
- Explain why this enhancement would be useful
- List any alternative solutions you've considered

### Pull Requests

1. **Fork the repository** and create your branch from `main`
2. **Make your changes** following our coding standards
3. **Test your changes** thoroughly
4. **Update documentation** if needed
5. **Write clear commit messages** following conventional commits format:
   - `feat:` for new features
   - `fix:` for bug fixes
   - `docs:` for documentation changes
   - `chore:` for maintenance tasks
   - `refactor:` for code refactoring
6. **Submit a pull request** with a clear description of your changes

## Development Setup

See the [Development section](README.md#development) in the README for setup instructions.

## Coding Standards

### TypeScript/React

- Use functional components with hooks
- Follow existing code style (use Prettier)
- Write meaningful variable and function names
- Add comments for complex logic
- Keep components focused and small

### Rust

- Follow Rust style guidelines (use `rustfmt`)
- Handle errors properly (no unwrap in production code)
- Write descriptive variable names
- Add documentation comments for public APIs
- Keep functions focused and small

### Git Commit Messages

- Use the present tense ("Add feature" not "Added feature")
- Use the imperative mood ("Move cursor to..." not "Moves cursor to...")
- Limit the first line to 72 characters or less
- Reference issues and pull requests liberally after the first line

## Project Structure

```
vidralo/
├── src/                    # React frontend
├── src-tauri/             # Rust backend
│   ├── src/               # Rust source code
│   └── binaries/          # Bundled executables
├── .github/               # GitHub workflows and templates
└── homebrew-tap/          # Homebrew Cask formula
```

## Testing

Before submitting a PR:

1. **Test on your platform**:

   ```bash
   npm run tauri dev
   ```

2. **Build the app**:

   ```bash
   npm run tauri build
   ```

3. **Test the built application** to ensure it works as expected

## Questions?

Feel free to open an issue with your question or reach out via GitHub Discussions.

## Recognition

Contributors will be recognized in the project. Thank you for your contributions!
