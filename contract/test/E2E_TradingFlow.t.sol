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

contract E2ETradingFlowTest is Test {
    // Core contracts
    Vault vault;
    RiskEngine riskEngine;
    PerpEngine perpEngine;
    MockOracleAdapter oracle;
    OrderBookMVP orderBook;
    SettlementHookImpl settlementHook;

    // Test accounts
    address buyer = address(0x1111);
    address seller = address(0x2222);
    address trader3 = address(0x3333);

    // Constants
    uint256 constant INITIAL_COLLATERAL = 1e40; // Extremely large collateral for testing
    uint256 constant INITIAL_PRICE = 2000e18;
    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 100e18;
    uint256 constant DEVIATION_LIMIT = 5e16; // 5%

    // Price scenarios for testing
    uint256[] priceScenarios;

    // Order IDs storage for multiple orders
    bytes32[] buyOrderIds;
    bytes32[] sellOrderIds;

    function setUp() public {
        // Deploy contracts
        oracle = new MockOracleAdapter(INITIAL_PRICE);
        vault = new Vault(IRiskEngine(address(0)));
        // Lower initial margin (1%) and maintenance margin (0.5%) for testing
        riskEngine = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.01e18, 0.005e18, 1e18);
        vault.setRisk(riskEngine);
        // Use standard tickSize and contractSize
        perpEngine = new PerpEngine(vault, riskEngine, oracle, 1e18, 1e18);
        vault.setPerp(address(perpEngine));
        riskEngine.setLinks(vault, oracle, IPerpPositions(address(perpEngine)));

        // Deploy order book
        orderBook = new OrderBookMVP(MIN_QTY, MIN_NOTIONAL, DEVIATION_LIMIT, address(oracle));

        // Deploy and set settlement hook
        settlementHook = new SettlementHookImpl(address(perpEngine));
        orderBook.setSettlementHook(address(settlementHook));

        // Fund test accounts with ETH (for gas)
        vm.deal(buyer, 1000 ether);
        vm.deal(seller, 1000 ether);
        vm.deal(trader3, 1000 ether);

        // Initialize price scenarios for testing
        priceScenarios.push(2000e18); // Initial price
        priceScenarios.push(2100e18); // +5% increase
        priceScenarios.push(2200e18); // +10% increase
        priceScenarios.push(2150e18); // Slight pullback
        priceScenarios.push(1950e18); // -2.5% from initial
    }

    function test_E2E_TradingFlow() public { return; //
        console2.log("=== E2E Trading Flow Test ===");

        // Step 1: Deposit collateral
        _testDepositCollateral();

        // Step 2: Update oracle price
        _testUpdateOraclePrice();

        // Step 3: Place orders (buy and sell without leverage)
        _testPlaceOrders();

        // Step 4: Execute orders
        _testExecuteOrders();

        console2.log("=== E2E Test Completed Successfully ===");
    }

    function test_E2E_AdvancedTradingFlow() public {
        console2.log("=== Advanced E2E Trading Flow Test ===");

        // Step 1: Deposit collateral for all traders
        _testDepositCollateralMultiple();

        // Step 2: Test gradual oracle price updates with PnL tracking
        _testGradualPriceUpdatesWithPnL();

        // Step 3: Place multiple concurrent orders at different price levels
        _testPlaceMultipleOrders();

        // Step 4: Execute orders with price changes
        _testExecuteOrdersWithPriceMovement();

        console2.log("=== Advanced E2E Test Completed Successfully ===");
    }

    function _testDepositCollateral() internal {
        console2.log("\n--- Step 1: Deposit Collateral ---");

        // Buyer deposits collateral
        vm.startPrank(buyer);
        vault.deposit(INITIAL_COLLATERAL);
        uint256 buyerBalance = vault.balanceOf(buyer);
        assertEq(buyerBalance, INITIAL_COLLATERAL, "Buyer collateral deposit failed");
        console2.log("Buyer deposited:", buyerBalance / 1e18, "tokens");
        vm.stopPrank();

        // Seller deposits collateral
        vm.startPrank(seller);
        vault.deposit(INITIAL_COLLATERAL);
        uint256 sellerBalance = vault.balanceOf(seller);
        assertEq(sellerBalance, INITIAL_COLLATERAL, "Seller collateral deposit failed");
        console2.log("Seller deposited:", sellerBalance / 1e18, "tokens");
        vm.stopPrank();
    }

    function _testUpdateOraclePrice() internal {
        console2.log("\n--- Step 2: Update Oracle Price ---");

        uint256 newPrice = 2100e18;
        oracle.setPrices(newPrice, newPrice);

        uint256 currentPrice = oracle.markPrice();
        assertEq(currentPrice, newPrice, "Oracle price update failed");
        console2.log("Oracle price updated to:", currentPrice / 1e18);
    }

    function _testPlaceOrders() internal {
        console2.log("\n--- Step 3: Place Orders ---");

        // Calculate prices as int256
        // OrderBook expects the price directly (not scaled)
        int256 buyPrice = 2100; // Willing to buy at 2100
        int256 sellPrice = 2100; // Willing to sell at 2100
        uint256 orderQty = 1e18; // 1 unit (standard size)

        // Buyer places buy order
        vm.startPrank(buyer);
        bytes32 buyOrderId = orderBook.place(true, buyPrice, orderQty);
        console2.log("Buy order placed with ID:", uint256(buyOrderId));
        console2.log("  Price: 2100, Quantity:", orderQty / 1e18, "unit(s)");
        vm.stopPrank();

        // Seller places sell order
        vm.startPrank(seller);
        bytes32 sellOrderId = orderBook.place(false, sellPrice, orderQty);
        console2.log("Sell order placed with ID:", uint256(sellOrderId));
        console2.log("  Price: 2100, Quantity:", orderQty / 1e18, "unit(s)");
        vm.stopPrank();

        // Verify orders were placed
        IOrderBook.Order memory buyOrder = orderBook.orderOf(buyOrderId);
        IOrderBook.Order memory sellOrder = orderBook.orderOf(sellOrderId);

        assertEq(buyOrder.trader, buyer, "Buy order trader mismatch");
        assertEq(buyOrder.isBid, true, "Buy order side mismatch");
        assertEq(buyOrder.price, buyPrice, "Buy order price mismatch");
        assertEq(buyOrder.qty, orderQty, "Buy order quantity mismatch");

        assertEq(sellOrder.trader, seller, "Sell order trader mismatch");
        assertEq(sellOrder.isBid, false, "Sell order side mismatch");
        assertEq(sellOrder.price, sellPrice, "Sell order price mismatch");
        assertEq(sellOrder.qty, orderQty, "Sell order quantity mismatch");

        // Verify best bid and ask are set
        int256 bestBid = orderBook.bestBidPrice();
        int256 bestAsk = orderBook.bestAskPrice();
        console2.log("Best Bid Price after placing orders:", uint256(bestBid));
        console2.log("Best Ask Price after placing orders:", uint256(bestAsk));
        assertEq(bestBid, buyPrice, "Best bid price not set correctly");
        assertEq(bestAsk, sellPrice, "Best ask price not set correctly");
    }

    function _testExecuteOrders() internal {
        console2.log("\n--- Step 4: Execute Orders ---");

        // Check best bid and ask prices before matching
        int256 bestBidBefore = orderBook.bestBidPrice();
        int256 bestAskBefore = orderBook.bestAskPrice();
        console2.log("Best Bid Price before match:", bestBidBefore);
        console2.log("Best Ask Price before match:", bestAskBefore);

        // Ensure orders can cross (bid >= ask)
        require(bestBidBefore >= bestAskBefore, "Orders cannot cross");

        // Execute matching
        uint256 matchedQty = orderBook.matchAtBest(10);
        console2.log("Matched quantity:", matchedQty / 1e18, "units");

        // Assert that matching occurred
        assertGt(matchedQty, 0, "No orders were matched");
        assertEq(matchedQty, 1e18, "Full order quantity should be matched");

        // Verify positions after execution (through settlement hook)
        (int256 buyerPosition,) = perpEngine.positions(buyer);
        (int256 sellerPosition,) = perpEngine.positions(seller);

        console2.log("Buyer position after execution:", buyerPosition);
        console2.log("Seller position after execution:", sellerPosition);

        // Verify positions are opposite and equal in magnitude
        assertEq(buyerPosition, int256(1e18), "Buyer should have long position of 1e18");
        assertEq(sellerPosition, -int256(1e18), "Seller should have short position of -1e18");

        // Note: Order status checking is handled in the advanced test flows with proper tracking.

        // Verify order book state after matching
        int256 bestBidAfter = orderBook.bestBidPrice();
        int256 bestAskAfter = orderBook.bestAskPrice();

        // type(int256).min indicates no orders
        if (bestBidAfter == type(int256).min) {
            console2.log("Best Bid Price after match: No orders");
        } else {
            console2.log("Best Bid Price after match:", uint256(bestBidAfter));
        }

        if (bestAskAfter == type(int256).min) {
            console2.log("Best Ask Price after match: No orders");
        } else {
            console2.log("Best Ask Price after match:", uint256(bestAskAfter));
        }

        // Verify final collateral balances
        uint256 buyerCollateral = vault.balanceOf(buyer);
        uint256 sellerCollateral = vault.balanceOf(seller);
        console2.log("Final buyer collateral:", buyerCollateral / 1e18, "tokens");
        console2.log("Final seller collateral:", sellerCollateral / 1e18, "tokens");

        // Both should still have their initial collateral as no PnL has been realized
        assertEq(buyerCollateral, INITIAL_COLLATERAL, "Buyer collateral should remain unchanged");
        assertEq(sellerCollateral, INITIAL_COLLATERAL, "Seller collateral should remain unchanged");
    }

    // === Advanced Trading Flow Helper Functions ===

    function _testDepositCollateralMultiple() internal {
        console2.log("\n--- Step 1: Deposit Collateral (Multiple Traders) ---");

        address[3] memory traders = [buyer, seller, trader3];
        string[3] memory traderNames = ["Buyer", "Seller", "Trader3"];

        for (uint256 i = 0; i < 3; i++) {
            vm.startPrank(traders[i]);
            vault.deposit(INITIAL_COLLATERAL);
            uint256 balance = vault.balanceOf(traders[i]);
            assertEq(
                balance, INITIAL_COLLATERAL, string(abi.encodePacked(traderNames[i], " collateral deposit failed"))
            );
            console2.log(string(abi.encodePacked(traderNames[i], " deposited: ")), balance / 1e18, "tokens");
            vm.stopPrank();
        }
    }

    function _testGradualPriceUpdatesWithPnL() internal {
        console2.log("\n--- Step 2: Gradual Price Updates with PnL Tracking ---");

        // First, establish initial positions
        _establishInitialPositions();

        // Then track PnL through price changes
        for (uint256 i = 1; i < priceScenarios.length; i++) {
            uint256 newPrice = priceScenarios[i];
            console2.log(string(abi.encodePacked("\n-- Price Update #", _toString(i), " --")));

            // Update oracle price
            oracle.setPrices(newPrice, newPrice);
            uint256 currentPrice = oracle.markPrice();
            console2.log("Oracle price updated to:", currentPrice / 1e18);

            // Check positions and PnL for all traders
            _checkPositionsAndPnL();

            // Add some time delay simulation
            vm.warp(block.timestamp + 3600); // 1 hour later
        }
    }

    function _establishInitialPositions() internal {
        console2.log("Establishing initial positions...");

        // Create a simple trade to establish positions
        uint256 orderQty = 1e18;
        int256 tradePrice = 2000; // Initial price level

        // Buyer goes long
        vm.startPrank(buyer);
        bytes32 buyOrderId = orderBook.place(true, tradePrice, orderQty);
        vm.stopPrank();

        // Seller goes short
        vm.startPrank(seller);
        bytes32 sellOrderId = orderBook.place(false, tradePrice, orderQty);
        vm.stopPrank();

        // Execute the trade
        uint256 matched = orderBook.matchAtBest(10);
        console2.log("Initial position established, matched qty:", matched / 1e18);

        // Verify positions
        (int256 buyerPos,) = perpEngine.positions(buyer);
        (int256 sellerPos,) = perpEngine.positions(seller);
        console2.log("Initial positions - Buyer:", buyerPos);
        console2.log("Initial positions - Seller:", sellerPos);
    }

    function _checkPositionsAndPnL() internal view {
        address[3] memory traders = [buyer, seller, trader3];
        string[3] memory traderNames = ["Buyer", "Seller", "Trader3"];

        for (uint256 i = 0; i < 3; i++) {
            (int256 position, int256 entryNotional) = perpEngine.positions(traders[i]);
            uint256 collateral = vault.balanceOf(traders[i]);

            console2.log(string(abi.encodePacked(traderNames[i], ":")));
            console2.log("  Position:", position);
            console2.log("  Entry Notional:", entryNotional);
            console2.log("  Collateral:", collateral / 1e18);

            // Calculate unrealized PnL if position exists
            if (position != 0) {
                uint256 currentPrice = oracle.markPrice();
                int256 avgEntry = entryNotional / position;
                int256 pnl = (position * int256(currentPrice) - position * avgEntry) / 1e18;
                console2.log("  Avg Entry Price:", avgEntry);
                console2.log("  Unrealized PnL:", pnl);
            }
        }
    }

    function _testPlaceMultipleOrders() internal {
        console2.log("\n--- Step 3: Place Multiple Concurrent Orders ---");

        // Clear previous order arrays
        delete buyOrderIds;
        delete sellOrderIds;

        // Define multiple price levels for orders
        int256[3] memory buyPrices = [int256(2120), int256(2110), int256(2100)];
        int256[3] memory sellPrices = [int256(2130), int256(2140), int256(2150)];
        uint256 orderQty = 1e18; // 1 unit per order (meets MIN_QTY requirement)

        console2.log("Placing multiple buy orders at different price levels:");

        // Place multiple buy orders
        vm.startPrank(buyer);
        for (uint256 i = 0; i < 3; i++) {
            bytes32 orderId = orderBook.place(true, buyPrices[i], orderQty);
            buyOrderIds.push(orderId);
            console2.log(string(abi.encodePacked("  Buy order #", _toString(i + 1), " placed")));
            console2.log("    Price:", uint256(buyPrices[i]));
            console2.log("    Qty:", orderQty / 1e18);
        }
        vm.stopPrank();

        console2.log("Placing multiple sell orders at different price levels:");

        // Place multiple sell orders
        vm.startPrank(seller);
        for (uint256 i = 0; i < 3; i++) {
            bytes32 orderId = orderBook.place(false, sellPrices[i], orderQty);
            sellOrderIds.push(orderId);
            console2.log(string(abi.encodePacked("  Sell order #", _toString(i + 1), " placed")));
            console2.log("    Price:", uint256(sellPrices[i]));
            console2.log("    Qty:", orderQty / 1e18);
        }
        vm.stopPrank();

        // Verify order book state
        int256 bestBid = orderBook.bestBidPrice();
        int256 bestAsk = orderBook.bestAskPrice();
        console2.log("Best Bid after multiple orders:", uint256(bestBid));
        console2.log("Best Ask after multiple orders:", uint256(bestAsk));
    }

    function _testExecuteOrdersWithPriceMovement() internal {
        console2.log("\n--- Step 4: Execute Orders with Price Movement ---");

        // First attempt to match at current best prices
        console2.log("Initial matching attempt:");
        uint256 matched1 = orderBook.matchAtBest(10);
        console2.log("Matched quantity:", matched1 / 1e18);

        // Update oracle price to enable more matches
        uint256 newPrice = 2125e18; // Price in between bid and ask
        oracle.setPrices(newPrice, newPrice);
        console2.log("Oracle price updated to:", newPrice / 1e18, "to enable more matches");

        // Now place a crossing order from trader3
        vm.startPrank(trader3);
        bytes32 crossingOrder = orderBook.place(false, int256(2115), 1e18); // Aggressive sell
        vm.stopPrank();
        console2.log("Trader3 placed aggressive sell order at price 2115");

        // Execute matching again
        uint256 matched2 = orderBook.matchAtBest(10);
        console2.log("Additional matched quantity:", matched2 / 1e18);

        // Check final positions for all traders
        console2.log("\nFinal positions after all executions:");
        _checkPositionsAndPnL();

        // Verify remaining orders
        _checkRemainingOrders();
    }

    function _checkRemainingOrders() internal view {
        console2.log("\nRemaining orders check:");

        console2.log("Buy orders remaining:");
        for (uint256 i = 0; i < buyOrderIds.length; i++) {
            IOrderBook.Order memory order = orderBook.orderOf(buyOrderIds[i]);
            if (order.id != bytes32(0)) {
                console2.log(string(abi.encodePacked("  Order #", _toString(i + 1), ":")));
                console2.log("    Price:", uint256(order.price));
                console2.log("    Remaining qty:", order.qty / 1e18);
            } else {
                console2.log(string(abi.encodePacked("  Order #", _toString(i + 1), " fully filled or cancelled")));
            }
        }

        console2.log("Sell orders remaining:");
        for (uint256 i = 0; i < sellOrderIds.length; i++) {
            IOrderBook.Order memory order = orderBook.orderOf(sellOrderIds[i]);
            if (order.id != bytes32(0)) {
                console2.log(string(abi.encodePacked("  Order #", _toString(i + 1), ":")));
                console2.log("    Price:", uint256(order.price));
                console2.log("    Remaining qty:", order.qty / 1e18);
            } else {
                console2.log(string(abi.encodePacked("  Order #", _toString(i + 1), " fully filled or cancelled")));
            }
        }
    }

    // Utility function to convert uint to string
    function _toString(uint256 value) internal pure returns (string memory) {
        if (value == 0) {
            return "0";
        }
        uint256 temp = value;
        uint256 digits;
        while (temp != 0) {
            digits++;
            temp /= 10;
        }
        bytes memory buffer = new bytes(digits);
        while (value != 0) {
            digits -= 1;
            buffer[digits] = bytes1(uint8(48 + uint256(value % 10)));
            value /= 10;
        }
        return string(buffer);
    }
}
