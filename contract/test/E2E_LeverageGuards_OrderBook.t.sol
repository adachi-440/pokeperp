// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test, console2 } from "forge-std/src/Test.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine, IPerpPositions } from "../src/risk/RiskEngine.sol";
import { IRiskEngine } from "../src/interfaces/IRiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
import { OrderBookMVP } from "../src/orderbook/OrderBookMVP.sol";
import { IOrderBook } from "../src/interfaces/IOrderBook.sol";
import { SettlementHookImpl } from "../src/test/SettlementHookImpl.sol";

contract E2ELeverageGuardsOrderBookTest is Test {
    // Core contracts
    Vault vault;
    RiskEngine riskEngine;
    PerpEngine perpEngine;
    MockOracleAdapter oracle;
    OrderBookMVP orderBook;
    SettlementHookImpl settlementHook;

    // Accounts
    address buyer = address(0xB0B);
    address seller = address(0xA11CE);

    uint256 constant ONE = 1e18;
    uint256 constant INITIAL_PRICE = 2000e18;

    function setUp() public {
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        vault = new Vault(IRiskEngine(address(0)));
        // 初期は 10% / 5% とし、スケール整合のため contractSize=1 を使用
        riskEngine = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1);
        vault.setRisk(riskEngine);
        perpEngine = new PerpEngine(vault, riskEngine, oracle, 1e18, 1e18);
        vault.setPerp(address(perpEngine));
        riskEngine.setLinks(vault, oracle, IPerpPositions(address(perpEngine)));

        // OrderBook 構築（十分に緩いバンドで簡易テスト）
        // minQty=1 で 0.5 * 1e18 といった端数量も通す
        orderBook = new OrderBookMVP(1 /* minQty */, 10e18 /* minNotional */, 10e16 /* 10% */, address(oracle));
        settlementHook = new SettlementHookImpl(address(perpEngine));
        orderBook.setSettlementHook(address(settlementHook));

        // Gas funding
        vm.deal(buyer, 1000 ether);
        vm.deal(seller, 1000 ether);
    }

    function _depositBoth(uint256 amount) internal {
        vm.startPrank(buyer); vault.deposit(amount); vm.stopPrank();
        vm.startPrank(seller); vault.deposit(amount); vm.stopPrank();
    }

    function _place(address who, bool isBid, int256 price, uint256 qty) internal returns (bytes32 id) {
        vm.startPrank(who);
        id = orderBook.place(isBid, price, qty);
        vm.stopPrank();
    }

    // 10x: IMR=10%, MMR=5%（contractSize=1）
    function test_E2E_OrderBook_LeverageFlow_10x() public {
        _depositBoth(1001 * ONE);

        int256 price = 2000; // 2000 * 1e18
        uint256 qty = 5 * ONE; // size=5.0（1e18スケール） → notional=10,000

        // 双方のオーダーを同価格・同数量で提示
        _place(buyer, true, price, qty);
        _place(seller, false, price, qty);

        // 約定実行
        uint256 matched = orderBook.matchAtBest(10);
        // 自動マッチもあり得るため、最終的なポジションを確認
        (int256 buyerPos,) = perpEngine.positions(buyer);
        assertEq(buyerPos, int256(qty), "buyer size must equal qty (10x)");

        // IM/MM/Equity 境界
        assertEq(riskEngine.initialMargin(buyer), 1000 * ONE, "IM=1000 at 10x");
        assertEq(riskEngine.maintenanceMargin(buyer), 500 * ONE, "MM=500 at 10x");
        assertEq(riskEngine.equity(buyer), int256(1001 * ONE), "equity intact at entry");

        // 出金はIMガードで拒否（eq=1001, IM=1000 → 2引出しでNG）
        vm.startPrank(buyer);
        vm.expectRevert();
        vault.withdraw(2 * ONE);
        vm.stopPrank();

        // 増し玉（+1.0）→ IM=1.2k > equity → matchでrevert
        _place(buyer, true, price, 1 * ONE);
        // セラーのオーダー配置でオートマッチが走るため、ここでrevertを期待
        vm.expectRevert();
        _place(seller, false, price, 1 * ONE);

        (matched); // silence
    }

    // 5x: IMR=20%, MMR=10%（contractSize=1）
    function test_E2E_OrderBook_LeverageFlow_5x() public {
        // 20%/10%に更新
        riskEngine.setParams(0.2e18, 0.1e18, 1);

        _depositBoth(1001 * ONE);

        int256 price = 2000;
        uint256 qty = 25e17; // 2.5 * 1e18 → notional=5,000

        _place(buyer, true, price, qty);
        _place(seller, false, price, qty);
        orderBook.matchAtBest(10);

        (int256 buyerPos,) = perpEngine.positions(buyer);
        assertEq(buyerPos, int256(qty), "buyer size must equal qty (5x)");

        assertEq(riskEngine.initialMargin(buyer), 1000 * ONE, "IM=1000 at 5x");
        assertEq(riskEngine.maintenanceMargin(buyer), 500 * ONE, "MM=500 at 5x");
        assertEq(riskEngine.equity(buyer), int256(1001 * ONE), "equity intact at entry");

        // 出金はIMガードで拒否（eq=1001, IM=1000 → 2引出しでNG）
        vm.startPrank(buyer);
        vm.expectRevert();
        vault.withdraw(2 * ONE);
        vm.stopPrank();

        // 増し玉（+0.5）→ notional=6k, IM=1.2k > equity → revert
        _place(buyer, true, price, 5e17);
        vm.expectRevert();
        _place(seller, false, price, 5e17);
    }
}
