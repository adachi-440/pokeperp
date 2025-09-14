// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { IVault } from "../interfaces/IVault.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";

contract Vault is IVault {
    mapping(address => uint256) private _balances;
    address public perp; // authorized for credit/debit
    IRiskEngine public risk;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not-owner");
        _;
    }

    modifier onlyPerp() {
        require(msg.sender == perp, "not-perp");
        _;
    }

    constructor(IRiskEngine _risk) {
        owner = msg.sender;
        risk = _risk;
    }

    function setPerp(address _perp) external onlyOwner {
        require(_perp != address(0), "bad");
        perp = _perp;
    }

    function setRisk(IRiskEngine _risk) external onlyOwner {
        require(address(_risk) != address(0), "bad");
        risk = _risk;
    }

    function deposit(uint256 amount) external override {
        require(amount > 0, "amount=0");
        _balances[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function withdraw(uint256 amount) external override {
        require(amount > 0, "amount=0");
        require(_balances[msg.sender] >= amount, "insufficient");

        // IM guard: equity - IM >= 0 after withdrawal
        // simulate post-withdraw equity = equityNow - amount
        int256 eqNow = risk.equity(msg.sender);
        uint256 im = risk.initialMargin(msg.sender);
        require(eqNow >= 0 && uint256(eqNow) >= amount + im, "im-guard");

        _balances[msg.sender] -= amount;
        emit Withdrawn(msg.sender, amount);
    }

    function credit(address user, uint256 amount) external override onlyPerp {
        _balances[user] += amount;
    }

    function debit(address user, uint256 amount) external override onlyPerp {
        require(_balances[user] >= amount, "vault-underflow");
        _balances[user] -= amount;
    }

    function balanceOf(address user) external view override returns (uint256) {
        return _balances[user];
    }
}
