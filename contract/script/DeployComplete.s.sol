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
import { OracleAdapterSimple } from "../src/OracleAdapterSimple.sol";

// Settlement hooks
import { SettlementHookImpl } from "../src/test/SettlementHookImpl.sol";
import { BasicSettlementHook } from "../src/mocks/BasicSettlementHook.sol";

// Token contracts
import { TestUSDC } from "../src/token/TestUSDC.sol";

/**
 * @title DeployComplete
 * @dev Complete deployment script for the PokePERP trading system
 *
 * This script deploys all necessary contracts in the correct order with proper initialization:
 * 1. Oracle contracts (MockOracleAdapter for testing, OracleAdapterSimple for production)
 * 2. Core trading infrastructure (Vault, RiskEngine, PerpEngine)
 * 3. OrderBook with settlement hooks
 * 4. Test tokens (USDC)
 * 5. Proper linking and initialization of all contracts
 */
contract DeployComplete is BaseScript {

    // Deployment configuration
    struct DeployConfig {
        uint256 initialPrice;           // Initial oracle price (1e18 scale)
        uint256 initialMarginRate;      // Initial margin requirement (1e18 = 100%)
        uint256 maintenanceMarginRate;  // Maintenance margin requirement (1e18 = 100%)
        uint256 maxLeverage;           // Maximum leverage (1e18 = 1x) (deprecated)
        uint256 tickSize;              // Price granularity (1e18 scale)
        uint256 contractSize;          // Contract size in dollars (1e18 scale)
        uint256 minQty;                // Minimum order quantity
        uint256 minNotional;           // Minimum order notional value
        uint256 deviationLimit;        // Price deviation limit for orders
        bool useMockOracle;           // Whether to use MockOracle (true) or OracleAdapterSimple (false)
        address reporter;             // Reporter address for OracleAdapterSimple
        uint64 scale;                 // Scale for OracleAdapterSimple
        uint64 heartbeat;             // Heartbeat for OracleAdapterSimple
    }

    function run() external broadcast {
        DeployConfig memory config = getDeployConfig();

        console2.log("=== PokePERP Complete Deployment ===");
        console2.log("Deployer address:", broadcaster);
        console2.log("Use mock oracle:", config.useMockOracle);

        // Step 1: Deploy Oracle
        address oracle = deployOracle(config);

        // Step 2: Deploy Core Infrastructure
        (Vault vault, RiskEngine riskEngine, PerpEngine perpEngine) = deployCoreInfrastructure(oracle, config);

        // Step 3: Deploy OrderBook with Settlement Hook
        (OrderBookMVP orderBook, SettlementHookImpl settlementHook) = deployOrderBook(perpEngine, config);

        // Step 4: Deploy Test Token
        TestUSDC usdc = deployTestToken();

        // Step 5: Final Setup and Verification
        finalSetup(vault, riskEngine, perpEngine, orderBook, oracle);

        // Output deployment addresses
        outputDeploymentInfo(vault, riskEngine, perpEngine, orderBook, oracle, address(settlementHook), address(usdc));

        // Output JSON format for programmatic use
        outputJSON(vault, riskEngine, perpEngine, orderBook, oracle, address(settlementHook), address(usdc));

        console2.log("=== Deployment Completed Successfully ===");
    }

    function getDeployConfig() internal view returns (DeployConfig memory) {
        // Check deployment environment (dev or prod)
        string memory deployEnv = vm.envOr("DEPLOY_ENV", string("dev"));
        bool isDev = keccak256(bytes(deployEnv)) == keccak256(bytes("dev"));

        if (isDev) {
            // Development configuration - easier testing
            return DeployConfig({
                initialPrice: vm.envOr("INITIAL_PRICE", uint256(2000e18)),
                initialMarginRate: vm.envOr("INITIAL_MARGIN_RATE", uint256(0.05e18)), // 5% (lower for testing)
                maintenanceMarginRate: vm.envOr("MAINTENANCE_MARGIN_RATE", uint256(0.025e18)), // 2.5%
                maxLeverage: vm.envOr("MAX_LEVERAGE", uint256(20e18)), // 20x (higher for testing)
                tickSize: vm.envOr("TICK_SIZE", uint256(1e18)),
                contractSize: vm.envOr("CONTRACT_SIZE", uint256(1e18)),
                minQty: vm.envOr("MIN_QTY", uint256(1e17)), // 0.1 units (smaller for testing)
                minNotional: vm.envOr("MIN_NOTIONAL", uint256(10e18)), // 10 dollars (smaller for testing)
                deviationLimit: vm.envOr("DEVIATION_LIMIT", uint256(10e16)), // 10% (higher tolerance for testing)
                useMockOracle: vm.envOr("USE_MOCK_ORACLE", true),
                reporter: vm.envOr("REPORTER", address(0)),
                scale: uint64(vm.envOr("SCALE", uint256(18))),
                heartbeat: uint64(vm.envOr("HEARTBEAT", uint256(3600))) // 1 hour
            });
        } else {
            // Production configuration - conservative settings
            return DeployConfig({
                initialPrice: vm.envOr("INITIAL_PRICE", uint256(2000e18)),
                initialMarginRate: vm.envOr("INITIAL_MARGIN_RATE", uint256(0.1e18)), // 10%
                maintenanceMarginRate: vm.envOr("MAINTENANCE_MARGIN_RATE", uint256(0.05e18)), // 5%
                maxLeverage: vm.envOr("MAX_LEVERAGE", uint256(10e18)), // 10x
                tickSize: vm.envOr("TICK_SIZE", uint256(1e18)),
                contractSize: vm.envOr("CONTRACT_SIZE", uint256(1e18)),
                minQty: vm.envOr("MIN_QTY", uint256(1e18)),
                minNotional: vm.envOr("MIN_NOTIONAL", uint256(100e18)),
                deviationLimit: vm.envOr("DEVIATION_LIMIT", uint256(5e16)), // 5%
                useMockOracle: vm.envOr("USE_MOCK_ORACLE", false),
                reporter: vm.envOr("REPORTER", address(0)),
                scale: uint64(vm.envOr("SCALE", uint256(18))),
                heartbeat: uint64(vm.envOr("HEARTBEAT", uint256(3600))) // 1 hour
            });
        }
    }

    function deployOracle(DeployConfig memory config) internal returns (address oracle) {
        console2.log("\n--- Deploying Oracle ---");

            OracleAdapterSimple realOracle = new OracleAdapterSimple(0xED16e8284c84f089DE76C9C496BEfAFCd7c5CDd1, config.scale, config.heartbeat);
            oracle = address(realOracle);
            console2.log("OracleAdapterSimple deployed:", oracle);
    }

    function deployCoreInfrastructure(address oracle, DeployConfig memory config)
        internal
        returns (Vault vault, RiskEngine riskEngine, PerpEngine perpEngine)
    {
        console2.log("\n--- Deploying Core Infrastructure ---");

        // Deploy Vault first (with placeholder RiskEngine address)
        vault = new Vault(RiskEngine(address(0)));
        console2.log("Vault deployed:", address(vault));

        // Deploy RiskEngine (with placeholder PerpPositions address)
        riskEngine = new RiskEngine(
            vault,
            MockOracleAdapter(oracle),
            IPerpPositions(address(0)),
            config.initialMarginRate,
            config.maintenanceMarginRate,
            // contractSize must be passed here; previously maxLeverage was mistakenly used
            config.contractSize
        );
        console2.log("RiskEngine deployed:", address(riskEngine));

        // Set RiskEngine in Vault
        vault.setRisk(riskEngine);

        // Deploy PerpEngine
        perpEngine = new PerpEngine(
            vault,
            riskEngine,
            MockOracleAdapter(oracle),
            config.tickSize,
            config.contractSize
        );
        console2.log("PerpEngine deployed:", address(perpEngine));

        // Set PerpEngine in Vault
        vault.setPerp(address(perpEngine));

        // Complete RiskEngine linking
        riskEngine.setLinks(vault, MockOracleAdapter(oracle), IPerpPositions(address(perpEngine)));
    }

    function deployOrderBook(PerpEngine perpEngine, DeployConfig memory config)
        internal
        returns (OrderBookMVP orderBook, SettlementHookImpl settlementHook)
    {
        console2.log("\n--- Deploying OrderBook and Settlement Hook ---");

        // Deploy OrderBook
        orderBook = new OrderBookMVP(
            config.minQty,
            config.minNotional,
            config.deviationLimit,
            address(perpEngine.oracle()) // Get oracle address from PerpEngine
        );
        console2.log("OrderBookMVP deployed:", address(orderBook));

        // Deploy Settlement Hook
        settlementHook = new SettlementHookImpl(address(perpEngine));
        console2.log("SettlementHookImpl deployed:", address(settlementHook));

        // Link Settlement Hook to OrderBook
        orderBook.setSettlementHook(address(settlementHook));
    }

    function deployTestToken() internal returns (TestUSDC usdc) {
        console2.log("\n--- Deploying Test Token ---");

        usdc = new TestUSDC("Test USD Coin", "USDC", 6);
        console2.log("TestUSDC deployed:", address(usdc));

        // Mint some initial tokens to deployer for testing
        usdc.mint(broadcaster, 1000000e6); // 1M USDC
    }

    function finalSetup(
        Vault vault,
        RiskEngine riskEngine,
        PerpEngine perpEngine,
        OrderBookMVP orderBook,
        address oracle
    ) internal view {
        console2.log("\n--- Final Setup and Verification ---");

        // Verify all links are properly set
        require(address(vault.risk()) == address(riskEngine), "Vault-RiskEngine link failed");
        require(vault.perp() == address(perpEngine), "Vault-PerpEngine link failed");
        require(address(riskEngine.vault()) == address(vault), "RiskEngine-Vault link failed");
        require(address(riskEngine.oracle()) == oracle, "RiskEngine-Oracle link failed");
        require(address(riskEngine.perp()) == address(perpEngine), "RiskEngine-PerpEngine link failed");
        require(address(perpEngine.vault()) == address(vault), "PerpEngine-Vault link failed");
        require(address(perpEngine.risk()) == address(riskEngine), "PerpEngine-RiskEngine link failed");
        require(address(perpEngine.oracle()) == oracle, "PerpEngine-Oracle link failed");
        // Settlement hook verification - cannot directly access struct members in require
        // The hook is set via setSettlementHook() call above

    }

    function outputDeploymentInfo(
        Vault vault,
        RiskEngine riskEngine,
        PerpEngine perpEngine,
        OrderBookMVP orderBook,
        address oracle,
        address settlementHook,
        address usdc
    ) internal view {
        console2.log("\n=== DEPLOYMENT ADDRESSES ===");
        console2.log("Oracle:", oracle);
        console2.log("Vault:", address(vault));
        console2.log("RiskEngine:", address(riskEngine));
        console2.log("PerpEngine:", address(perpEngine));
        console2.log("OrderBook:", address(orderBook));
        console2.log("SettlementHook:", settlementHook);
        console2.log("TestUSDC:", usdc);
        console2.log("Deployer:", broadcaster);
    }

    function outputJSON(
        Vault vault,
        RiskEngine riskEngine,
        PerpEngine perpEngine,
        OrderBookMVP orderBook,
        address oracle,
        address settlementHook,
        address usdc
    ) internal view {
        console2.log("\n=== DEPLOYMENT JSON OUTPUT ===");
        console2.log("{");
        console2.log('  "network": "', getNetworkName(), '",');
        console2.log('  "chainId": ', block.chainid, ',');
        console2.log('  "deployer": "', broadcaster, '",');
        console2.log('  "contracts": {');
        console2.log('    "oracle": "', oracle, '",');
        console2.log('    "vault": "', address(vault), '",');
        console2.log('    "riskEngine": "', address(riskEngine), '",');
        console2.log('    "perpEngine": "', address(perpEngine), '",');
        console2.log('    "orderBook": "', address(orderBook), '",');
        console2.log('    "settlementHook": "', settlementHook, '",');
        console2.log('    "testUSDC": "', usdc, '"');
        console2.log('  },');
        console2.log('  "timestamp": ', block.timestamp, ',');
        console2.log('  "blockNumber": ', block.number);
        console2.log("}");
    }

    function getNetworkName() internal view returns (string memory) {
        uint256 chainId = block.chainid;
        if (chainId == 1) return "mainnet";
        if (chainId == 11155111) return "sepolia";
        if (chainId == 42161) return "arbitrum";
        if (chainId == 421614) return "arbitrum_sepolia";
        if (chainId == 31337) return "local";
        return "unknown";
    }
}
