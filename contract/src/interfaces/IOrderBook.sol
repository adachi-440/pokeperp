// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IOrderBook {
    struct Order {
        bytes32 id;
        address trader;
        bool isBid;
        int256 price;
        uint256 qty;
        uint256 timestamp;
        bytes32 nextId;
        bytes32 prevId;
    }

    struct Level {
        uint256 totalQty;
        bytes32 headId;
        bytes32 tailId;
    }

    event OrderPlaced(
        bytes32 indexed orderId, address indexed trader, bool isBid, int256 price, uint256 qty, uint256 timestamp
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

    function place(bool isBid, int256 price, uint256 qty) external returns (bytes32 orderId);

    function matchAtBest(uint256 stepsMax) external returns (uint256 matched);

    function bestBidPrice() external view returns (int256);

    function bestAskPrice() external view returns (int256);

    function orderOf(bytes32 orderId) external view returns (Order memory);

    function levelOf(bool isBid, int256 price) external view returns (Level memory);

    function getOpenOrders(address trader) external view returns (bytes32[] memory orderIds);
}
