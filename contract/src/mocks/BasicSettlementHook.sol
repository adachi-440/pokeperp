// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ISettlementHook } from "../interfaces/ISettlementHook.sol";

contract BasicSettlementHook is ISettlementHook {
    struct Trade {
        address buyer;
        address seller;
        int256 price;
        uint256 qty;
        uint256 timestamp;
        bytes32 buyOrderId;
        bytes32 sellOrderId;
    }

    Trade[] public trades;
    mapping(address => uint256) public traderVolume;
    mapping(address => uint256) public traderTradeCount;

    event TradeRecorded(
        address indexed buyer,
        address indexed seller,
        int256 price,
        uint256 qty,
        uint256 timestamp
    );

    function onMatch(MatchInfo calldata matchInfo) external override {
        trades.push(Trade({
            buyer: matchInfo.buyer,
            seller: matchInfo.seller,
            price: matchInfo.price,
            qty: matchInfo.qty,
            timestamp: matchInfo.timestamp,
            buyOrderId: matchInfo.buyOrderId,
            sellOrderId: matchInfo.sellOrderId
        }));

        traderVolume[matchInfo.buyer] += matchInfo.qty;
        traderVolume[matchInfo.seller] += matchInfo.qty;
        traderTradeCount[matchInfo.buyer]++;
        traderTradeCount[matchInfo.seller]++;

        emit TradeRecorded(
            matchInfo.buyer,
            matchInfo.seller,
            matchInfo.price,
            matchInfo.qty,
            matchInfo.timestamp
        );
    }

    function beforeMatch(
        address buyer,
        address seller,
        int256 price,
        uint256 qty
    ) external pure override returns (bool) {
        // Basic validation - can be extended for more complex checks
        require(buyer != address(0), "Invalid buyer");
        require(seller != address(0), "Invalid seller");
        require(buyer != seller, "Self-trading not allowed");
        require(qty > 0, "Invalid quantity");
        // Price validation can be more flexible with int256
        require(price > 0, "Price must be positive");

        return true;
    }

    function getTradeCount() external view returns (uint256) {
        return trades.length;
    }

    function getTrade(uint256 index) external view returns (Trade memory) {
        require(index < trades.length, "Invalid index");
        return trades[index];
    }

    function getTraderStats(address trader) external view returns (uint256 volume, uint256 tradeCount) {
        return (traderVolume[trader], traderTradeCount[trader]);
    }

    function reset() external {
        delete trades;
    }
}