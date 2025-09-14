// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/src/Test.sol";
import { OrderBookMVP } from "../../src/orderbook/OrderBookMVP.sol";
import { MockOracleAdapter } from "../../src/mocks/MockOracleAdapter.sol";
import { IOrderBook } from "../../src/interfaces/IOrderBook.sol";

contract OrderBookPlaceTest is Test {
    OrderBookMVP public orderBook;
    MockOracleAdapter public oracle;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 10e18;
    uint256 constant DEVIATION_LIMIT = 500; // 5%
    uint256 constant INITIAL_PRICE = 100e18;

    function setUp() public {
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        orderBook = new OrderBookMVP(MIN_QTY, MIN_NOTIONAL, DEVIATION_LIMIT, address(oracle));

        vm.deal(alice, 100 ether);
        vm.deal(bob, 100 ether);
    }

    function test_PlaceBidOrder() public {
        vm.startPrank(alice);

        int24 price = 100;
        uint256 qty = 2e18;

        bytes32 orderId = orderBook.place(true, price, qty);

        assertEq(uint256(orderId), 1, "Order ID should be 1");

        IOrderBook.Order memory order = orderBook.orderOf(orderId);
        assertEq(order.trader, alice, "Trader should be alice");
        assertTrue(order.isBid, "Should be a bid order");
        assertEq(order.price, price, "Price should match");
        assertEq(order.qty, qty, "Quantity should match");

        vm.stopPrank();
    }

    function test_PlaceAskOrder() public {
        vm.startPrank(bob);

        int24 price = 110;
        uint256 qty = 3e18;

        bytes32 orderId = orderBook.place(false, price, qty);

        assertEq(uint256(orderId), 1, "Order ID should be 1");

        IOrderBook.Order memory order = orderBook.orderOf(orderId);
        assertEq(order.trader, bob, "Trader should be bob");
        assertFalse(order.isBid, "Should be an ask order");
        assertEq(order.price, price, "Price should match");
        assertEq(order.qty, qty, "Quantity should match");

        vm.stopPrank();
    }

    function test_PlaceMultipleOrders() public {
        vm.startPrank(alice);

        bytes32 orderId1 = orderBook.place(true, 100, 2e18);
        bytes32 orderId2 = orderBook.place(true, 99, 3e18);
        bytes32 orderId3 = orderBook.place(false, 110, 1e18);

        assertEq(uint256(orderId1), 1, "First order ID should be 1");
        assertEq(uint256(orderId2), 2, "Second order ID should be 2");
        assertEq(uint256(orderId3), 3, "Third order ID should be 3");

        bytes32[] memory aliceOrders = orderBook.getOpenOrders(alice);
        assertEq(aliceOrders.length, 3, "Alice should have 3 open orders");

        vm.stopPrank();
    }

    function test_BestBidUpdate() public {
        vm.startPrank(alice);

        orderBook.place(true, 100, 2e18);
        assertEq(orderBook.bestBidPrice(), 100, "Best bid should be 100");

        orderBook.place(true, 105, 2e18);
        assertEq(orderBook.bestBidPrice(), 105, "Best bid should update to 105");

        orderBook.place(true, 102, 2e18);
        assertEq(orderBook.bestBidPrice(), 105, "Best bid should remain 105");

        vm.stopPrank();
    }

    function test_BestAskUpdate() public {
        vm.startPrank(alice);

        orderBook.place(false, 110, 2e18);
        assertEq(orderBook.bestAskPrice(), 110, "Best ask should be 110");

        orderBook.place(false, 105, 2e18);
        assertEq(orderBook.bestAskPrice(), 105, "Best ask should update to 105");

        orderBook.place(false, 108, 2e18);
        assertEq(orderBook.bestAskPrice(), 105, "Best ask should remain 105");

        vm.stopPrank();
    }

    function test_RevertIfQtyTooSmall() public {
        vm.startPrank(alice);

        uint256 smallQty = MIN_QTY - 1;

        vm.expectRevert("Qty too small");
        orderBook.place(true, 100, smallQty);

        vm.stopPrank();
    }

    function test_RevertIfNotionalTooSmall() public {
        vm.startPrank(alice);

        int24 lowPrice = -100000;
        uint256 qty = MIN_QTY;

        vm.expectRevert("Notional too small");
        orderBook.place(true, lowPrice, qty);

        vm.stopPrank();
    }


    function test_LevelAggregation() public {
        vm.startPrank(alice);
        orderBook.place(true, 100, 2e18);
        vm.stopPrank();

        vm.startPrank(bob);
        orderBook.place(true, 100, 3e18);
        vm.stopPrank();

        IOrderBook.Level memory level = orderBook.levelOf(true, 100);
        assertEq(level.totalQty, 5e18, "Total quantity at level should be 5e18");
    }
}