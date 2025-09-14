// SPDX-License-Identifier: MIT
pragma solidity >=0.8.29 <0.9.0;

/// @title Oracle Adapter (Simple Push)
/// @notice 単一マーケット向けの最小限Push型オラクル。index == mark。
interface IOracleAdapter {
    function indexPrice() external view returns (uint256);
    function markPrice() external view returns (uint256);
}

/// @notice 管理I/F（onlyOwner想定）
interface IOracleAdmin {
    function setReporter(address reporter) external;
    function setHeartbeat(uint64 heartbeatSec) external;
    function pause(bool p) external;
}

/// @notice プッシュI/F（onlyReporter想定）
interface IOraclePush {
    function pushPrice(uint256 price) external;
}

/// @notice 参照系拡張
interface IOracleViewExt {
    function lastUpdated() external view returns (uint64);
    function heartbeat() external view returns (uint64);
    function isFresh() external view returns (bool);
    function priceScale() external view returns (uint64);
}

/// @notice 仕様に基づくシンプルなPush型Adapter実装
contract OracleAdapterSimple is IOracleAdapter, IOracleAdmin, IOraclePush, IOracleViewExt {
    address public owner;
    address public reporter;

    // 許容ハートビート（秒）および最終更新（epoch秒）
    uint64 public heartbeat;
    uint64 public lastUpdated;
    bool public paused; // 収納最適化のため heartbeat/lastUpdated 付近に配置

    // 価格スケール（例: 1e2）。OrderBookのtickSizeと一致させる。
    uint64 public immutable scale;

    // ミニMVP: index == mark
    uint256 private _price;

    // Events
    event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
    event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
    event Paused(bool paused);
    event OwnershipTransferred(address indexed oldOwner, address indexed newOwner);

    // Custom Errors
    error NotOwner();
    error NotReporter();
    error PausedErr();
    error BadPrice();
    error BadConfig();

    constructor(address _reporter, uint64 _scale, uint64 _heartbeat) {
        if (_reporter == address(0)) revert BadConfig();
        if (_scale == 0) revert BadConfig();
        if (_heartbeat == 0) revert BadConfig();
        owner = msg.sender;
        reporter = _reporter;
        scale = _scale;
        heartbeat = _heartbeat;
    }

    // --- modifiers ---
    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    modifier onlyReporter() {
        if (msg.sender != reporter) revert NotReporter();
        _;
    }

    // --- IOracleAdmin ---
    function setReporter(address r) external onlyOwner {
        if (r == address(0)) revert BadConfig();
        emit ReporterUpdated(reporter, r);
        reporter = r;
    }

    function setHeartbeat(uint64 hb) external onlyOwner {
        if (hb == 0) revert BadConfig();
        emit HeartbeatUpdated(heartbeat, hb);
        heartbeat = hb;
    }

    function pause(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        if (newOwner == address(0)) revert BadConfig();
        emit OwnershipTransferred(owner, newOwner);
        owner = newOwner;
    }

    // --- IOraclePush ---
    function pushPrice(uint256 price) external onlyReporter {
        if (paused) revert PausedErr();
        if (price == 0) revert BadPrice();
        _price = price;
        lastUpdated = uint64(block.timestamp);
        emit PricePushed(price, lastUpdated, msg.sender);
    }

    // --- IOracleAdapter ---
    function indexPrice() external view returns (uint256) { return _price; }
    function markPrice() external view returns (uint256) { return _price; }

    // --- IOracleViewExt ---
    function isFresh() external view returns (bool) {
        // 飽和差分（underflow回避）。過去ブロック異常等で lastUpdated > now でも view が落ちない。
        uint256 ts = block.timestamp;
        uint256 lu = lastUpdated;
        uint256 dt = ts >= lu ? ts - lu : 0;
        return dt <= heartbeat;
    }

    function priceScale() external view returns (uint64) { return scale; }

    // 一括 getter（監視/UIのRPC回数削減）
    function state() external view returns (
        uint256 price,
        uint64 lastUpd,
        uint64 hb,
        uint64 sc,
        bool p,
        address rep,
        address own
    ) {
        return (_price, lastUpdated, heartbeat, scale, paused, reporter, owner);
    }
}
