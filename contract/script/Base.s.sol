// SPDX-License-Identifier: MIT
pragma solidity >=0.8.29 <0.9.0;

import { Script } from "forge-std/src/Script.sol";

abstract contract BaseScript is Script {
    /// @dev Included to enable compilation of the script without a $MNEMONIC environment variable.
    string internal constant TEST_MNEMONIC = "test test test test test test test test test test test junk";

    /// @dev Needed for the deterministic deployments.
    bytes32 internal constant ZERO_SALT = bytes32(0);

    /// @dev The address of the transaction broadcaster.
    address internal broadcaster;

    /// @dev Used to derive the broadcaster's address if $ETH_FROM is not defined.
    string internal mnemonic;

    /// @dev Initializes the transaction broadcaster like this:
    ///
    /// - If $ETH_FROM is defined, use it.
    /// - If $PRIVATE_KEY is defined, derive the broadcaster address from it.
    /// - Otherwise, derive the broadcaster address from $MNEMONIC.
    /// - If $MNEMONIC is not defined, default to a test mnemonic.
    ///
    /// The use case for $ETH_FROM is to specify the broadcaster key and its address via the command line.
    /// The use case for $PRIVATE_KEY is to specify the private key directly.
    constructor() {
        address from = vm.envOr({ name: "ETH_FROM", defaultValue: address(0) });
        if (from != address(0)) {
            broadcaster = from;
        } else {
            uint256 privateKey = vm.envOr({ name: "PRIVATE_KEY", defaultValue: uint256(0) });
            if (privateKey != 0) {
                broadcaster = vm.addr(privateKey);
            } else {
                mnemonic = vm.envOr({ name: "MNEMONIC", defaultValue: TEST_MNEMONIC });
                (broadcaster,) = deriveRememberKey({ mnemonic: mnemonic, index: 0 });
            }
        }
    }

    modifier broadcast() {
        uint256 privateKey = vm.envOr({ name: "PRIVATE_KEY", defaultValue: uint256(0) });
        if (privateKey != 0) {
            vm.startBroadcast(privateKey);
        } else {
            vm.startBroadcast(broadcaster);
        }
        _;
        vm.stopBroadcast();
    }
}
