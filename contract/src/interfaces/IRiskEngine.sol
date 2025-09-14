// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

interface IRiskEngine {
    function equity(address user) external view returns (int256);
    function initialMargin(address user) external view returns (uint256);
    function maintenanceMargin(address user) external view returns (uint256);
    function requireHealthyMM(address user) external view;
    function requireHealthyIM(address user) external view;
}
