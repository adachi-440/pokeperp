// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { Script } from "forge-std/src/Script.sol";
import { console2 } from "forge-std/src/console2.sol";
import { OracleAdapterSimple } from "../src/OracleAdapterSimple.sol";

contract DeployOracle is Script {
    function run() external {
        address reporter = vm.envAddress("REPORTER");
        uint64 scale = uint64(vm.envUint("SCALE"));
        uint64 heartbeat = uint64(vm.envUint("HEARTBEAT"));

        vm.startBroadcast();
        OracleAdapterSimple oracle = new OracleAdapterSimple(reporter, scale, heartbeat);
        vm.stopBroadcast();

        // 出力
        console2.log("OracleAdapterSimple deployed:", address(oracle));
        console2.log("reporter:", reporter);
        console2.log("scale:", scale);
        console2.log("heartbeat:", heartbeat);
    }
}
