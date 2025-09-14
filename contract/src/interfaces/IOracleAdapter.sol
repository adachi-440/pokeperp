// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface IOracleAdapter {
    function indexPrice() external view returns (uint256);

    function markPrice() external view returns (uint256);

    function getLatestPrice() external view returns (uint256 price, uint256 timestamp);
}