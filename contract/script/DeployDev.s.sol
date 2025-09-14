// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { BaseScript } from "./Base.s.sol";
import { console2 } from "forge-std/src/console2.sol";

// Core contracts
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { OrderBookMVP } from "../src/orderbook/OrderBookMVP.sol";

// Oracle contracts
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";

// Settlement hooks
import { SettlementHookImpl } from "../src/test/SettlementHookImpl.sol";

// Token contracts
import { TestUSDC } from "../src/token/TestUSDC.sol";

/**
 * @title DeployDev
 * @dev Lightweight deployment script for development and testing
 *
 * This script deploys a minimal working setup with:
 * - MockOracleAdapter for easy price manipulation
 * - Lower margin requirements for easier testing
 * - Pre-funded test accounts
 * - All contracts optimized for development workflow
 */
contract DeployDev is BaseScript {

    // Test accounts
    address public constant ALICE = address(0x1111);
    address public constant BOB = address(0x2222);
    address public constant CHARLIE = address(0x3333);

    function run() external broadcast {
        console2.log("=== PokePERP Development Deployment ===");
        console2.log("Deployer address:", broadcaster);

        // Deploy contracts
        address oracle = deployOracle();
        (address vault, address riskEngine, address perpEngine) = deployCore(oracle);
        (address orderBook, address settlementHook) = deployOrderBook(perpEngine, oracle);
        address usdc = deployToken();

        // Output for easy testing
        outputTestingInfo(oracle, vault, riskEngine, perpEngine, orderBook, settlementHook, usdc);

        // Output JSON format for programmatic use
        outputJSON(oracle, vault, riskEngine, perpEngine, orderBook, settlementHook, usdc);

        console2.log("=== Development Deployment Completed ===");
    }

    function deployOracle() internal returns (address) {
        uint256 initialPrice = 2000e18;
        MockOracleAdapter oracle = new MockOracleAdapter(initialPrice);
        console2.log("MockOracleAdapter deployed:", address(oracle));
        return address(oracle);
    }

    function deployCore(address oracle) internal returns (address, address, address) {
        uint256 initialMarginRate = 0.05e18; // 5% (lower for testing)
        uint256 maintenanceMarginRate = 0.025e18; // 2.5%
        uint256 maxLeverage = 20e18; // 20x leverage
        uint256 tickSize = 1e18;
        uint256 contractSize = 1e18;

        // Deploy Core Infrastructure
        Vault vault = new Vault(RiskEngine(address(0)));
        console2.log("Vault deployed:", address(vault));

        RiskEngine riskEngine = new RiskEngine(
            vault,
            MockOracleAdapter(oracle),
            IPerpPositions(address(0)),
            initialMarginRate,
            maintenanceMarginRate,
            maxLeverage
        );
        console2.log("RiskEngine deployed:", address(riskEngine));

        vault.setRisk(riskEngine);

        PerpEngine perpEngine = new PerpEngine(
            vault,
            riskEngine,
            MockOracleAdapter(oracle),
            tickSize,
            contractSize
        );
        console2.log("PerpEngine deployed:", address(perpEngine));

        vault.setPerp(address(perpEngine));
        riskEngine.setLinks(vault, MockOracleAdapter(oracle), IPerpPositions(address(perpEngine)));

        return (address(vault), address(riskEngine), address(perpEngine));
    }

    function deployOrderBook(address perpEngine, address oracle) internal returns (address, address) {
        uint256 minQty = 1e17; // 0.1 units (smaller for testing)
        uint256 minNotional = 10e18; // 10 dollars (smaller for testing)
        uint256 deviationLimit = 10e16; // 10% (higher tolerance for testing)

        OrderBookMVP orderBook = new OrderBookMVP(
            minQty,
            minNotional,
            deviationLimit,
            oracle
        );
        console2.log("OrderBook deployed:", address(orderBook));

        SettlementHookImpl settlementHook = new SettlementHookImpl(perpEngine);
        orderBook.setSettlementHook(address(settlementHook));
        console2.log("SettlementHook deployed and linked:", address(settlementHook));

        return (address(orderBook), address(settlementHook));
    }

    function deployToken() internal returns (address) {
        TestUSDC usdc = new TestUSDC("Test USD Coin", "USDC", 6);
        console2.log("TestUSDC deployed:", address(usdc));
        return address(usdc);
    }

    function setupTestAccounts(Vault vault, TestUSDC usdc) internal {
        console2.log("\n--- Setting up test accounts ---");

        address[3] memory testUsers = [ALICE, BOB, CHARLIE];
        string[3] memory userNames = ["Alice", "Bob", "Charlie"];

        for (uint i = 0; i < 3; i++) {
            // Give ETH for gas
            vm.deal(testUsers[i], 100 ether);

            // Mint USDC as deployer (owner), then transfer
            usdc.mint(broadcaster, 100000e6); // Mint to deployer first

            // Transfer USDC to test user
            vm.startPrank(broadcaster);
            TestUSDC(usdc).transfer(testUsers[i], 100000e6);
            vm.stopPrank();

            // Deposit collateral to vault (as test user)
            vm.startPrank(testUsers[i]);
            vault.deposit(10000 ether);
            vm.stopPrank();

            console2.log(string(abi.encodePacked(userNames[i], " (", vm.toString(testUsers[i]), "):")));
            console2.log("  - ETH balance: 100 ETH");
            console2.log("  - USDC balance: 100,000 USDC");
            console2.log("  - Vault balance: 10,000 collateral");
        }
    }

    function outputTestingInfo(
        address oracle,
        address vault,
        address riskEngine,
        address perpEngine,
        address orderBook,
        address settlementHook,
        address usdc
    ) internal view {
        console2.log("\n=== TESTING INFORMATION ===");
        console2.log("Contract addresses:");
        console2.log("  Oracle:", oracle);
        console2.log("  Vault:", vault);
        console2.log("  RiskEngine:", riskEngine);
        console2.log("  PerpEngine:", perpEngine);
        console2.log("  OrderBook:", orderBook);
        console2.log("  SettlementHook:", settlementHook);
        console2.log("  TestUSDC:", usdc);

        console2.log("\nTest accounts (pre-funded):");
        console2.log("  Alice:", ALICE);
        console2.log("  Bob:", BOB);
        console2.log("  Charlie:", CHARLIE);

        console2.log("\nUseful commands for testing:");
        console2.log("# Update oracle price:");
        console2.log("cast send", oracle, '"setPrices(uint256,uint256)" 2100e18 2100e18');

        console2.log("# Place buy order (as Alice):");
        console2.log("cast send --from", ALICE, orderBook, '"place(bool,int256,uint256)" true 2000 1e18');

        console2.log("# Place sell order (as Bob):");
        console2.log("cast send --from", BOB, orderBook, '"place(bool,int256,uint256)" false 2000 1e18');

        console2.log("# Execute matching:");
        console2.log("cast send", orderBook, '"matchAtBest(uint256)" 10');

        console2.log("# Check position (Alice):");
        console2.log("cast call", perpEngine, '"positions(address)(int256,int256)"', ALICE);
    }

    function outputJSON(
        address oracle,
        address vault,
        address riskEngine,
        address perpEngine,
        address orderBook,
        address settlementHook,
        address usdc
    ) internal view {
        console2.log("\n=== DEPLOYMENT JSON OUTPUT ===");
        console2.log("{");
        console2.log('  "network": "local",');
        console2.log('  "chainId": 31337,');
        console2.log('  "deployer": "', broadcaster, '",');
        console2.log('  "contracts": {');
        console2.log('    "oracle": "', oracle, '",');
        console2.log('    "vault": "', vault, '",');
        console2.log('    "riskEngine": "', riskEngine, '",');
        console2.log('    "perpEngine": "', perpEngine, '",');
        console2.log('    "orderBook": "', orderBook, '",');
        console2.log('    "settlementHook": "', settlementHook, '",');
        console2.log('    "testUSDC": "', usdc, '"');
        console2.log('  },');
        console2.log('  "timestamp": ', block.timestamp, ',');
        console2.log('  "blockNumber": ', block.number);
        console2.log("}");
    }
}