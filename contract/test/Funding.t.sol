// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { IOracleAdapter } from "../src/interfaces/IOracleAdapter.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
import { OracleAdapterSimple } from "../src/OracleAdapterSimple.sol";

contract FundingTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracleAdapter oracle;

    uint256 constant ONE = 1e18;
    address alice = address(0xA11CE);
    address bob = address(0xB0B);

    function setUp() public {
        oracle = new MockOracleAdapter(2000e18);
        vault = new Vault(IRiskEngine(address(0)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));

        // fund
        vm.startPrank(alice);
        vault.deposit(1_000_000 * ONE);
        vm.stopPrank();
        vm.startPrank(bob);
        vault.deposit(1_000_000 * ONE);
        vm.stopPrank();

        // set smaller interval for faster tests
        vm.prank(perp.owner());
        perp.setFundingParams(8 hours, 0.005e18, 1e18, 1 days, 1); // min dust = 1 wei
    }

    function test_UpdateFunding_Skips_WhenNoOI_and_AdvanceTime() public {
        uint64 t0 = 1000;
        vm.warp(t0);
        uint64 before = perp.lastFundingTime();
        assertEq(before, 0);
        perp.updateFunding();
        assertEq(perp.lastFundingTime(), t0);
    }

    function test_Funding_Accumulates_And_Settles_ZeroSum() public {
        // open positions: Alice long 1, Bob short 1 @ 2000
        vm.warp(2000);
        perp.applyFill(alice, bob, 2000, 1);

        // Move time by one interval and set mark>index => prem>0 so longs pay
        vm.warp(2000 + 8 hours);
        // index 2000, mark 2100 (5%)
        oracle.setPrices(2000e18, 2100e18);

        // settle both
        int256 Fbefore = perp.cumulativeFundingPerSize();
        perp.updateFunding();
        int256 Fafter = perp.cumulativeFundingPerSize();
        assertGt(Fafter, Fbefore);

        uint256 aliceBefore = vault.balanceOf(alice);
        uint256 bobBefore = vault.balanceOf(bob);
        perp.settleFunding(alice);
        perp.settleFunding(bob);
        uint256 aliceAfter = vault.balanceOf(alice);
        uint256 bobAfter = vault.balanceOf(bob);

        // Long pays, Short receives
        assertLt(aliceAfter, aliceBefore);
        assertGt(bobAfter, bobBefore);

        // Zero-sum check (within 1 wei)
        uint256 recv = bobAfter - bobBefore;
        uint256 paid = aliceBefore - aliceAfter;
        assertApproxEqAbs(recv, paid, 1);
    }

    function test_Dust_Accumulation_And_Flush() public {
        // set dust high so first settlement won't transfer
        vm.prank(perp.owner());
        perp.setFundingParams(8 hours, 0.005e18, 1e18, 1 days, 1e16); // $0.01

        // open small OI
        vm.warp(3000);
        perp.applyFill(alice, bob, 2000, 1);

        // very short dt, very small prem -> below dust
        vm.warp(3000 + 10); // 10s
        oracle.setPrices(2000e18, 2010e18); // +0.5%
        perp.updateFunding();
        uint256 a0 = vault.balanceOf(alice);
        perp.settleFunding(alice); // below dust -> no vault change
        uint256 a1 = vault.balanceOf(alice);
        assertEq(a0, a1);

        // accumulate more so it crosses threshold
        vm.warp(3000 + 3600); // +1h (total ~1h)
        oracle.setPrices(2000e18, 2050e18); // +2.5%
        perp.settleFunding(alice); // should flush
        uint256 a2 = vault.balanceOf(alice);
        assertLt(a2, a1);
    }

    function test_Stale_Skips_Using_OracleAdapterSimple() public {
        // Use simple adapter with heartbeat
        OracleAdapterSimple simple = new OracleAdapterSimple(address(this), 100, 10);
        // Transfer ownership to this test so we can push
        simple.setReporter(address(this));

        // wire risk/perp to this oracle
        RiskEngine r2 = new RiskEngine(vault, IOracleAdapter(address(simple)), IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        PerpEngine p2 = new PerpEngine(vault, IRiskEngine(address(r2)), IOracleAdapter(address(simple)), 1e18, 1e18);
        r2.setLinks(vault, IOracleAdapter(address(simple)), IPerpPositions(address(p2)));
        vault.setRisk(r2);
        vault.setPerp(address(p2));

        // price push then stale
        vm.warp(10);
        simple.pushPrice(2000);
        vm.warp(25); // heartbeat=10, now-lu=15 -> stale
        uint64 before = p2.lastFundingTime();
        p2.updateFunding();
        uint64 afterTs = p2.lastFundingTime();
        assertGt(afterTs, before); // advanced even when stale
    }

    function test_Pause_Skips_And_NoChange_When_OI_Positive() public {
        // open positions
        vm.warp(5000);
        perp.applyFill(alice, bob, 2000, 5);

        // produce some funding baseline
        vm.warp(5000 + 3600);
        oracle.setPrices(2000e18, 2100e18);
        perp.updateFunding();
        int256 F0 = perp.cumulativeFundingPerSize();

        // pause funding
        vm.prank(perp.owner());
        perp.setFundingPaused(true);

        // change prices and time
        vm.warp(5000 + 7200);
        oracle.setPrices(2200e18, 2200e18);

        // expect skip with PAUSED reason (3) and lastFundingTime advance
        uint64 before = perp.lastFundingTime();
        perp.updateFunding();
        assertGt(perp.lastFundingTime(), before);
        assertEq(perp.cumulativeFundingPerSize(), F0, "F should not change when paused");

        // unpause and ensure funding resumes
        vm.prank(perp.owner());
        perp.setFundingPaused(false);
        // advance time and set non-zero prem
        vm.warp(5000 + 9000);
        oracle.setPrices(2000e18, 2200e18); // prem > 0
        perp.updateFunding();
        assertTrue(perp.cumulativeFundingPerSize() != F0, "F should change after unpause with time advance and prem");
    }

    function test_Close_Flushes_Dust() public {
        // high dust so normal settle won't transfer
        vm.prank(perp.owner());
        perp.setFundingParams(8 hours, 0.005e18, 1e18, 1 days, 1e16);

        // open small position
        vm.warp(6000);
        perp.applyFill(alice, bob, 2000, 1);

        // small funding accrual below dust
        vm.warp(6010);
        oracle.setPrices(2000e18, 2010e18);
        perp.updateFunding();
        uint256 balBefore = vault.balanceOf(alice);
        perp.settleFunding(alice); // remains as dust
        assertEq(vault.balanceOf(alice), balBefore);

        // close position -> forces dust flush
        // sell 1 back to bob @ 2000
        perp.applyFill(bob, alice, 2000, 1);
        uint256 balAfter = vault.balanceOf(alice);
        assertTrue(balAfter != balBefore, "dust should be flushed on close");
    }

    function test_Schedule_And_Execute_FundingParams_With_Delay() public {
        vm.prank(perp.owner());
        perp.setFundingParamsMinDelay(3600);
        uint64 eta = uint64(block.timestamp + 3600);
        vm.prank(perp.owner());
        perp.scheduleFundingParams(4 hours, 0.01e18, 1e18, 2 days, 1e14, eta);

        // cannot execute before eta
        vm.expectRevert();
        perp.executeScheduledFundingParams();

        vm.warp(eta);
        perp.executeScheduledFundingParams();
        // spot check one param changed
        assertEq(perp.fundingIntervalSec(), 4 hours);
        assertEq(perp.maxFundingRatePerInterval(), 0.01e18);
    }

    function test_CurrentFundingRate_View() public {
        // open position and set prem positive
        vm.warp(10000);
        perp.applyFill(alice, bob, 2000, 2);
        oracle.setPrices(2000e18, 2100e18);

        (int256 premClamped, int256 ratePerSec, uint256 notional) = perp.currentFundingRate();
        assertGt(premClamped, 0);
        assertGt(ratePerSec, 0);
        assertEq(notional, 2100e18);

        // pause -> returns zeros (except notional)
        vm.prank(perp.owner());
        perp.setFundingPaused(true);
        (premClamped, ratePerSec, notional) = perp.currentFundingRate();
        assertEq(premClamped, 0);
        assertEq(ratePerSec, 0);
        // notional can be non-zero as it derives from mark
        assertEq(notional, 2100e18);
    }
}
