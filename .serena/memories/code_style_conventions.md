# Code Style and Conventions

## Solidity Code Style (from foundry.toml)
- Compiler version: 0.8.29
- EVM version: shanghai
- Optimizer enabled with 10,000 runs
- Formatting settings:
  - Bracket spacing: true
  - Line length: 120 characters
  - Tab width: 4 spaces
  - Double quotes for strings
  - Long integer types
  - Multiline function headers
  - Wrap comments enabled
  - Thousands underscore for numbers

## Linting and Formatting
- **Solidity**: Solhint configuration in `.solhint.json`
- **General**: Prettier for JSON, Markdown, YAML files
- **EditorConfig**: Configured for consistent editor settings

## File Structure Conventions
- `src/` - Main contract source code
- `test/` - Test files (note: using `test/` not `tests/`)  
- `script/` - Deployment and utility scripts
- `lib/` - Dependencies (though using Node.js packages instead of git submodules)

## Development Practices
- Use Bun for package management instead of git submodules for dependencies
- Follow OpenZeppelin patterns (pre-installed dependency)
- Gas optimization enabled
- Comprehensive testing with forge-std
- Documentation with NatSpec comments expected