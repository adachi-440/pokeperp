// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { BaseScript } from "./Base.s.sol";
import { TestUSDC } from "../src/token/TestUSDC.sol";

contract DeployTestUSDC is BaseScript {
    // Deploys TestUSDC (6 decimals) and mints to a target address.
    // Env vars (optional):
    // - MINT_TO: address to receive tokens (defaults to broadcaster)
    // - MINT_AMOUNT: uint amount in smallest units (defaults to 1_000_000 * 10^6)
    function run() public broadcast returns (TestUSDC usdc) {
        usdc = new TestUSDC("Test USD Coin", "tUSDC", 6);

        address to = vm.envOr({ name: "MINT_TO", defaultValue: broadcaster });
        uint256 defaultAmount = 1_000_000 * 1e6; // 1,000,000 tUSDC
        uint256 amount = vm.envOr({ name: "MINT_AMOUNT", defaultValue: defaultAmount });

        usdc.mint(to, amount);
    }
}

