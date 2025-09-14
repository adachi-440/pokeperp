// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
import { TestUSDC } from "../src/token/TestUSDC.sol";
import { IERC20 } from "forge-std/src/interfaces/IERC20.sol";

contract IntegrationOrderFlowTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracleAdapter oracle;
    TestUSDC token;

    uint256 constant ONE = 1e18;
    address maker = address(0x111);
    address taker = address(0x222);

    function setUp() public {
        oracle = new MockOracleAdapter(1500e18);
        token = new TestUSDC("Test USDC", "TUSDC", 6);
        vault = new Vault(IRiskEngine(address(0)), IERC20(address(token)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));

        // fund both with tokens and approvals
        token.mint(maker, 10000 * ONE);
        token.mint(taker, 10000 * ONE);

        vm.prank(maker);
        token.approve(address(vault), 10000 * ONE);
        vm.prank(taker);
        token.approve(address(vault), 10000 * ONE);

        vm.startPrank(maker);
        vault.deposit(10_000 * ONE);
        vm.stopPrank();
        vm.startPrank(taker);
        vault.deposit(10_000 * ONE);
        vm.stopPrank();
    }

    function test_sequential_fills_keep_consistency() public {
        // Simulate orderbook matching across multiple steps at same tick
        for (uint256 i = 0; i < 5; i++) {
            perp.applyFill(taker, maker, 1500, 2); // taker buys 2 each step
        }
        (int256 sT,) = perp.positions(taker);
        (int256 sM,) = perp.positions(maker);
        assertEq(sT, 10);
        assertEq(sM, -10);

        // Change oracle, continue fills; state remains consistent
        oracle.setPrices(1499e18, 1499e18);
        perp.applyFill(maker, taker, 1500, 4); // maker buys 4 back (reduces short)
        (sT,) = perp.positions(taker);
        (sM,) = perp.positions(maker);
        assertEq(sT, 6);
        assertEq(sM, -6);
    }
}
