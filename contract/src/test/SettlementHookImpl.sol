// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { ISettlementHook } from "../interfaces/ISettlementHook.sol";
import { PerpEngine } from "../perp/PerpEngine.sol";

contract SettlementHookImpl is ISettlementHook {
    PerpEngine public immutable perpEngine;

    event SettlementProcessed(
        address indexed buyer,
        address indexed seller,
        int24 price,
        uint256 qty,
        uint256 timestamp
    );

    constructor(address _perpEngine) {
        perpEngine = PerpEngine(_perpEngine);
    }

    function onMatch(MatchInfo calldata matchInfo) external override {
        // Convert int24 price to uint256 for PerpEngine
        // int24 represents price in basis points (e.g., 210000 = $2100)
        // PerpEngine expects priceTick in normal units (e.g., 2100)
        // which will be multiplied by tickSize (1e18) to get price in wei
        uint256 priceTick = uint256(uint24(matchInfo.price)) / 100; // 210000 / 100 = 2100

        // Apply the fill to the PerpEngine
        perpEngine.applyFill(
            matchInfo.buyer,
            matchInfo.seller,
            priceTick,
            matchInfo.qty
        );

        emit SettlementProcessed(
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
        int24 price,
        uint256 qty
    ) external view override returns (bool) {
        // Add any pre-match validation here if needed
        // For now, always allow matches
        return true;
    }
}