// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { IVault } from "../interfaces/IVault.sol";
import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";

interface IPerpPositions {
    function positions(address user) external view returns (int256 size, int256 entryNotional);
}

contract RiskEngine is IRiskEngine {
    // Parameters are 1e18-scaled ratios where applicable
    uint256 public imr; // initial margin ratio 1e18
    uint256 public mmr; // maintenance margin ratio 1e18
    uint256 public contractSize; // $ per size (1e18)

    IVault public vault;
    IOracleAdapter public oracle;
    IPerpPositions public perp;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not-owner");
        _;
    }

    constructor(
        IVault _vault,
        IOracleAdapter _oracle,
        IPerpPositions _perp,
        uint256 _imr,
        uint256 _mmr,
        uint256 _contractSize
    ) {
        owner = msg.sender;
        vault = _vault;
        oracle = _oracle;
        perp = _perp;
        require(_imr > 0 && _mmr > 0 && _contractSize > 0, "bad-cfg");
        require(_imr >= _mmr, "imr<mmr");
        imr = _imr;
        mmr = _mmr;
        contractSize = _contractSize;
    }

    function setParams(uint256 _imr, uint256 _mmr, uint256 _contractSize) external onlyOwner {
        require(_imr > 0 && _mmr > 0 && _contractSize > 0, "bad");
        require(_imr >= _mmr, "imr<mmr");
        imr = _imr;
        mmr = _mmr;
        contractSize = _contractSize;
    }

    function setLinks(IVault _vault, IOracleAdapter _oracle, IPerpPositions _perp) external onlyOwner {
        vault = _vault;
        oracle = _oracle;
        perp = _perp;
    }

    // Views per spec minimal
    function equity(address user) public view returns (int256) {
        (int256 size, int256 entryNotional) = perp.positions(user);
        uint256 mark = oracle.markPrice();
        if (size == 0) {
            return int256(vault.balanceOf(user));
        }
        int256 avgEntry = entryNotional / size; // price 1e18
        int256 upnl = size * (int256(mark) - avgEntry) * int256(contractSize) / int256(1e18);
        return int256(vault.balanceOf(user)) + upnl;
    }

    function notional(address user) public view returns (uint256) {
        (int256 size,) = perp.positions(user);
        if (size == 0) return 0;
        uint256 mark = oracle.markPrice();
        return _abs(size) * mark / 1e18 * contractSize; // (|size| * mark) is 1e18, then *contractSize/1e18
    }

    function initialMargin(address user) public view returns (uint256) {
        uint256 notion = notional(user);
        return notion * imr / 1e18;
    }

    function maintenanceMargin(address user) public view returns (uint256) {
        uint256 notion = notional(user);
        return notion * mmr / 1e18;
    }

    function requireHealthyIM(address user) external view {
        int256 eq = equity(user);
        uint256 im = initialMargin(user);
        require(eq >= 0 && uint256(eq) >= im, "im-breach");
    }

    function requireHealthyMM(address user) external view {
        int256 eq = equity(user);
        uint256 mm = maintenanceMargin(user);
        require(eq >= 0 && uint256(eq) >= mm, "mm-breach");
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }
}
