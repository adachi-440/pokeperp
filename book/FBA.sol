// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

import {FBAHeap} from "./FBAHeap.sol";

contract FBA {

    bool constant ISBUY = true;
    bool constant ISSELL = false;

    // Separate heaps for bids and asks
    FBAHeap.Heap private bidHeap;
    FBAHeap.Heap private askHeap;

    // Fills and cancels
    Fill[] public fills; // This array length will be reset to 0 at the beginning of each `executeFills`
    Cancel[] public cancels; // This array length will be reset to 0 at the end of each cancel operation in `executeFills`

    struct Fill {
        uint256 price;
        uint256 amount;
    }

    struct Cancel {
        string orderId;
        bool side;
    }

    event FillEvent(Fill);
    event OrderPlace(uint256 price, uint256 amount, bool side);
    event OrderCancel(string orderId, bool side);

    /**
     * @notice Displays the fills
     */
    function displayFills(Fill[] memory _fills) public {
        for (uint256 i = 0; i < _fills.length; i++) {
            emit FillEvent(_fills[i]);
        }
    }

    /**
     * @notice Allows user to place a new order
     */
    function placeOrder(FBAHeap.Order memory ord) external {
        if (ord.side == ISBUY) {
            FBAHeap.insertOrder(ord, bidHeap);
        } else {
            FBAHeap.insertOrder(ord, askHeap);
        }

        emit OrderPlace(ord.price, ord.amount, ord.side);
    }

    /**
     * @notice Allows user to cancel an order they previously placed
     */
    function cancelOrder(string memory orderId, bool side) external {
        cancels.push(Cancel(orderId, side));
        emit OrderCancel(orderId, side);
    }

    /**
     * @notice Executes fills for the current state of the order book
     */
    function executeFills() external {
        // Reset fills
        delete fills;

        ////// First part: prioritize cancels
        for (uint256 i = 0; i < cancels.length; i++) {
            string memory orderId = cancels[i].orderId;
            bool side = cancels[i].side;

            // Skip if order doesn't exist (using low-level checks)
            if (side == ISBUY) {
                if (bidHeap.orderIdToIndex[orderId] > 0) {
                    FBAHeap.deleteOrder(orderId, ISBUY, bidHeap);
                }
            } else if (side == ISSELL) {
                if (askHeap.orderIdToIndex[orderId] > 0) {
                    FBAHeap.deleteOrder(orderId, ISSELL, askHeap);
                }
            }
        }
        delete cancels;

        ////// Second part: match orders
        FBAHeap.Order memory bidMax = FBAHeap.getTopOrder(bidHeap, ISBUY);
        FBAHeap.Order memory askMin = FBAHeap.getTopOrder(askHeap, ISSELL);

        // Calculate clearing price only if there are valid orders
        if (bidMax.price == 0 || askMin.price == type(uint256).max) {
            return; // No valid orders to match
        }

        uint256 clearingPrice = (bidMax.price + askMin.price) / 2;

        // Match orders as long as:
        // 1. The highest bid is greater than or equal to the lowest ask
        // 2. The clearing price is less than or equal to the highest bid and greater than or equal to the lowest ask
        while (bidMax.price >= askMin.price &&
               bidMax.price >= clearingPrice &&
               askMin.price <= clearingPrice &&
               bidMax.amount > 0 &&
               askMin.amount > 0) {

            if (bidMax.amount > askMin.amount) {
                fills.push(Fill(clearingPrice, askMin.amount));
                bidMax.amount -= askMin.amount;
                FBAHeap.updateOrder(bidMax, bidHeap);
                FBAHeap.deleteOrder(askMin.orderId, ISSELL, askHeap);
            } else if (bidMax.amount < askMin.amount) {
                fills.push(Fill(clearingPrice, bidMax.amount));
                askMin.amount -= bidMax.amount;
                FBAHeap.updateOrder(askMin, askHeap);
                FBAHeap.deleteOrder(bidMax.orderId, ISBUY, bidHeap);
            } else {
                fills.push(Fill(clearingPrice, bidMax.amount));
                FBAHeap.deleteOrder(bidMax.orderId, ISBUY, bidHeap);
                FBAHeap.deleteOrder(askMin.orderId, ISSELL, askHeap);
            }

            // Update bidMax and askMin
            bidMax = FBAHeap.getTopOrder(bidHeap, ISBUY);
            askMin = FBAHeap.getTopOrder(askHeap, ISSELL);

            // Check if we have valid orders before calculating new clearing price
            if (bidMax.price == 0 || askMin.price == type(uint256).max) {
                break;
            }

            clearingPrice = (bidMax.price + askMin.price) / 2;
        }

        // Emit all fills
        displayFills(fills);
    }

    /**
     * @notice Get top bid order
     */
    function getTopBid() external view returns (FBAHeap.Order memory) {
        return FBAHeap.getTopOrder(bidHeap, ISBUY);
    }

    /**
     * @notice Get top ask order
     */
    function getTopAsk() external view returns (FBAHeap.Order memory) {
        return FBAHeap.getTopOrder(askHeap, ISSELL);
    }

    /**
     * @notice Get all bids above a threshold
     */
    function getBidsAboveThreshold(uint256 threshold) external view returns (FBAHeap.Order[] memory) {
        return FBAHeap.getTopOrderList(threshold, ISBUY, bidHeap);
    }

    /**
     * @notice Get all asks below a threshold
     */
    function getAsksBelowThreshold(uint256 threshold) external view returns (FBAHeap.Order[] memory) {
        return FBAHeap.getTopOrderList(threshold, ISSELL, askHeap);
    }

    /**
     * @notice Get current fills
     */
    function getFills() external view returns (Fill[] memory) {
        return fills;
    }

    /**
     * @notice Get pending cancels
     */
    function getPendingCancels() external view returns (Cancel[] memory) {
        return cancels;
    }
}