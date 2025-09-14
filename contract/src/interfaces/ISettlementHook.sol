// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

interface ISettlementHook {
    struct MatchInfo {
        address buyer;
        address seller;
        int24 tick;
        uint256 qty;
        uint256 timestamp;
        bytes32 buyOrderId;
        bytes32 sellOrderId;
    }

    function onMatch(MatchInfo calldata matchInfo) external;

    function beforeMatch(address buyer, address seller, int24 tick, uint256 qty) external view returns (bool);
}