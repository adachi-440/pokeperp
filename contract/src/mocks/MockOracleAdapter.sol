// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";

contract MockOracleAdapter is IOracleAdapter {
    uint256 private _indexPrice;
    uint256 private _markPrice;
    uint256 private _lastUpdateTimestamp;

    constructor(uint256 initialPrice) {
        _indexPrice = initialPrice;
        _markPrice = initialPrice;
        _lastUpdateTimestamp = block.timestamp;
    }

    function indexPrice() external view override returns (uint256) {
        return _indexPrice;
    }

    function markPrice() external view override returns (uint256) {
        return _markPrice;
    }

    function getLatestPrice() external view override returns (uint256 price, uint256 timestamp) {
        return (_markPrice, _lastUpdateTimestamp);
    }

    function setIndexPrice(uint256 price) external {
        _indexPrice = price;
        _lastUpdateTimestamp = block.timestamp;
    }

    function setMarkPrice(uint256 price) external {
        _markPrice = price;
        _lastUpdateTimestamp = block.timestamp;
    }

    function setPrices(uint256 index, uint256 mark) external {
        _indexPrice = index;
        _markPrice = mark;
        _lastUpdateTimestamp = block.timestamp;
    }

    function simulatePriceMovement(int256 percentChange) external {
        require(percentChange > -10000 && percentChange < 10000, "Unrealistic price change");

        uint256 adjustedIndex = (_indexPrice * uint256(10000 + percentChange)) / 10000;
        uint256 adjustedMark = (_markPrice * uint256(10000 + percentChange)) / 10000;

        _indexPrice = adjustedIndex;
        _markPrice = adjustedMark;
        _lastUpdateTimestamp = block.timestamp;
    }
}