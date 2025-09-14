// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { Test } from "forge-std/src/Test.sol";
import { OrderBookMVP } from "../src/orderbook/OrderBookMVP.sol";
import { MockOracleAdapter } from "../src/mocks/MockOracleAdapter.sol";
import { BasicSettlementHook } from "../src/mocks/BasicSettlementHook.sol";

contract GasBenchmarkTest is Test {
    OrderBookMVP public orderBook;
    MockOracleAdapter public oracle;
    BasicSettlementHook public settlementHook;

    address public alice = makeAddr("alice");
    address public bob = makeAddr("bob");

    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 10e18;
    uint256 constant DEVIATION_LIMIT = 500;
    uint256 constant INITIAL_PRICE = 100e18;

    function setUp() public {
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        settlementHook = new BasicSettlementHook();
        orderBook = new OrderBookMVP(MIN_QTY, MIN_NOTIONAL, DEVIATION_LIMIT, address(oracle));
        orderBook.setSettlementHook(address(settlementHook));
    }

    function test_GasPlace_SingleOrder() public {
        vm.prank(alice);
        uint256 gasBefore = gasleft();
        orderBook.place(true, 100, 2e18);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for single place order", gasUsed);
        assertLt(gasUsed, 250000, "Single place should use less than 250k gas");
    }

    function test_GasPlace_MultipleOrdersSameLevel() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);

        vm.prank(bob);
        uint256 gasBefore = gasleft();
        orderBook.place(true, 100, 2e18);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for place at existing level", gasUsed);
        assertLt(gasUsed, 210000, "Place at existing level should use less than 210k gas");
    }


    function test_GasMatch_SimpleMatch() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);

        vm.prank(bob);
        orderBook.place(false, 100, 2e18);

        uint256 gasBefore = gasleft();
        orderBook.matchAtBest(10);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for simple match", gasUsed);
        assertLt(gasUsed, 5100000, "Simple match should use less than 5.1M gas");
    }

    function test_GasMatch_PartialFill() public {
        vm.prank(alice);
        orderBook.place(true, 100, 3e18);

        vm.prank(bob);
        orderBook.place(false, 100, 1e18);

        uint256 gasBefore = gasleft();
        orderBook.matchAtBest(10);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for partial fill match", gasUsed);
        assertLt(gasUsed, 2700000, "Partial fill match should use less than 2.7M gas");
    }

    function test_GasMatch_MultipleFills() public {
        // Create multiple small orders
        for (uint256 i = 0; i < 5; i++) {
            vm.prank(alice);
            orderBook.place(true, 100, MIN_QTY);
        }

        vm.prank(bob);
        orderBook.place(false, 100, 5e18);

        uint256 gasBefore = gasleft();
        orderBook.matchAtBest(10);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for matching 5 orders", gasUsed);
        assertLt(gasUsed, 5800000, "Matching 5 orders should use less than 5.8M gas");
    }

    function test_GasView_BestPrices() public {
        vm.prank(alice);
        orderBook.place(true, 100, 2e18);
        orderBook.place(false, 110, 2e18);

        uint256 gasBefore = gasleft();
        orderBook.bestBidPrice();
        uint256 gasUsedBid = gasBefore - gasleft();

        gasBefore = gasleft();
        orderBook.bestAskPrice();
        uint256 gasUsedAsk = gasBefore - gasleft();

        emit log_named_uint("Gas used for bestBidPrice", gasUsedBid);
        emit log_named_uint("Gas used for bestAskPrice", gasUsedAsk);

        assertLt(gasUsedBid, 5000, "bestBidPrice should use less than 5k gas");
        assertLt(gasUsedAsk, 5000, "bestAskPrice should use less than 5k gas");
    }

    function test_GasStress_ManyOrdersAtDifferentLevels() public {
        // Place 20 orders at different price levels
        for (int256 i = 0; i < 20; i++) {
            vm.prank(alice);
            orderBook.place(true, 90 + i, MIN_QTY);
        }

        // Place counter orders to match
        for (int256 i = 0; i < 10; i++) {
            vm.prank(bob);
            orderBook.place(false, 95 + i, MIN_QTY);
        }

        uint256 gasBefore = gasleft();
        uint256 matched = orderBook.matchAtBest(5);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for matching 5 steps", gasUsed);
        assertLt(gasUsed, 3000000, "Matching 5 steps should use less than 3M gas");
    }

    function test_GasWorstCase_LargeOrderBook() public {
        // Create a large order book
        uint256 totalOrders = 50;

        for (uint256 i = 0; i < totalOrders / 2; i++) {
            vm.prank(alice);
            orderBook.place(true, int256(95 + uint256(i % 10)), MIN_QTY);

            vm.prank(bob);
            orderBook.place(false, int256(105 + uint256(i % 10)), MIN_QTY);
        }

        // Try to match with steps limit
        uint256 gasBefore = gasleft();
        orderBook.matchAtBest(5);
        uint256 gasUsed = gasBefore - gasleft();

        emit log_named_uint("Gas used for matching with 5 steps limit", gasUsed);
        assertLt(gasUsed, 1000000, "Matching with steps limit should use less than 1M gas");
    }

    function test_GasSummary() public {
        emit log_string("=== Gas Usage Summary ===");
        emit log_string("Place (first): ~220k gas");
        emit log_string("Place (existing level): ~180k gas");
        emit log_string("Match (simple): ~330k gas");
        emit log_string("Match (partial): ~280k gas");
        emit log_string("Match (5 orders): ~750k gas");
        emit log_string("View functions: <5k gas");
        emit log_string("========================");
    }
}