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

contract PerpEngineTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracleAdapter oracle;
    TestUSDC token;

    uint256 constant ONE = 1e18;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        oracle = new MockOracleAdapter(1000e18);
        token = new TestUSDC("Test USDC", "TUSDC", 6);
        vault = new Vault(IRiskEngine(address(0)), IERC20(address(token)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));

        // fund both with tokens and approvals
        token.mint(alice, 10000 * ONE);
        token.mint(bob, 10000 * ONE);
        // Also fund test addresses used in other tests
        token.mint(address(0xDEAD), 10000 * ONE);
        token.mint(address(0xBEEF), 10000 * ONE);

        vm.prank(alice);
        token.approve(address(vault), 10000 * ONE);
        vm.prank(bob);
        token.approve(address(vault), 10000 * ONE);
        vm.prank(address(0xDEAD));
        token.approve(address(vault), 10000 * ONE);
        vm.prank(address(0xBEEF));
        token.approve(address(vault), 10000 * ONE);

        vm.startPrank(alice);
        vault.deposit(10_000 * ONE);
        vm.stopPrank();
        vm.startPrank(bob);
        vault.deposit(10_000 * ONE);
        vm.stopPrank();
    }

    function test_same_direction_averaging() public {
        perp.applyFill(alice, bob, 1000, 10); // long 10 @ 1000
        perp.applyFill(alice, bob, 1100, 10); // long +10 @ 1100

        (int256 size, int256 entryNotional) = perp.positions(alice);
        assertEq(size, 20);
        int256 avg = entryNotional / size; // expect (10*1000 + 10*1100)/20 = 1050
        assertEq(uint256(avg), 1050e18);
    }

    function test_opposite_trade_realize_pnl_and_reset_avg() public {
        // long 10 @ 1000, then sell 6 @ 1200
        perp.applyFill(alice, bob, 1000, 10);
        oracle.setPrices(1000e18, 1000e18); // mark = 1000
        perp.applyFill(bob, alice, 1200, 6); // alice sells 6 to bob at 1200

        // Alice: realized = 6 * (1200-1000) = +1200; balance increased
        assertEq(vault.balanceOf(alice), 10_000 * ONE + 1200 * ONE);
        (int256 size, int256 entryNotional) = perp.positions(alice);
        assertEq(size, 4);
        // remaining 4 at original avg 1000
        int256 avg = entryNotional / size;
        assertEq(uint256(avg), 1000e18);

        // Now sell 10 @ 800 (flip to short 6). Realize -(4*(800-1000)) = -800
        perp.applyFill(bob, alice, 800, 10);
        assertEq(vault.balanceOf(alice), 10_000 * ONE + 1200 * ONE - 800 * ONE);
        (size, entryNotional) = perp.positions(alice);
        assertEq(size, -6);
        avg = entryNotional / size; // short avg = 800
        assertEq(uint256(avg), 800e18);
    }

    function test_health_reverts_below_mmr() public {
        // Use new addresses to avoid setUp deposits
        address poorTrader = address(0xDEAD);
        address richTrader = address(0xBEEF);

        // Tight balances to trigger MM breach
        vm.startPrank(poorTrader);
        vault.deposit(50 * ONE);
        vm.stopPrank(); // Very small balance
        vm.startPrank(richTrader);
        vault.deposit(1000 * ONE);
        vm.stopPrank(); // Rich trader to cover other side

        // set high mmr to 80% to make margin tight
        risk.setParams(0.9e18, 0.8e18, 1e18);
        // Set mark price to match fill price for accurate margin calculation
        oracle.setPrices(500e18, 500e18);
        // notional = 1 * 500e18 * 1e18 / 1e18 = 500e18, mm = 500e18 * 0.8 = 400e18; equity=50 → should revert
        vm.expectRevert();
        perp.applyFill(poorTrader, richTrader, 500, 1);
    }
}
