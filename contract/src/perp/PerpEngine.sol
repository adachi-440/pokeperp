// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.19;

import { IVault } from "../interfaces/IVault.sol";
import { IRiskEngine } from "../interfaces/IRiskEngine.sol";
import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";
import { Math } from "@openzeppelin/contracts/utils/math/Math.sol";
import { SignedMath } from "@openzeppelin/contracts/utils/math/SignedMath.sol";

contract PerpEngine {
    enum SkipReason {
        STALE,
        BAD_INDEX,
        NO_OI,
        PAUSED
    }
    struct Position {
        int256 size;
        int256 entryNotional;
    }

    event PositionChanged(address indexed user, int256 newSize, int256 realizedPnl);
    // Funding events
    event FundingUpdated(int256 prem, uint256 mark, uint256 index, uint256 dt, int256 ratePerSec, int256 dF, int256 cumulativeF);
    event FundingSkipped(SkipReason reason);
    event FundingSettled(address indexed user, int256 pnlWad, uint256 settledAmountVaultUnits, int256 cumulativeFAfter);
    event FundingParamsUpdated(
        uint256 fundingIntervalSec,
        uint256 maxFundingRatePerInterval,
        uint256 fundingMultiplier,
        uint256 maxCatchUpSec,
        uint256 minFundingSettleUsd
    );
    event FundingParamsScheduled(
        uint256 fundingIntervalSec,
        uint256 maxFundingRatePerInterval,
        uint256 fundingMultiplier,
        uint256 maxCatchUpSec,
        uint256 minFundingSettleUsd,
        uint64 eta
    );

    uint256 public immutable tickSize; // price granularity (1e18 scale)
    uint256 public immutable contractSize; // $ per size (1e18 scale)

    IVault public immutable vault;
    IRiskEngine public risk;
    IOracleAdapter public immutable oracle; // kept for completeness (mark=Index)

    mapping(address => Position) public positions;
    address public owner;

    // --- Funding state ---
    int256 public cumulativeFundingPerSize; // F (USD/contract, 1e18)
    uint64 public lastFundingTime;
    uint256 public fundingIntervalSec;        // e.g., 8h
    uint256 public maxFundingRatePerInterval; // e.g., 0.5% (0.005e18)
    uint256 public fundingMultiplier;         // 1e18
    uint256 public maxCatchUpSec;             // e.g., 1d
    uint256 public minFundingSettleUsd;       // dust threshold (1e18 scale)
    mapping(address => int256) public userFundingIndex;
    mapping(address => int256) private _userFundingDust; // signed WAD dust accumulator
    uint256 public openInterestAbs; // Σ|size|

    bool private _settleLock; // simple non-reentrancy for settleFunding
    bool public fundingPaused;
    // simple timelock-like scheduling for funding params
    uint256 public fundingParamsMinDelay; // seconds
    struct FundingParamsPending {
        uint256 fundingIntervalSec;
        uint256 maxFundingRatePerInterval;
        uint256 fundingMultiplier;
        uint256 maxCatchUpSec;
        uint256 minFundingSettleUsd;
        uint64 eta;
        bool exists;
    }
    FundingParamsPending public pendingFundingParams;

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

        // default funding params: 8h, ±0.5%/interval, multiplier=1, catch-up 1d, dust=$0.0001
        fundingIntervalSec = 8 hours;
        maxFundingRatePerInterval = 0.005e18; // 0.5%
        fundingMultiplier = 1e18;
        maxCatchUpSec = 1 days;
        minFundingSettleUsd = 1e14;
        fundingParamsMinDelay = 0; // can be raised by owner
    }

    function setRisk(IRiskEngine _risk) external onlyOwner {
        require(address(_risk) != address(0), "bad");
        risk = _risk;
    }

    function getPosition(address user) external view returns (Position memory p) {
        p = positions[user];
    }

    function setFundingParams(
        uint256 _fundingIntervalSec,
        uint256 _maxFundingRatePerInterval,
        uint256 _fundingMultiplier,
        uint256 _maxCatchUpSec,
        uint256 _minFundingSettleUsd
    ) external onlyOwner {
        require(_fundingIntervalSec > 0 && _maxFundingRatePerInterval > 0 && _fundingMultiplier > 0, "bad-fp");
        fundingIntervalSec = _fundingIntervalSec;
        maxFundingRatePerInterval = _maxFundingRatePerInterval;
        fundingMultiplier = _fundingMultiplier;
        maxCatchUpSec = _maxCatchUpSec;
        minFundingSettleUsd = _minFundingSettleUsd;
        emit FundingParamsUpdated(_fundingIntervalSec, _maxFundingRatePerInterval, _fundingMultiplier, _maxCatchUpSec, _minFundingSettleUsd);
    }

    function setFundingParamsMinDelay(uint256 delaySec) external onlyOwner {
        fundingParamsMinDelay = delaySec;
    }

    function scheduleFundingParams(
        uint256 _fundingIntervalSec,
        uint256 _maxFundingRatePerInterval,
        uint256 _fundingMultiplier,
        uint256 _maxCatchUpSec,
        uint256 _minFundingSettleUsd,
        uint64 eta
    ) external onlyOwner {
        require(_fundingIntervalSec > 0 && _maxFundingRatePerInterval > 0 && _fundingMultiplier > 0, "bad-fp");
        require(eta >= block.timestamp + fundingParamsMinDelay, "eta-too-soon");
        pendingFundingParams = FundingParamsPending({
            fundingIntervalSec: _fundingIntervalSec,
            maxFundingRatePerInterval: _maxFundingRatePerInterval,
            fundingMultiplier: _fundingMultiplier,
            maxCatchUpSec: _maxCatchUpSec,
            minFundingSettleUsd: _minFundingSettleUsd,
            eta: eta,
            exists: true
        });
        emit FundingParamsScheduled(
            _fundingIntervalSec,
            _maxFundingRatePerInterval,
            _fundingMultiplier,
            _maxCatchUpSec,
            _minFundingSettleUsd,
            eta
        );
    }

    function executeScheduledFundingParams() external onlyOwner {
        FundingParamsPending memory p = pendingFundingParams;
        require(p.exists, "no-pending");
        require(block.timestamp >= p.eta, "not-yet");
        // apply
        fundingIntervalSec = p.fundingIntervalSec;
        maxFundingRatePerInterval = p.maxFundingRatePerInterval;
        fundingMultiplier = p.fundingMultiplier;
        maxCatchUpSec = p.maxCatchUpSec;
        minFundingSettleUsd = p.minFundingSettleUsd;
        // clear
        delete pendingFundingParams;
        emit FundingParamsUpdated(p.fundingIntervalSec, p.maxFundingRatePerInterval, p.fundingMultiplier, p.maxCatchUpSec, p.minFundingSettleUsd);
    }

    function setFundingPaused(bool p) external onlyOwner {
        fundingPaused = p;
    }

    // --- Funding core ---
    function updateFunding() public {
        uint256 nowTs = block.timestamp;
        uint256 last = lastFundingTime;
        uint256 dt = nowTs > last ? nowTs - last : 0;
        if (dt == 0) return;

        if (fundingPaused) {
            lastFundingTime = uint64(nowTs);
            emit FundingSkipped(SkipReason.PAUSED);
            return;
        }

        // Skip when no OI
        if (openInterestAbs == 0) {
            lastFundingTime = uint64(nowTs);
            emit FundingSkipped(SkipReason.NO_OI);
            return;
        }

        uint256 mark = oracle.markPrice();
        uint256 index = oracle.indexPrice();
        if (index == 0) {
            lastFundingTime = uint64(nowTs);
            emit FundingSkipped(SkipReason.BAD_INDEX);
            return;
        }

        // Optional freshness via dynamic call if available
        (bool ok, bytes memory data) = address(oracle).staticcall(abi.encodeWithSignature("isFresh()"));
        if (ok) {
            bool fresh = abi.decode(data, (bool));
            if (!fresh) {
                lastFundingTime = uint64(nowTs);
                emit FundingSkipped(SkipReason.STALE);
                return;
            }
        }

        if (dt > maxCatchUpSec && maxCatchUpSec > 0) dt = maxCatchUpSec;

        (int256 prem, int256 ratePerSec, int256 dF) = _computeFunding(mark, index, dt);

        cumulativeFundingPerSize += dF;
        lastFundingTime = uint64(nowTs);

        emit FundingUpdated(prem, mark, index, dt, ratePerSec, dF, cumulativeFundingPerSize);
    }

    function _settleFundingInternal(address user) internal returns (int256 pnlWad, uint256 settledAmt) {
        int256 F = cumulativeFundingPerSize;
        int256 Fu = userFundingIndex[user];
        int256 delta = F - Fu; // signed WAD

        int256 size = positions[user].size; // signed contracts
        pnlWad = - (size * delta) / int256(1e18); // signed WAD USD

        // accumulate dust and flush when threshold reached
        int256 accum = _userFundingDust[user] + pnlWad;
        uint256 absAccum = SignedMath.abs(accum);
        if (absAccum >= minFundingSettleUsd) {
            if (accum >= 0) {
                IVault(address(vault)).credit(user, absAccum);
            } else {
                IVault(address(vault)).debit(user, absAccum);
            }
            _userFundingDust[user] = 0;
            settledAmt = absAccum;
        } else {
            _userFundingDust[user] = accum;
            settledAmt = 0;
        }

        userFundingIndex[user] = F;
        emit FundingSettled(user, pnlWad, settledAmt, F);
    }

    function settleFunding(address user) external {
        require(user != address(0), "bad-user");
        require(!_settleLock, "reentrancy");
        _settleLock = true;
        updateFunding();
        _settleFundingInternal(user);
        _settleLock = false;
    }

    function previewCumulativeFunding() public view returns (int256 Fpreview) {
        uint256 nowTs = block.timestamp;
        uint256 last = lastFundingTime;
        uint256 dt = nowTs > last ? nowTs - last : 0;
        if (dt == 0 || openInterestAbs == 0) {
            return cumulativeFundingPerSize;
        }
        uint256 mark = oracle.markPrice();
        uint256 index = oracle.indexPrice();
        if (index == 0) return cumulativeFundingPerSize;
        if (maxCatchUpSec > 0 && dt > maxCatchUpSec) dt = maxCatchUpSec;
        (, , int256 dF) = _computeFunding(mark, index, dt);
        return cumulativeFundingPerSize + dF;
    }

    function pendingFundingPnL(address user) external view returns (int256) {
        int256 Fprev = userFundingIndex[user];
        int256 Fnow = previewCumulativeFunding();
        int256 delta = Fnow - Fprev;
        int256 size = positions[user].size;
        return - (size * delta) / int256(1e18);
    }

    // priceTick and qty are discrete (uint64/uint128 in spec); using uint256 for simplicity
    function applyFill(address buyer, address seller, uint256 priceTick, uint256 qty) external {
        require(buyer != address(0) && seller != address(0) && buyer != seller, "bad-party");
        require(qty > 0 && priceTick > 0, "bad-fill");
        uint256 price = priceTick * tickSize; // 1e18 scale

        // Funding: accumulate and settle for both parties before applying trade
        require(!_settleLock, "reentrancy");
        _settleLock = true;
        updateFunding();
        _settleFundingInternal(buyer);
        _settleFundingInternal(seller);

        int256 realizedBuyer = _apply(buyer, true, price, qty);
        int256 realizedSeller = _apply(seller, false, price, qty);

        // Health check post-application (MM threshold)
        risk.requireHealthyMM(buyer);
        risk.requireHealthyMM(seller);

        emit PositionChanged(buyer, positions[buyer].size, realizedBuyer);
        emit PositionChanged(seller, positions[seller].size, realizedSeller);
        _settleLock = false;
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
            // update OI
            _updateOpenInterest(prevSize, p.size);
            if (p.size == 0) {
                _forceFlushDust(user);
            }
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

        // update OI at end
        _updateOpenInterest(prevSize, p.size);
        if (p.size == 0) {
            _forceFlushDust(user);
        }
    }

    function _abs(int256 x) internal pure returns (uint256) {
        return uint256(x >= 0 ? x : -x);
    }

    function _min(uint256 a, uint256 b) internal pure returns (uint256) {
        return a < b ? a : b;
    }

    function _clamp(int256 x, int256 minV, int256 maxV) internal pure returns (int256) {
        if (x < minV) return minV;
        if (x > maxV) return maxV;
        return x;
    }

    function _updateOpenInterest(int256 prevSize, int256 newSize) internal {
        uint256 prevAbs = _abs(prevSize);
        uint256 newAbs = _abs(newSize);
        if (newAbs >= prevAbs) {
            openInterestAbs += (newAbs - prevAbs);
        } else {
            openInterestAbs -= (prevAbs - newAbs);
        }
    }

    function _computeFunding(uint256 mark, uint256 index, uint256 dt)
        internal
        view
        returns (int256 prem, int256 ratePerSec, int256 dF)
    {
        // prem = (mark-index)/index (signed WAD), computed with mulDiv to avoid overflow
        if (mark >= index) {
            uint256 diff = mark - index;
            uint256 val = Math.mulDiv(diff, 1e18, index);
            prem = int256(val);
        } else {
            uint256 diff = index - mark;
            uint256 val = Math.mulDiv(diff, 1e18, index);
            prem = -int256(val);
        }
        // clamp by cap per interval
        int256 cap = int256(maxFundingRatePerInterval);
        int256 premClamped = _clamp(prem, -cap, cap);
        // ratePerSec (signed WAD)
        ratePerSec = (premClamped * int256(fundingMultiplier)) / int256(fundingIntervalSec);
        // notional per contract (WAD)
        uint256 notionalPerContract = Math.mulDiv(mark, contractSize, 1e18);
        // dF = |rate|*dt * notional / 1e18 with sign of rate
        uint256 absRate = uint256(ratePerSec >= 0 ? ratePerSec : -ratePerSec);
        uint256 tmp = absRate * dt; // WAD
        uint256 dF_abs = Math.mulDiv(tmp, notionalPerContract, 1e18);
        dF = ratePerSec >= 0 ? int256(dF_abs) : -int256(dF_abs);
    }

    function _forceFlushDust(address user) internal {
        int256 accum = _userFundingDust[user];
        if (accum == 0) return;
        uint256 amt = SignedMath.abs(accum);
        if (accum > 0) {
            IVault(address(vault)).credit(user, amt);
        } else {
            IVault(address(vault)).debit(user, amt);
        }
        _userFundingDust[user] = 0;
    }

    // Monitoring view: returns (premClamped, ratePerSec, notionalPerContract)
    function currentFundingRate() external view returns (int256 premClamped, int256 ratePerSec, uint256 notionalPerContract) {
        uint256 mark = oracle.markPrice();
        uint256 index = oracle.indexPrice();
        notionalPerContract = Math.mulDiv(mark, contractSize, 1e18);

        // optional freshness check
        (bool ok, bytes memory data) = address(oracle).staticcall(abi.encodeWithSignature("isFresh()"));
        bool fresh = true;
        if (ok) {
            fresh = abi.decode(data, (bool));
        }

        if (fundingPaused || openInterestAbs == 0 || index == 0 || !fresh) {
            return (int256(0), int256(0), notionalPerContract);
        }

        int256 prem;
        if (mark >= index) {
            uint256 diff = mark - index;
            uint256 val = Math.mulDiv(diff, 1e18, index);
            prem = int256(val);
        } else {
            uint256 diff = index - mark;
            uint256 val = Math.mulDiv(diff, 1e18, index);
            prem = -int256(val);
        }
        int256 cap = int256(maxFundingRatePerInterval);
        premClamped = _clamp(prem, -cap, cap);
        ratePerSec = (premClamped * int256(fundingMultiplier)) / int256(fundingIntervalSec);
    }
}
