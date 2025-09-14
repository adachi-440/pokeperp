// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/src/Test.sol";
import { OrderBookMVP } from "../../src/orderbook/OrderBookMVP.sol";
import { MockOracleAdapter } from "../../src/mocks/MockOracleAdapter.sol";
import { BasicSettlementHook } from "../../src/mocks/BasicSettlementHook.sol";
import { IOrderBook } from "../../src/interfaces/IOrderBook.sol";

contract OrderBookEdgeCasesTest is Test {
    OrderBookMVP public orderBook;
    MockOracleAdapter public oracle;
    BasicSettlementHook public settlementHook;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");

    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 10e18;
    uint256 constant DEVIATION_LIMIT = 500; // 5%
    uint256 constant INITIAL_PRICE = 100e18;

    function setUp() public {
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        settlementHook = new BasicSettlementHook();
        orderBook = new OrderBookMVP(MIN_QTY, MIN_NOTIONAL, DEVIATION_LIMIT, address(oracle));
        orderBook.setSettlementHook(address(settlementHook));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
        vm.deal(charlie, 100 ether);
    }

    // Edge Case: Empty book operations
    function test_EmptyBookOperations() public {
        assertEq(orderBook.bestBidPrice(), type(int256).min, "Best bid should be NULL for empty book");
        assertEq(orderBook.bestAskPrice(), type(int256).min, "Best ask should be NULL for empty book");

        bytes32[] memory orders = orderBook.getOpenOrders(alice);
        assertEq(orders.length, 0, "Should have no open orders");
    }




    // Edge Case: Same trader multiple orders at same level
    function test_SameTraderMultipleOrdersSameLevel() public {
        vm.startPrank(alice);
        bytes32 order1 = orderBook.place(true, 100, 1e18);
        bytes32 order2 = orderBook.place(true, 100, 2e18);
        bytes32 order3 = orderBook.place(true, 100, 3e18);
        vm.stopPrank();

        IOrderBook.Level memory level = orderBook.levelOf(true, 100);
        assertEq(level.totalQty, 6e18, "Total quantity should be 6e18");
        assertEq(level.headId, order1, "First order should be head");
        assertEq(level.tailId, order3, "Last order should be tail");
    }


    // Edge Case: Zero quantity after partial fills
    function test_ZeroQuantityAfterPartialFills() public {
        vm.prank(alice);
        bytes32 bidId = orderBook.place(true, 100, 5e18);

        // Fill partially multiple times - auto-matching will occur
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(bob);
            orderBook.place(false, 100, 1e18);
        }

        IOrderBook.Order memory order = orderBook.orderOf(bidId);
        assertEq(order.trader, address(0), "Order should be deleted after complete fill");
    }

    // Edge Case: Maximum price values
    function test_MaximumPriceValues() public {
        // Test very small notional (price 1 with MIN_QTY)
        vm.prank(alice);
        vm.expectRevert("Notional too small");
        orderBook.place(true, 1, MIN_QTY);

        // Test negative price creates very small price
        vm.prank(alice);
        vm.expectRevert("Notional too small");
        orderBook.place(true, -100, MIN_QTY);
    }

    // Edge Case: Interleaved operations
    function test_InterleavedOperations() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);

        vm.prank(bob);
        orderBook.place(false, 101, 2e18);

        vm.prank(charlie);
        orderBook.place(true, 99, 2e18);

        assertEq(orderBook.bestBidPrice(), 100, "Best bid should be 100");

        // Add new order at same level
        vm.prank(alice);
        orderBook.place(true, 100, 3e18);

        assertEq(orderBook.bestBidPrice(), 100, "Best bid should still be 100");

        // Match some orders - auto-matching will occur
        vm.prank(bob);
        orderBook.place(false, 100, 1e18);

        IOrderBook.Level memory level = orderBook.levelOf(true, 100);
        assertEq(level.totalQty, 4e18, "Should have 4e18 remaining at level 100");
    }
}
