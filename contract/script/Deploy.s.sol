// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import "forge-std/src/Script.sol";
import "../src/vault/Vault.sol";
import "../src/risk/RiskEngine.sol";
import "../src/perp/PerpEngine.sol";
import "../src/orderbook/OrderBookMVP.sol";
import "../src/mocks/MockOracleAdapter.sol";
import "../src/test/SettlementHookImpl.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { IPerpPositions } from "../src/risk/RiskEngine.sol";

contract DeployScript is Script {
    function run() external {
        // Use default anvil private key if not set
        uint256 deployerPrivateKey = vm.envOr("PRIVATE_KEY", uint256(0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80));
        vm.startBroadcast(deployerPrivateKey);

        // Deploy Oracle with initial price of 2000
        uint256 initialPrice = 2000e18;
        MockOracleAdapter oracle = new MockOracleAdapter(initialPrice);
        console.log("Oracle deployed at:", address(oracle));

        // Deploy Vault
        Vault vault = new Vault(IRiskEngine(address(0)));
        console.log("Vault deployed at:", address(vault));

        // Deploy RiskEngine with 1% initial margin and 0.5% maintenance margin
        RiskEngine riskEngine = new RiskEngine(
            vault,
            oracle,
            IPerpPositions(address(0)),
            0.01e18,  // 1% initial margin
            0.005e18, // 0.5% maintenance margin
            1e18      // leverage factor
        );
        console.log("RiskEngine deployed at:", address(riskEngine));

        // Link Vault to RiskEngine
        vault.setRisk(riskEngine);

        // Deploy PerpEngine
        PerpEngine perpEngine = new PerpEngine(
            vault,
            riskEngine,
            oracle,
            1e18, // tickSize
            1e18  // contractSize
        );
        console.log("PerpEngine deployed at:", address(perpEngine));

        // Link Vault to PerpEngine
        vault.setPerp(address(perpEngine));

        // Link RiskEngine to PerpEngine
        riskEngine.setLinks(vault, oracle, IPerpPositions(address(perpEngine)));

        // Deploy OrderBook
        OrderBookMVP orderBook = new OrderBookMVP(
            1e18,    // minQty
            100e18,  // minNotional
            5e16,    // deviationLimit (5%)
            address(oracle)
        );
        console.log("OrderBook deployed at:", address(orderBook));

        // Deploy and set SettlementHook
        SettlementHookImpl settlementHook = new SettlementHookImpl(address(perpEngine));
        console.log("SettlementHook deployed at:", address(settlementHook));

        orderBook.setSettlementHook(address(settlementHook));

        // Log all addresses for .env file
        console.log("\n=== Deployment Complete ===");
        console.log("Add these to your mmbot/.env file:");
        console.log(string(abi.encodePacked("ORDER_BOOK_ADDRESS=", vm.toString(address(orderBook)))));
        console.log(string(abi.encodePacked("VAULT_ADDRESS=", vm.toString(address(vault)))));
        console.log(string(abi.encodePacked("ORACLE_ADDRESS=", vm.toString(address(oracle)))));
        console.log("\nAdditional addresses:");
        console.log(string(abi.encodePacked("PERP_ENGINE_ADDRESS=", vm.toString(address(perpEngine)))));
        console.log(string(abi.encodePacked("RISK_ENGINE_ADDRESS=", vm.toString(address(riskEngine)))));

        vm.stopBroadcast();
    }
}