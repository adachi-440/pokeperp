# Task Completion Checklist

When completing any development task in PokePerp, ensure the following steps are performed:

## Smart Contract Development
1. **Build**: Run `forge build` to compile contracts
2. **Format**: Run `forge fmt` to format Solidity code  
3. **Lint**: Run `bun run lint` to check code quality
4. **Test**: Run `forge test` to ensure all tests pass
5. **Gas Report**: Run `forge test --gas-report` to check gas optimization
6. **Coverage**: Consider running `forge coverage` for test coverage analysis

## Reporter Development  
1. **Type Check**: Ensure TypeScript compiles without errors
2. **Test**: Run reporter tests with `npm test`
3. **Format**: Ensure code follows project formatting standards

## General
1. **Clean Build**: Run `forge clean` and rebuild if encountering issues
2. **Environment**: Ensure all required environment variables are set
3. **Integration**: Test local E2E setup if making significant changes
4. **Documentation**: Update relevant documentation if needed

## Before Committing
- All linting passes
- All tests pass  
- Code is properly formatted
- No compilation errors
- Gas usage is reasonable for contract changes