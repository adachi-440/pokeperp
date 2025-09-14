// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/src/Test.sol";
import { OrderBookMVP } from "../../src/orderbook/OrderBookMVP.sol";
import { MockOracleAdapter } from "../../src/mocks/MockOracleAdapter.sol";
import { BasicSettlementHook } from "../../src/mocks/BasicSettlementHook.sol";
import { IOrderBook } from "../../src/interfaces/IOrderBook.sol";

contract OrderBookMatchTest is Test {
    OrderBookMVP public orderBook;
    MockOracleAdapter public oracle;
    BasicSettlementHook public settlementHook;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 10e18;
    uint256 constant DEVIATION_LIMIT = 500;
    uint256 constant INITIAL_PRICE = 100e18;

    event TradeMatched(
        bytes32 indexed buyOrderId,
        bytes32 indexed sellOrderId,
        address buyer,
        address seller,
        int24 tick,
        uint256 qty,
        uint256 timestamp
    );

    function setUp() public {
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        settlementHook = new BasicSettlementHook();
        orderBook = new OrderBookMVP(MIN_QTY, MIN_NOTIONAL, DEVIATION_LIMIT, address(oracle));
        orderBook.setSettlementHook(address(settlementHook));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    function test_MatchFullOrder() public {
        vm.prank(alice);
        bytes32 bidId = orderBook.place(true, 100, 2e18);

        vm.prank(bob);
        bytes32 askId = orderBook.place(false, 100, 2e18);

        assertEq(orderBook.bestBidTick(), 100, "Best bid should be 100");
        assertEq(orderBook.bestAskTick(), 100, "Best ask should be 100");

        vm.expectEmit(true, true, false, true);
        emit TradeMatched(bidId, askId, alice, bob, 100, 2e18, block.timestamp);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 2e18, "Should match 2e18");

        assertEq(orderBook.bestBidTick(), type(int24).min, "Best bid should be NULL after match");
        assertEq(orderBook.bestAskTick(), type(int24).min, "Best ask should be NULL after match");

        assertEq(settlementHook.getTradeCount(), 1, "Should have 1 trade recorded");
    }

    function test_MatchPartialOrder() public {
        vm.prank(alice);
        bytes32 bidId = orderBook.place(true, 100, 3e18);

        vm.prank(bob);
        bytes32 askId = orderBook.place(false, 100, 1e18);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 1e18, "Should match 1e18");

        IOrderBook.Order memory bidOrder = orderBook.orderOf(bidId);
        assertEq(bidOrder.qty, 3e18, "Bid order qty should still be 3e18");

        assertEq(orderBook.bestBidTick(), 100, "Best bid should still be 100");
        assertEq(orderBook.bestAskTick(), type(int24).min, "Best ask should be NULL");
    }

    function test_MatchMultipleOrders() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);

        vm.prank(charlie);
        orderBook.place(true, 100, 3e18);

        vm.prank(bob);
        orderBook.place(false, 100, 4e18);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 4e18, "Should match 4e18 total");

        assertEq(orderBook.bestBidTick(), 100, "Best bid should still be 100");

        IOrderBook.Level memory bidLevel = orderBook.levelOf(true, 100);
        assertEq(bidLevel.totalQty, 1e18, "Should have 1e18 remaining at bid level");
    }

    function test_MatchWithStepsLimit() public {
        vm.prank(alice);
        orderBook.place(true, 100, 1e18);
        orderBook.place(true, 100, 1e18);
        orderBook.place(true, 100, 1e18);

        vm.prank(bob);
        orderBook.place(false, 100, 1e18);
        orderBook.place(false, 100, 1e18);
        orderBook.place(false, 100, 1e18);

        uint256 matched = orderBook.matchAtBest(2);
        assertEq(matched, 2e18, "Should match only 2e18 due to steps limit");

        assertEq(settlementHook.getTradeCount(), 2, "Should have 2 trades recorded");
    }

    function test_NoMatchWhenSpread() public {
        vm.prank(alice);
        orderBook.place(true, 90, 2e18);

        vm.prank(bob);
        orderBook.place(false, 110, 2e18);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 0, "Should not match when spread exists");
    }

    function test_MatchAtCrossedPrices() public {
        vm.prank(alice);
        bytes32 bidId = orderBook.place(true, 102, 2e18);

        vm.prank(bob);
        bytes32 askId = orderBook.place(false, 100, 2e18);

        assertEq(orderBook.bestBidTick(), 102, "Best bid should be 102");
        assertEq(orderBook.bestAskTick(), 100, "Best ask should be 100");

        vm.expectEmit(true, true, false, true);
        emit TradeMatched(bidId, askId, alice, bob, 102, 2e18, block.timestamp);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 2e18, "Should match 2e18 at crossed prices");
    }

    function test_MatchPriceTimePriority() public {
        vm.prank(alice);
        bytes32 bidId1 = orderBook.place(true, 100, 1e18);

        vm.prank(charlie);
        bytes32 bidId2 = orderBook.place(true, 100, 1e18);

        vm.prank(bob);
        bytes32 askId = orderBook.place(false, 100, 1e18);

        vm.expectEmit(true, true, false, true);
        emit TradeMatched(bidId1, askId, alice, bob, 100, 1e18, block.timestamp);

        orderBook.matchAtBest(10);

        IOrderBook.Order memory order1 = orderBook.orderOf(bidId1);
        IOrderBook.Order memory order2 = orderBook.orderOf(bidId2);

        assertEq(order1.trader, address(0), "First order should be matched and deleted");
        assertEq(order2.trader, charlie, "Second order should still exist");
    }


    function test_MatchWithSettlementHook() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);

        vm.prank(bob);
        orderBook.place(false, 100, 2e18);

        orderBook.matchAtBest(10);

        assertEq(settlementHook.getTradeCount(), 1, "Should have 1 trade in hook");

        (uint256 aliceVolume, uint256 aliceCount) = settlementHook.getTraderStats(alice);
        (uint256 bobVolume, uint256 bobCount) = settlementHook.getTraderStats(bob);

        assertEq(aliceVolume, 2e18, "Alice volume should be 2e18");
        assertEq(aliceCount, 1, "Alice should have 1 trade");
        assertEq(bobVolume, 2e18, "Bob volume should be 2e18");
        assertEq(bobCount, 1, "Bob should have 1 trade");
    }
}