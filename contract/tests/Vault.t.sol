// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine } from "../src/risk/RiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracle } from "../src/mocks/MockOracle.sol";

contract VaultTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracle oracle;

    uint256 constant ONE = 1e18;

    address alice = address(0xA11CE);

    function setUp() public {
        oracle = new MockOracle(1000e18); // $1000
        // Temporary deploy risk with placeholders; we will link later
        vault = new Vault(RiskEngine(address(0))); // will set risk after deploy
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));
    }

    function test_deposit_withdraw_updates_balance_and_events() public {
        vm.startPrank(alice);
        vm.expectEmit(true, false, false, true);
        emit vault.Deposited(alice, 100 * ONE);
        vault.deposit(100 * ONE);
        assertEq(vault.balanceOf(alice), 100 * ONE);

        vm.expectEmit(true, false, false, true);
        emit vault.Withdrawn(alice, 40 * ONE);
        vault.withdraw(40 * ONE);
        assertEq(vault.balanceOf(alice), 60 * ONE);
        vm.stopPrank();
    }

    function test_withdraw_guard_reverts_when_equity_below_IM() public {
        // Alice deposit and open long to consume IM
        vm.startPrank(alice);
        vault.deposit(100 * ONE);
        vm.stopPrank();

        // fund the seller so MM check passes
        address seller = address(0xBEEF);
        vm.startPrank(seller);
        vault.deposit(1_000 * ONE);
        vm.stopPrank();

        // open long 10 @ $1000 → notional=10k, IM=1k (imr=10%)
        perp.applyFill(alice, seller, 1000, 10); // priceTick=1000, tickSize=1e18 → price=1000e18

        // Equity now ~ 100 - fees(0) → 100. Try withdrawing 100 - 1000(IM) should fail
        vm.startPrank(alice);
        vm.expectRevert();
        vault.withdraw(1 * ONE);
        vm.stopPrank();
    }

    function test_credit_debit_only_perp() public {
        vm.expectRevert();
        vault.credit(alice, 1);
        vm.expectRevert();
        vault.debit(alice, 1);
    }
}
