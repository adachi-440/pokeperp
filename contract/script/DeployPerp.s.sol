// SPDX-License-Identifier: UNLICENSED
pragma solidity >=0.8.29 <0.9.0;

import { BaseScript } from "./Base.s.sol";
import { Vault } from "../src/vault/Vault.sol";
import { RiskEngine } from "../src/risk/RiskEngine.sol";
import { PerpEngine } from "../src/perp/PerpEngine.sol";
import { MockOracle } from "../src/mocks/MockOracle.sol";

contract DeployPerp is BaseScript {
    function run() public broadcast returns (Vault vault, RiskEngine risk, PerpEngine perp, MockOracle oracle) {
        oracle = new MockOracle(1000e18);
        vault = new Vault(RiskEngine(address(0)));
        risk = new RiskEngine(vault, oracle, IPerpPositions(address(0)), 0.1e18, 0.05e18, 1e18);
        vault.setRisk(risk);
        perp = new PerpEngine(vault, risk, oracle, 1e18, 1e18);
        vault.setPerp(address(perp));
        risk.setLinks(vault, oracle, IPerpPositions(address(perp)));
    }
}

