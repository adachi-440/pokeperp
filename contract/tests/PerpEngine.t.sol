// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine } from "../src/risk/RiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracle } from "../src/mocks/MockOracle.sol";

contract PerpEngineTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracle oracle;

    uint256 constant ONE = 1e18;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        oracle = new MockOracle(1000e18);
        vault = new Vault(RiskEngine(address(0)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));

        vm.startPrank(alice); vault.deposit(10_000 * ONE); vm.stopPrank();
        vm.startPrank(bob); vault.deposit(10_000 * ONE); vm.stopPrank();
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
        oracle.setPrice(1000e18); // mark = 1000
        perp.applyFill(bob, alice, 1200, 6); // alice sells 6 to bob at 1200

        // Alice: realized = 6 * (1200-1000) = +1200; balance increased
        assertEq(vault.balanceOf(alice), 10_000 * ONE + 1_200 * ONE);
        (int256 size, int256 entryNotional) = perp.positions(alice);
        assertEq(size, 4);
        // remaining 4 at original avg 1000
        int256 avg = entryNotional / size;
        assertEq(uint256(avg), 1000e18);

        // Now sell 10 @ 800 (flip to short 6). Realize -(4*(800-1000)) = -800
        perp.applyFill(bob, alice, 800, 10);
        assertEq(vault.balanceOf(alice), 10_000 * ONE + 1_200 * ONE - 800 * ONE);
        (size, entryNotional) = perp.positions(alice);
        assertEq(size, -6);
        avg = entryNotional / size; // short avg = 800
        assertEq(uint256(avg), 800e18);
    }

    function test_health_reverts_below_mmr() public {
        // Tight balances to trigger MM breach
        vm.startPrank(alice); vault.deposit(100 * ONE); vm.stopPrank();
        vm.startPrank(bob); vault.deposit(100 * ONE); vm.stopPrank();

        // set high mmr to 50% to make margin tight
        risk.setParams(0.6e18, 0.5e18, 1e18);
        // notional 500, mm=250; equity=100 → should revert
        vm.expectRevert();
        perp.applyFill(alice, bob, 500, 1);
    }
}

