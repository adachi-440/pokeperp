// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { IVault } from "../interfaces/IVault.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";

contract PerpEngine {
    struct Position {
        int256 size;
        int256 entryNotional;
    }

    event PositionChanged(address indexed user, int256 newSize, int256 realizedPnl);

    uint256 public immutable tickSize; // price granularity (1e18 scale)
    uint256 public immutable contractSize; // $ per size (1e18 scale)

    IVault public immutable vault;
    IRiskEngine public risk;
    IOracleAdapter public immutable oracle; // kept for completeness (mark=Index)

    mapping(address => Position) public positions;
    address public owner;

    modifier onlyOwner() {
        require(msg.sender == owner, "not-owner");
        _;
    }

    constructor(IVault _vault, IRiskEngine _risk, IOracleAdapter _oracle, uint256 _tickSize, uint256 _contractSize) {
        require(address(_vault) != address(0) && address(_risk) != address(0), "bad-addr");
        require(_tickSize > 0 && _contractSize > 0, "bad-cfg");
        vault = _vault;
        risk = _risk;
        oracle = _oracle;
        tickSize = _tickSize;
        contractSize = _contractSize;
        owner = msg.sender;
    }

    function setRisk(IRiskEngine _risk) external onlyOwner {
        require(address(_risk) != address(0), "bad");
        risk = _risk;
    }

    function getPosition(address user) external view returns (Position memory p) {
        p = positions[user];
    }

    // priceTick and qty are discrete (uint64/uint128 in spec); using uint256 for simplicity
    function applyFill(address buyer, address seller, uint256 priceTick, uint256 qty) external {
        require(buyer != address(0) && seller != address(0) && buyer != seller, "bad-party");
        require(qty > 0 && priceTick > 0, "bad-fill");
        uint256 price = priceTick * tickSize; // 1e18 scale

        int256 realizedBuyer = _apply(buyer, true, price, qty);
        int256 realizedSeller = _apply(seller, false, price, qty);

        // Health check post-application (MM threshold)
        risk.requireHealthyMM(buyer);
        risk.requireHealthyMM(seller);

        emit PositionChanged(buyer, positions[buyer].size, realizedBuyer);
        emit PositionChanged(seller, positions[seller].size, realizedSeller);
    }

    function _apply(address user, bool isBuy, uint256 price, uint256 qty) internal returns (int256 realizedPnl) {
        Position storage p = positions[user];
        int256 sgnTrade = isBuy ? int256(int8(1)) : int256(int8(-1));
        int256 tradeSize = sgnTrade * int256(qty);
        int256 prevSize = p.size;

        // Same direction or flat → extend
        if (prevSize == 0 || (prevSize > 0 && isBuy) || (prevSize < 0 && !isBuy)) {
            p.size = prevSize + tradeSize;
            // entryNotional keeps sum(size * price) without contractSize
            p.entryNotional = p.entryNotional + (tradeSize * int256(price));
            return 0;
        }

        // Opposite direction → close then possibly flip
        uint256 matched = _min(uint256(_abs(prevSize)), qty);
        int256 avgEntry = p.entryNotional == 0 ? int256(price) : p.entryNotional / prevSize; // safe as prevSize != 0
            // here

        // realized = sign(prevSize) * matched * (price - avgEntry) * contractSize
        int256 signedMatched = (prevSize > 0) ? int256(matched) : -int256(matched);
        int256 priceDelta = int256(price) - avgEntry;
        realizedPnl = signedMatched * priceDelta / int256(1) * int256(contractSize) / int256(1e18);
        // Note: both price and contractSize are 1e18-scaled, so realizedPnl ends 1e18-scaled

        if (realizedPnl > 0) {
            IVault(address(vault)).credit(user, uint256(realizedPnl));
        } else if (realizedPnl < 0) {
            IVault(address(vault)).debit(user, uint256(-realizedPnl));
        }

        // Reduce current position by matched
        int256 reduceSize = (prevSize > 0) ? int256(matched) : -int256(matched);
        p.size = prevSize - reduceSize;
        p.entryNotional = p.entryNotional - (reduceSize * avgEntry);

        // If any remainder beyond closing → open new in opposite direction at trade price
        if (matched < qty) {
            uint256 openQty = qty - matched;
            int256 openSize = sgnTrade * int256(openQty);
            p.size = p.size + openSize;
            p.entryNotional = p.entryNotional + (openSize * int256(price));
        }
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }
}
