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

    // Constants
    uint256 constant INITIAL_COLLATERAL = 1e40; // Extremely large collateral for testing
    uint256 constant INITIAL_PRICE = 2000e18;
    uint256 constant MIN_QTY = 1e18;
    uint256 constant MIN_NOTIONAL = 100e18;
    uint256 constant DEVIATION_LIMIT = 5e16; // 5%

    // Order IDs
    bytes32 buyOrderId;
    bytes32 sellOrderId;

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
        orderBook = new OrderBookMVP(
            MIN_QTY,
            MIN_NOTIONAL,
            DEVIATION_LIMIT,
            address(oracle)
        );

        // Deploy and set settlement hook
        settlementHook = new SettlementHookImpl(address(perpEngine));
        orderBook.setSettlementHook(address(settlementHook));

        // Fund test accounts with ETH (for gas)
        vm.deal(buyer, 1000 ether);
        vm.deal(seller, 1000 ether);
    }

    function test_E2E_TradingFlow() public {
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

        // Calculate prices as int24 (price in basis points from 0)
        // For price of 2100, we use 210000 (2100 * 100)
        int24 buyPrice = 210000;  // Willing to buy at 2100
        int24 sellPrice = 210000; // Willing to sell at 2100
        uint256 orderQty = 1e18; // 1 unit (standard size)

        // Buyer places buy order
        vm.startPrank(buyer);
        buyOrderId = orderBook.place(true, buyPrice, orderQty);
        console2.log("Buy order placed with ID:", uint256(buyOrderId));
        console2.log("  Price: 2100, Quantity:", orderQty / 1e18, "unit(s)");
        vm.stopPrank();

        // Seller places sell order
        vm.startPrank(seller);
        sellOrderId = orderBook.place(false, sellPrice, orderQty);
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
        int24 bestBid = orderBook.bestBidPrice();
        int24 bestAsk = orderBook.bestAskPrice();
        console2.log("Best Bid Price after placing orders:", bestBid);
        console2.log("Best Ask Price after placing orders:", bestAsk);
        assertEq(bestBid, buyPrice, "Best bid price not set correctly");
        assertEq(bestAsk, sellPrice, "Best ask price not set correctly");
    }

    function _testExecuteOrders() internal {
        console2.log("\n--- Step 4: Execute Orders ---");

        // Check best bid and ask prices before matching
        int24 bestBidBefore = orderBook.bestBidPrice();
        int24 bestAskBefore = orderBook.bestAskPrice();
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

        // Check if orders were filled
        IOrderBook.Order memory buyOrderAfter = orderBook.orderOf(buyOrderId);
        IOrderBook.Order memory sellOrderAfter = orderBook.orderOf(sellOrderId);

        // After full fill, orders should be deleted (id should be 0)
        if (buyOrderAfter.id == bytes32(0)) {
            console2.log("Buy order fully filled and removed");
        } else {
            console2.log("Buy order remaining quantity:", (buyOrderAfter.qty - buyOrderAfter.qty) / 1e18);
        }

        if (sellOrderAfter.id == bytes32(0)) {
            console2.log("Sell order fully filled and removed");
        } else {
            console2.log("Sell order remaining quantity:", (sellOrderAfter.qty - sellOrderAfter.qty) / 1e18);
        }

        // Verify order book state after matching
        int24 bestBidAfter = orderBook.bestBidPrice();
        int24 bestAskAfter = orderBook.bestAskPrice();
        console2.log("Best Bid Price after match:", bestBidAfter);
        console2.log("Best Ask Price after match:", bestAskAfter);

        // Verify final collateral balances
        uint256 buyerCollateral = vault.balanceOf(buyer);
        uint256 sellerCollateral = vault.balanceOf(seller);
        console2.log("Final buyer collateral:", buyerCollateral / 1e18, "tokens");
        console2.log("Final seller collateral:", sellerCollateral / 1e18, "tokens");

        // Both should still have their initial collateral as no PnL has been realized
        assertEq(buyerCollateral, INITIAL_COLLATERAL, "Buyer collateral should remain unchanged");
        assertEq(sellerCollateral, INITIAL_COLLATERAL, "Seller collateral should remain unchanged");
    }
}