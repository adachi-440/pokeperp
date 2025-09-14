// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Test } from "forge-std/src/Test.sol";
import { StdStorage, stdStorage } from "forge-std/src/StdStorage.sol";

import { OracleAdapterSimple } from "../src/OracleAdapterSimple.sol";

contract OracleAdapterSimpleTest is Test {
    using stdStorage for StdStorage;
    // `stdstore` は Test(Base) に定義済み
    OracleAdapterSimple internal oracle;

    address internal constant REPORTER = address(0xBEEF);
    address internal constant NON_REPORTER = address(0xABCD);

    uint64 internal constant SCALE = 100; // 1e2
    uint64 internal constant HEARTBEAT = 10; // sec

    // Mirror events for expectEmit
    event PricePushed(uint256 price, uint64 timestamp, address indexed reporter);
    event ReporterUpdated(address indexed oldReporter, address indexed newReporter);
    event HeartbeatUpdated(uint64 oldHeartbeat, uint64 newHeartbeat);
    event Paused(bool paused);

    function setUp() public virtual {
        // Deployer = this test contract => owner
        oracle = new OracleAdapterSimple(REPORTER, SCALE, HEARTBEAT);
    }

    function test_InitState() external view {
        // デフォルト状態の確認
        assertEq(oracle.priceScale(), SCALE, "scale");
        assertEq(oracle.heartbeat(), HEARTBEAT, "heartbeat");
        assertEq(oracle.lastUpdated(), 0, "lastUpdated");
        assertEq(oracle.indexPrice(), 0, "price0");
        assertEq(oracle.markPrice(), 0, "price0");
        assertEq(oracle.paused(), false, "paused0");

        // 最初は lastUpdated=0 のため isFresh は false（now - 0 > heartbeat）
        assertFalse(oracle.isFresh(), "fresh0");
    }

    function test_PushPrice_UpdatesStateAndEmits() external {
        uint256 price = 302_512; // $3025.12 @ scale=1e2
        uint64 t0 = 1_000;
        vm.warp(t0);

        // 期待イベント（reporter の indexed も検査）
        vm.expectEmit(true, true, false, true, address(oracle));
        emit PricePushed(price, t0, REPORTER);

        vm.prank(REPORTER);
        oracle.pushPrice(price);

        assertEq(oracle.indexPrice(), price, "index");
        assertEq(oracle.markPrice(), price, "mark");
        assertEq(oracle.lastUpdated(), t0, "ts");
        assertTrue(oracle.isFresh(), "fresh");
    }

    function test_PushPrice_Reverts_NotReporter() external {
        uint256 price = 100;
        vm.expectRevert(OracleAdapterSimple.NotReporter.selector);
        vm.prank(NON_REPORTER);
        oracle.pushPrice(price);
    }

    function test_PushPrice_Reverts_Paused() external {
        oracle.pause(true);
        vm.expectRevert(OracleAdapterSimple.PausedErr.selector);
        vm.prank(REPORTER);
        oracle.pushPrice(100);
    }

    function test_PushPrice_Reverts_ZeroPrice() external {
        vm.expectRevert(OracleAdapterSimple.BadPrice.selector);
        vm.prank(REPORTER);
        oracle.pushPrice(0);
    }

    function test_Admin_SetReporter() external {
        address newRep = address(0xCAFE);

        // not owner -> revert
        vm.expectRevert(OracleAdapterSimple.NotOwner.selector);
        vm.prank(NON_REPORTER);
        oracle.setReporter(newRep);

        // event + success by owner
        vm.expectEmit(true, true, false, true, address(oracle));
        emit ReporterUpdated(REPORTER, newRep);
        oracle.setReporter(newRep);

        // 新レポーターでプッシュ可能
        vm.prank(newRep);
        oracle.pushPrice(777);
        assertEq(oracle.indexPrice(), 777);
    }

    function test_Admin_SetHeartbeat_AffectsFreshness() external {
        // 初回プッシュで鮮度を true に
        vm.warp(10);
        vm.prank(REPORTER);
        oracle.pushPrice(123);

        // デフォルト HEARTBEAT=10: ちょうど境界では fresh
        vm.warp(20);
        assertTrue(oracle.isFresh(), "boundary fresh");

        // 境界+1秒で stale
        vm.warp(21);
        assertFalse(oracle.isFresh(), "+1 stale");

        // ハートビートを20に拡張（イベント）
        vm.expectEmit(false, false, false, true, address(oracle));
        emit HeartbeatUpdated(HEARTBEAT, 20);
        oracle.setHeartbeat(20);

        // 直近 lastUpdated は 10、現在 21、差分 11 <= 20 なので fresh
        assertTrue(oracle.isFresh(), "after hb change fresh");
    }

    function test_Admin_PauseAndUnpause_Emits() external {
        // pause -> event
        vm.expectEmit(false, false, false, true, address(oracle));
        emit Paused(true);
        oracle.pause(true);
        assertTrue(oracle.paused(), "paused");

        // unpause -> event
        vm.expectEmit(false, false, false, true, address(oracle));
        emit Paused(false);
        oracle.pause(false);
        assertFalse(oracle.paused(), "unpaused");
    }

    function test_Admin_SetHeartbeat_Reverts_NotOwner() external {
        vm.expectRevert(OracleAdapterSimple.NotOwner.selector);
        vm.prank(NON_REPORTER);
        oracle.setHeartbeat(20);
    }

    function test_IsFresh_DoesNotUnderflow_WhenLastUpdatedInFuture() external {
        // 現在時刻を 100 に設定
        vm.warp(100);
        // lastUpdated を将来時刻 200 に改ざん
        stdstore.target(address(oracle)).sig("lastUpdated()").checked_write(uint64(200));
        // view が revert せず false/true いずれかを返す（実装は飽和差分→dt=0で true）
        assertTrue(oracle.isFresh(), "fresh when future ts saturates to 0");
    }

    function test_Constructor_And_Setters_ZeroValue_Revert() external {
        // コンストラクタ: reporter=0 は BadConfig で revert
        vm.expectRevert(OracleAdapterSimple.BadConfig.selector);
        new OracleAdapterSimple(address(0), SCALE, HEARTBEAT);

        // setReporter(0) は BadConfig
        vm.expectRevert(OracleAdapterSimple.BadConfig.selector);
        oracle.setReporter(address(0));

        // setHeartbeat(0) は BadConfig
        vm.expectRevert(OracleAdapterSimple.BadConfig.selector);
        oracle.setHeartbeat(0);
    }
}
