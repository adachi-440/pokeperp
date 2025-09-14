// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";

contract RiskEngineTest is Test {
    Vault vault;
    RiskEngine risk;
    PerpEngine perp;
    MockOracleAdapter oracle;

    uint256 constant ONE = 1e18;
    address trader = address(0xAAA);
    address counter = address(0xBBB);

    function setUp() public {
        oracle = new MockOracleAdapter(2000e18); // $2000
        vault = new Vault(IRiskEngine(address(0)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));

        // fund both
        vm.startPrank(trader);
        vault.deposit(1000 * ONE);
        vm.stopPrank();
        vm.startPrank(counter);
        vault.deposit(1000 * ONE);
        vm.stopPrank();
    }

    function test_calculations_equity_im_mm_upnl() public {
        // open long 1 @ $2000
        perp.applyFill(trader, counter, 2000, 1);

        // equity = 1000 + 0 (mark=entry)
        assertEq(risk.equity(trader), int256(1000 * ONE));
        // notional = |size| * mark * contractSize = 1 * 2000 = 2000
        assertEq(risk.initialMargin(trader), 200 * ONE); // 10%
        assertEq(risk.maintenanceMargin(trader), 100 * ONE); // 5%

        // move mark +$100 → upnl = size*(mark-avg)*contractSize = 1*100 = +100
        oracle.setPrices(2100e18, 2100e18);
        assertEq(risk.equity(trader), int256(1100 * ONE));
    }

    function test_requireHealthyMM_boundary() public {
        perp.applyFill(trader, counter, 2000, 10); // size=10, notional=20k, mm=1k
        // equity currently 1000, so right at boundary; should pass
        risk.requireHealthyMM(trader);

        // drop mark by $1 → upnl = 10 * (-1) = -10; equity = 990 < 1000 → revert
        oracle.setPrices(1999e18, 1999e18);
        vm.expectRevert();
        risk.requireHealthyMM(trader);
    }
}
