#!/bin/bash

# PokePERP Deployment Script
# This script provides convenient deployment options for different environments

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Default values
NETWORK="anvil"
SCRIPT="DeployComplete"
VERIFY=""
BROADCAST=""

# Function to print usage
usage() {
    echo -e "${BLUE}PokePERP Deployment Script${NC}"
    echo ""
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Options:"
    echo "  -n, --network NETWORK     Target network (anvil, sepolia, mainnet, arbitrum_sepolia, arbitrum)"
    echo "  -s, --script SCRIPT       Deployment script (DeployComplete)"
    echo "  -v, --verify              Verify contracts on Etherscan"
    echo "  -b, --broadcast           Broadcast transactions (required for actual deployment)"
    echo "  -h, --help               Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                                    # Deploy to anvil (local) with dev config"
    echo "  $0 -n sepolia -s DeployComplete -b   # Deploy complete system to Sepolia"
    echo "  $0 -n mainnet -s DeployComplete -b -v # Deploy to mainnet with verification"
}

# Function to check prerequisites
check_prerequisites() {
    echo -e "${BLUE}Checking prerequisites...${NC}"

    # Check if forge is installed
    if ! command -v forge &> /dev/null; then
        echo -e "${RED}Error: forge is not installed. Please install Foundry.${NC}"
        exit 1
    fi

    # Check if cast is installed
    if ! command -v cast &> /dev/null; then
        echo -e "${RED}Error: cast is not installed. Please install Foundry.${NC}"
        exit 1
    fi

    # Check if .env file exists for non-anvil networks
    if [[ "$NETWORK" != "anvil" && ! -f ".env" ]]; then
        echo -e "${YELLOW}Warning: .env file not found. Copy script/config.env.example to .env and configure.${NC}"
    fi

    echo -e "${GREEN}Prerequisites check passed.${NC}"
}

# Function to setup network-specific configurations
setup_network() {
    case $NETWORK in
        anvil)
            RPC_URL="http://localhost:8545"
            CHAIN_ID="31337"
            echo -e "${BLUE}Setting up for Anvil (local testnet)${NC}"
            echo "Make sure to run 'anvil' in another terminal"
            ;;
        sepolia)
            RPC_URL="${ETH_RPC_URL:-https://rpc.sepolia.org}"
            CHAIN_ID="11155111"
            VERIFY="--verify"
            echo -e "${BLUE}Setting up for Sepolia testnet${NC}"
            ;;
        arbitrum_sepolia)
            RPC_URL="${ARB_RPC_URL:-https://sepolia-rollup.arbitrum.io/rpc}"
            CHAIN_ID="421614"
            VERIFY="--verify"
            echo -e "${BLUE}Setting up for Arbitrum Sepolia testnet${NC}"
            ;;
        arbitrum)
            RPC_URL="${ARB_RPC_URL:-https://arb1.arbitrum.io/rpc}"
            CHAIN_ID="42161"
            VERIFY="--verify"
            echo -e "${BLUE}Setting up for Arbitrum One${NC}"
            echo -e "${YELLOW}WARNING: This will deploy to Arbitrum mainnet! Make sure you have enough ETH for gas.${NC}"
            read -p "Are you sure you want to continue? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            ;;
        mainnet)
            RPC_URL="${ETH_RPC_URL:-https://eth.llamarpc.com}"
            CHAIN_ID="1"
            VERIFY="--verify"
            echo -e "${BLUE}Setting up for Ethereum Mainnet${NC}"
            echo -e "${YELLOW}WARNING: This will deploy to MAINNET! Make sure you have enough ETH for gas.${NC}"
            read -p "Are you sure you want to continue? (y/N): " -n 1 -r
            echo
            if [[ ! $REPLY =~ ^[Yy]$ ]]; then
                exit 1
            fi
            ;;
        *)
            echo -e "${RED}Error: Unknown network '$NETWORK'${NC}"
            echo "Supported networks: anvil, sepolia, mainnet, arbitrum_sepolia, arbitrum"
            exit 1
            ;;
    esac
}

# Function to run deployment
deploy() {
    echo -e "${BLUE}Starting deployment...${NC}"
    echo "Network: $NETWORK"
    echo "Script: $SCRIPT"
    echo "RPC URL: $RPC_URL"
    echo ""

    # Build the forge command
    CMD="forge script script/${SCRIPT}.s.sol:${SCRIPT}"
    CMD="$CMD --rpc-url $RPC_URL"
    CMD="$CMD --chain-id $CHAIN_ID"

    if [[ -n "$BROADCAST" ]]; then
        CMD="$CMD --broadcast"
    fi

    if [[ -n "$VERIFY" && "$VERIFY" == "--verify" ]]; then
        if [[ "$NETWORK" == "arbitrum_sepolia" || "$NETWORK" == "arbitrum" ]]; then
            CMD="$CMD --verify --etherscan-api-key $API_KEY_ARBISCAN"
        else
            CMD="$CMD --verify --etherscan-api-key $ETHERSCAN_API_KEY"
        fi
    fi

    # Add verbosity
    CMD="$CMD -vv"

    echo -e "${BLUE}Executing: $CMD${NC}"
    echo ""

    # Execute the deployment
    eval $CMD

    if [[ $? -eq 0 ]]; then
        echo ""
        echo -e "${GREEN}✅ Deployment successful!${NC}"

        if [[ "$NETWORK" == "anvil" ]]; then
            echo ""
            echo -e "${BLUE}Next steps for local testing:${NC}"
            echo "1. Check the deployment output above for contract addresses"
            echo "2. Use the provided cast commands to interact with contracts"
            echo "3. Or run the E2E tests: forge test --match-test test_E2E"
        fi
    else
        echo ""
        echo -e "${RED}❌ Deployment failed!${NC}"
        exit 1
    fi
}

# Parse command line arguments
while [[ $# -gt 0 ]]; do
    case $1 in
        -n|--network)
            NETWORK="$2"
            shift 2
            ;;
        -s|--script)
            SCRIPT="$2"
            shift 2
            ;;
        -v|--verify)
            VERIFY="--verify"
            shift
            ;;
        -b|--broadcast)
            BROADCAST="--broadcast"
            shift
            ;;
        -h|--help)
            usage
            exit 0
            ;;
        *)
            echo -e "${RED}Error: Unknown option '$1'${NC}"
            usage
            exit 1
            ;;
    esac
done

# Load environment variables if .env exists
if [[ -f ".env" ]]; then
    echo -e "${BLUE}Loading environment variables from .env${NC}"
    set -a  # automatically export all variables
    source .env
    set +a
fi

# Main execution
echo -e "${GREEN}🚀 PokePERP Deployment Starting...${NC}"
echo ""

check_prerequisites
setup_network
deploy

echo ""
echo -e "${GREEN}🎉 All done!${NC}"