// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { IVault } from "../src/interfaces/IVault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
import { TestUSDC } from "../src/token/TestUSDC.sol";
import { IERC20 } from "forge-std/src/interfaces/IERC20.sol";

contract VaultTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracleAdapter oracle;
    TestUSDC token;

    uint256 constant ONE = 1e18;

    address alice = address(0xA11CE);

    function setUp() public {
        oracle = new MockOracleAdapter(1000e18); // $1000
        token = new TestUSDC("Test USDC", "TUSDC", 6);
        // Temporary deploy risk with placeholders; we will link later
        vault = new Vault(IRiskEngine(address(0)), IERC20(address(token))); // will set risk after deploy
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));
    }

    function test_deposit_withdraw_updates_balance_and_events() public {
        // Mint tokens to alice
        token.mint(alice, 1000 * ONE);

        vm.startPrank(alice);
        // Approve vault to spend tokens
        token.approve(address(vault), 1000 * ONE);

        vm.expectEmit(true, false, false, true);
        emit IVault.Deposited(alice, 100 * ONE);
        vault.deposit(100 * ONE);
        assertEq(vault.balanceOf(alice), 100 * ONE);

        vm.expectEmit(true, false, false, true);
        emit IVault.Withdrawn(alice, 40 * ONE);
        vault.withdraw(40 * ONE);
        assertEq(vault.balanceOf(alice), 60 * ONE);
        vm.stopPrank();
    }

    function test_withdraw_guard_reverts_when_equity_below_IM() public {
        // Mint tokens to alice and seller
        token.mint(alice, 1000 * ONE);
        token.mint(address(0xBEEF), 2000 * ONE);

        // Alice deposit enough to pass MM but not enough for IM guard on withdrawal
        vm.startPrank(alice);
        token.approve(address(vault), 1000 * ONE);
        vault.deposit(600 * ONE); // Need >500 for MM (5% of 10k notional), but <1000 IM
        vm.stopPrank();

        // fund the seller so MM check passes
        address seller = address(0xBEEF);
        vm.startPrank(seller);
        token.approve(address(vault), 2000 * ONE);
        vault.deposit(1000 * ONE);
        vm.stopPrank();

        // open long 10 @ $1000 → notional=10k, IM=1k (imr=10%), MM=500 (mmr=5%)
        perp.applyFill(alice, seller, 1000, 10); // priceTick=1000, tickSize=1e18 → price=1000e18

        // Equity = 600, IM = 1000. Try withdrawing any amount should fail IM guard
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
