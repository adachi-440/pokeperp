// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

interface IPerpFundingView {
    function pendingFundingPnL(address user) external view returns (int256);
}

