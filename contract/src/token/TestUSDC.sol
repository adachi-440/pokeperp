// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { ERC20 } from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";

contract TestUSDC is ERC20, Ownable {
    uint8 private immutable _tokenDecimals;

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_
    )
        ERC20(name_, symbol_)
        Ownable(msg.sender)
    {
        _tokenDecimals = decimals_;
    }

    function decimals() public view override returns (uint8) {
        return _tokenDecimals;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }
}
