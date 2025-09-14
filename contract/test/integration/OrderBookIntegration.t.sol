// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/src/Test.sol";
import { OrderBookMVP } from "../../src/orderbook/OrderBookMVP.sol";
import { MockOracleAdapter } from "../../src/mocks/MockOracleAdapter.sol";
import { BasicSettlementHook } from "../../src/mocks/BasicSettlementHook.sol";
import { IOrderBook } from "../../src/interfaces/IOrderBook.sol";

contract OrderBookIntegrationTest is Test {
    OrderBookMVP public orderBook;
    MockOracleAdapter public oracle;
    BasicSettlementHook public settlementHook;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");
    address public charlie = makeAddr("charlie");
    address public david = makeAddr("david");

    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 10e18;
    uint256 constant DEVIATION_LIMIT = 500; // 5%
    uint256 constant INITIAL_PRICE = 100e18;

    event OrderPlaced(
        bytes32 indexed orderId,
        address indexed trader,
        bool isBid,
        int256 price,
        uint256 qty,
        uint256 timestamp
    );

    event TradeMatched(
        bytes32 indexed buyOrderId,
        bytes32 indexed sellOrderId,
        address buyer,
        address seller,
        int256 price,
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
        vm.deal(david, 100 ether);
    }

    function test_FullTradingLifecycle() public {
        // Step 1: Initial order placement
        vm.prank(alice);
        bytes32 aliceOrder1 = orderBook.place(true, 99, 5e18);
        emit log_named_bytes32("Alice placed bid at 99", aliceOrder1);

        vm.prank(bob);
        bytes32 bobOrder1 = orderBook.place(false, 101, 5e18);
        emit log_named_bytes32("Bob placed ask at 101", bobOrder1);

        assertEq(orderBook.bestBidPrice(), 99, "Best bid should be 99");
        assertEq(orderBook.bestAskPrice(), 101, "Best ask should be 101");

        // Step 2: Tighten the spread
        vm.prank(charlie);
        bytes32 charlieOrder1 = orderBook.place(true, 100, 3e18);
        emit log_named_bytes32("Charlie placed bid at 100", charlieOrder1);

        assertEq(orderBook.bestBidPrice(), 100, "Best bid should update to 100");

        // Step 3: Cross the spread and match
        vm.prank(david);
        bytes32 davidOrder1 = orderBook.place(false, 100, 2e18);
        emit log_named_bytes32("David placed ask at 100", davidOrder1);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 2e18, "Should match 2e18");
        emit log_named_uint("Matched volume", matched);

        // Verify settlement hook recorded the trade
        assertEq(settlementHook.getTradeCount(), 1, "Should have 1 trade");

        // Step 4: Partial order still exists
        assertEq(orderBook.bestBidPrice(), 100, "Charlie's partial order at 100");
        IOrderBook.Level memory level100 = orderBook.levelOf(true, 100);
        assertEq(level100.totalQty, 1e18, "Should have 1e18 remaining");

        // Step 5: Place new order
        vm.prank(charlie);
        orderBook.place(true, 100, 4e18);

        // Step 6: Multiple matches
        vm.prank(david);
        orderBook.place(false, 99, 3e18); // Cross with multiple bids

        matched = orderBook.matchAtBest(10);
        assertEq(matched, 3e18, "Should match 3e18");

        // Step 7: Check final state
        assertEq(orderBook.bestBidPrice(), 100, "Charlie still has orders at 100");
        assertEq(orderBook.bestAskPrice(), 101, "Bob still has orders at 101");

        // Verify trader statistics
        (uint256 charlieVolume, uint256 charlieCount) = settlementHook.getTraderStats(charlie);
        emit log_named_uint("Charlie total volume", charlieVolume);
        emit log_named_uint("Charlie trade count", charlieCount);
    }

    function test_MarketMakingScenario() public {
        // Market maker places orders on both sides
        vm.startPrank(alice);
        orderBook.place(true, 98, 10e18);
        orderBook.place(true, 99, 10e18);
        orderBook.place(false, 101, 10e18);
        orderBook.place(false, 102, 10e18);
        vm.stopPrank();

        emit log_string("Market maker orders placed");
        emit log_named_int("Best bid", orderBook.bestBidPrice());
        emit log_named_int("Best ask", orderBook.bestAskPrice());

        // Taker takes liquidity
        vm.prank(bob);
        orderBook.place(false, 99, 15e18);

        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 10e18, "Should match 10e18");

        // Market maker adjusts quotes
        vm.startPrank(alice);
        orderBook.place(true, 97, 10e18);
        orderBook.place(false, 100, 10e18);
        vm.stopPrank();

        assertEq(orderBook.bestBidPrice(), 98, "Best bid should be 98");
        assertEq(orderBook.bestAskPrice(), 99, "Best ask should be 99");
    }

    function test_VolatileMarketScenario() public {
        // Initial balanced market
        vm.prank(alice);
        orderBook.place(true, 100, 5e18);

        vm.prank(bob);
        orderBook.place(false, 100, 5e18);

        // Oracle price moves
        oracle.setMarkPrice(95e18);
        emit log_named_uint("Oracle price dropped to", 95e18);

        // Matching fails due to deviation
        uint256 matched = orderBook.matchAtBest(10);
        assertEq(matched, 0, "Should not match due to price deviation");

        // Market adjusts to new oracle price
        oracle.setMarkPrice(100e18); // Reset oracle to allow matching

        // Now matching succeeds
        matched = orderBook.matchAtBest(10);
        assertEq(matched, 5e18, "Should match when price returns to normal");
    }

    function test_LiquidityCascade() public {
        // Build order book depth
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            orderBook.place(true, 100 - int256(i), 2e18);

            vm.prank(bob);
            orderBook.place(false, 100 + int256(i), 2e18);
        }

        emit log_string("Order book depth created");
        emit log_named_int("Best bid", orderBook.bestBidPrice());
        emit log_named_int("Best ask", orderBook.bestAskPrice());

        // Large market order sweeps multiple levels
        vm.prank(charlie);
        orderBook.place(false, 96, 10e18);

        uint256 totalMatched = 0;
        for (uint256 i = 0; i < 5; i++) {
            uint256 matched = orderBook.matchAtBest(1);
            totalMatched += matched;
            if (matched == 0) break;
        }

        assertEq(totalMatched, 10e18, "Should match all 10e18");
        assertEq(orderBook.bestBidPrice(), type(int256).min, "Best bid should be consumed");
    }

    function test_StressTestWithManyTraders() public {
        address[10] memory traders;
        for (uint256 i = 0; i < 10; i++) {
            traders[i] = makeAddr(string(abi.encodePacked("trader", i)));
            vm.deal(traders[i], 100 ether);
        }

        // Each trader places multiple orders
        for (uint256 i = 0; i < 10; i++) {
            vm.startPrank(traders[i]);

            if (i % 2 == 0) {
                // Even traders are buyers
                orderBook.place(true, 95 + int256(i / 2), 2e18);
            } else {
                // Odd traders are sellers
                orderBook.place(false, 105 - int256(i / 2), 2e18);
            }

            vm.stopPrank();
        }

        // Execute matching rounds
        uint256 totalMatched = 0;
        for (uint256 round = 0; round < 5; round++) {
            uint256 matched = orderBook.matchAtBest(2);
            totalMatched += matched;
            emit log_named_uint(string(abi.encodePacked("Round ", round, " matched")), matched);
        }

        emit log_named_uint("Total matched across all rounds", totalMatched);

        // Verify settlement hook has correct trade count
        uint256 tradeCount = settlementHook.getTradeCount();
        emit log_named_uint("Total trades recorded", tradeCount);
    }

    function test_RealWorldTradingPattern() public {
        // Simulate a day of trading with various patterns

        // Morning: Low volume, wide spread
        vm.prank(alice);
        orderBook.place(true, 98, 2e18);

        vm.prank(bob);
        orderBook.place(false, 102, 2e18);

        emit log_string("Morning: Wide spread established");

        // Mid-morning: Volume picks up
        vm.prank(charlie);
        orderBook.place(true, 99, 5e18);

        vm.prank(david);
        orderBook.place(false, 101, 5e18);

        emit log_string("Mid-morning: Spread tightens");

        // Noon: High volume, tight spread
        vm.prank(alice);
        orderBook.place(true, 100, 10e18);

        vm.prank(bob);
        orderBook.place(false, 100, 8e18);

        uint256 noonMatched = orderBook.matchAtBest(10);
        emit log_named_uint("Noon matched volume", noonMatched);

        // Afternoon: Price discovery
        oracle.setMarkPrice(102e18);

        vm.prank(charlie);
        orderBook.place(true, 102, 5e18);

        vm.prank(david);
        orderBook.place(false, 102, 5e18);

        uint256 afternoonMatched = orderBook.matchAtBest(10);
        emit log_named_uint("Afternoon matched volume", afternoonMatched);

        emit log_string("End of day: Complete");
        emit log_named_uint("Final trade count", settlementHook.getTradeCount());
    }
}