// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

interface IVault {
    event Deposited(address indexed user, uint256 amount);
    event Withdrawn(address indexed user, uint256 amount);

    function deposit(uint256 amount) external; // test-only simple ledger
    function withdraw(uint256 amount) external;

    function credit(address user, uint256 amount) external; // +balance (PnL etc)
    function debit(address user, uint256 amount) external;   // -balance (loss etc)

    function balanceOf(address user) external view returns (uint256);
}
