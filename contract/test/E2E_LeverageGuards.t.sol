// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test, console2 } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
// Note: OrderBook pathは使わず、直接PerpEngine.applyFillで検証する

contract E2ELeverageGuardsTest is Test {
    // Core contracts
    Vault vault;
    RiskEngine riskEngine;
    PerpEngine perpEngine;
    MockOracleAdapter oracle;
    // OrderBookは未使用

    // Test accounts
    address buyer = address(0x1111);
    address seller = address(0x2222);

    // Constants
    uint256 constant ONE = 1e18;
    uint256 constant INITIAL_PRICE = 2000e18;

    function setUp() public {
        // Deploy oracle and core
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        vault = new Vault(IRiskEngine(address(0)));
        // default 10x/5% settings; individual tests may update via setParams
        riskEngine = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(riskEngine);
        perpEngine = new PerpEngine(vault, riskEngine, oracle, 1e18, 1e18);
        vault.setPerp(address(perpEngine));
        riskEngine.setLinks(vault, oracle, IPerpPositions(address(perpEngine)));

        // OrderBookは使用しない

        // Fund gas for EOA addresses
        vm.deal(buyer, 1000 ether);
        vm.deal(seller, 1000 ether);
    }

    function _depositBoth(uint256 amount) internal {
        vm.startPrank(buyer);
        vault.deposit(amount);
        vm.stopPrank();
        vm.startPrank(seller);
        vault.deposit(amount);
        vm.stopPrank();
    }

    function _open(address _buyer, address _seller, uint256 priceTick, uint256 qty) internal {
        // 片側ずつではなく、双方向の約定として直接適用
        perpEngine.applyFill(_buyer, _seller, priceTick, qty);
    }

    // 10x シナリオ: IMR=10%, MMR=5%
    function test_E2E_LeverageFlow_10x() public {
        // Ensure RiskEngine uses contractSize=1 for clean 1e18 scaling
        riskEngine.setParams(0.1e18 /* 10% */, 0.05e18 /* 5% */, 1);

        // Deposit collateral
        _depositBoth(1000 * ONE);

        // Target 10x: notional = 10,000 → size = 5 @ $2000
        int256 price = 2000; // tick price (not scaled)
        uint256 qty = 5 * ONE;

        // 直接約定適用
        _open(buyer, seller, uint256(int256(price)), qty);
        (int256 buyerPos,) = perpEngine.positions(buyer);
        assertEq(buyerPos, int256(qty), "buyer size must equal qty");

        // Post conditions at entry (mark == entry)
        assertEq(riskEngine.initialMargin(buyer), 1000 * ONE, "IM should equal collateral at 10x");
        assertEq(riskEngine.maintenanceMargin(buyer), 500 * ONE, "MM at 5%");
        assertEq(riskEngine.equity(buyer), int256(1000 * ONE), "equity intact at entry");

        // Withdraw should revert due to IM guard
        vm.startPrank(buyer);
        vm.expectRevert();
        vault.withdraw(1 * ONE);
        vm.stopPrank();

        // Try to increase position by 1 (→ notional 12k, IM=1.2k > equity)
        vm.expectRevert();
        _open(buyer, seller, uint256(int256(price)), 1 * ONE);
    }

    // 5x シナリオ: IMR=20%, MMR=10%
    function test_E2E_LeverageFlow_5x() public {
        // Update risk params: onlyOwner is the test contract which deployed RiskEngine
        riskEngine.setParams(0.2e18 /* 20% */, 0.1e18 /* 10% */, 1);

        // Deposit collateral
        _depositBoth(1000 * ONE);

        // Target 5x: notional = 5,000 → size = 2.5 @ $2000
        int256 price = 2000; // tick price
        uint256 qty = 25e17; // 2.5 * 1e18

        // 直接約定適用
        _open(buyer, seller, uint256(int256(price)), qty);
        (int256 buyerPos,) = perpEngine.positions(buyer);
        assertEq(buyerPos, int256(qty), "buyer size must equal qty (5x)");

        // Post conditions at entry
        assertEq(riskEngine.initialMargin(buyer), 1000 * ONE, "IM should equal collateral at 5x");
        assertEq(riskEngine.maintenanceMargin(buyer), 500 * ONE, "MM at 10% of 5k = 500");
        assertEq(riskEngine.equity(buyer), int256(1000 * ONE), "equity intact at entry");

        // Withdraw should revert due to IM guard
        vm.startPrank(buyer);
        vm.expectRevert();
        vault.withdraw(1 * ONE);
        vm.stopPrank();

        // Try to increase position by 0.5 → notional 6k, IM=1.2k > equity(1k)
        vm.expectRevert();
        _open(buyer, seller, uint256(int256(price)), 5e17);
    }
}
