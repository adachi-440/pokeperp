// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";

contract MockOracle is IOracleAdapter {
    uint256 public price;
    constructor(uint256 _price) { price = _price; }
    function setPrice(uint256 _price) external { price = _price; }
    function markPrice() external view returns (uint256) { return price; }
}

