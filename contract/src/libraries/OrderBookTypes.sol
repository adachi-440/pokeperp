// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

library OrderBookTypes {
    struct MarketCfg {
        uint256 minQty;
        uint256 minNotional;
        uint256 deviationLimit;
        address oracleAdapter;
        address settlementHook;
        bool paused;
    }

    struct Order {
        bytes32 id;
        address trader;
        bool isBid;
        int256 price;
        uint256 qty;
        uint256 filledQty;
        uint256 timestamp;
        bytes32 nextId;
        bytes32 prevId;
    }

    struct Level {
        uint256 totalQty;
        bytes32 headId;
        bytes32 tailId;
    }

    struct BookState {
        int256 bestBidPrice;
        int256 bestAskPrice;
        uint256 nextOrderId;
        mapping(bytes32 => Order) orders;
        mapping(bool => mapping(int256 => Level)) levels;
        mapping(address => bytes32[]) traderOrders;
    }

    int256 constant NULL_PRICE = type(int256).min;
    uint256 constant PRICE_SPACING = 1;
    uint256 constant PRICE_DECIMALS = 18;
}