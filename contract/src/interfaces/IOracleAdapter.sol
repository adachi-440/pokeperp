// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

interface IOracleAdapter {
    function markPrice() external view returns (uint256);
}

