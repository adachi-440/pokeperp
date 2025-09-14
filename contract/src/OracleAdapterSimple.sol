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

    // 価格スケール（例: 1e2）。OrderBookのtickSizeと一致させる。
    uint64 public immutable scale;

    bool public paused;

    // ミニMVP: index == mark
    uint256 private _price;

    // Events
    event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
    event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
    event Paused(bool paused);

    constructor(address _reporter, uint64 _scale, uint64 _heartbeat) {
        owner = msg.sender;
        reporter = _reporter;
        scale = _scale;
        heartbeat = _heartbeat;
    }

    // --- modifiers ---
    modifier onlyOwner() {
        require(msg.sender == owner, "owner");
        _;
    }

    modifier onlyReporter() {
        require(msg.sender == reporter, "reporter");
        _;
    }

    // --- IOracleAdmin ---
    function setReporter(address r) external onlyOwner {
        emit ReporterUpdated(reporter, r);
        reporter = r;
    }

    function setHeartbeat(uint64 hb) external onlyOwner {
        emit HeartbeatUpdated(heartbeat, hb);
        heartbeat = hb;
    }

    function pause(bool p) external onlyOwner {
        paused = p;
        emit Paused(p);
    }

    // --- IOraclePush ---
    function pushPrice(uint256 price) external onlyReporter {
        require(!paused, "paused");
        require(price > 0, "price");
        _price = price;
        lastUpdated = uint64(block.timestamp);
        emit PricePushed(price, lastUpdated, msg.sender);
    }

    // --- IOracleAdapter ---
    function indexPrice() external view returns (uint256) { return _price; }
    function markPrice() external view returns (uint256) { return _price; }

    // --- IOracleViewExt ---
    function isFresh() external view returns (bool) {
        return uint64(block.timestamp) - lastUpdated <= heartbeat;
    }

    function priceScale() external view returns (uint64) { return scale; }
}

