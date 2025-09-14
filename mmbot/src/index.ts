import { Wallet, JsonRpcProvider, Contract, parseEther } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

interface MarketMakerConfig {
  rpcUrl: string;
  accounts: {
    buyer: {
      privateKey: string;
      name?: string;
    };
    seller: {
      privateKey: string;
      name?: string;
    };
  };
  contractAddress: string;
  contractABI: string[];
  oracleAddress: string;
  oracleABI: string[];
  spreadPercentage?: number;
  orderSizeMin?: number;
  orderSizeMax?: number;
  updateInterval?: number;
  maxOrdersPerSide?: number;
}

interface Order {
  price: bigint;  // Price in wei
  amount: bigint; // Amount in wei
  txHash: string;
  timestamp: number;
}

interface ActiveOrders {
  buy: Order[];
  sell: Order[];
}


class MarketMakerBot {
  private provider: JsonRpcProvider;
  private buyerWallet: Wallet;
  private sellerWallet: Wallet;
  private contractAddress: string;
  private contractABI: string[];
  private buyerContract: Contract;
  private sellerContract: Contract;
  private oracleContract: Contract;
  private config: {
    spreadPercentage: number;
    orderSizeMin: number;
    orderSizeMax: number;
    updateInterval: number;
    maxOrdersPerSide: number;
  };
  private activeOrders: ActiveOrders;

  constructor(config: MarketMakerConfig) {
    this.provider = new JsonRpcProvider(config.rpcUrl);
    this.buyerWallet = new Wallet(config.accounts.buyer.privateKey, this.provider);
    this.sellerWallet = new Wallet(config.accounts.seller.privateKey, this.provider);
    this.contractAddress = config.contractAddress;
    this.contractABI = config.contractABI;
    this.buyerContract = new Contract(this.contractAddress, this.contractABI, this.buyerWallet);
    this.sellerContract = new Contract(this.contractAddress, this.contractABI, this.sellerWallet);
    this.oracleContract = new Contract(config.oracleAddress, config.oracleABI, this.provider);

    this.config = {
      spreadPercentage: config.spreadPercentage || 0.5,
      orderSizeMin: config.orderSizeMin || 0.01,
      orderSizeMax: config.orderSizeMax || 0.1,
      updateInterval: config.updateInterval || 10000,
      maxOrdersPerSide: config.maxOrdersPerSide || 3
    };

    this.activeOrders = {
      buy: [],
      sell: []
    };

    // Set up event listener for auto-matching
    this.setupEventListeners();
  }

  setupEventListeners(): void {
    // Listen for TradeMatched events on both contracts
    this.buyerContract.on('TradeMatched', (_buyOrderId, _sellOrderId, buyer, seller, price, qty, timestamp, event) => {
      this.handleTradeMatchedEvent(_buyOrderId, _sellOrderId, buyer, seller, price, qty, timestamp, event);
    });

    this.sellerContract.on('TradeMatched', (_buyOrderId, _sellOrderId, buyer, seller, price, qty, timestamp, event) => {
      this.handleTradeMatchedEvent(_buyOrderId, _sellOrderId, buyer, seller, price, qty, timestamp, event);
    });

    console.log('📡 Event listeners for auto-matching initialized for both accounts');
  }

  handleTradeMatchedEvent(_buyOrderId: any, _sellOrderId: any, buyer: string, seller: string, price: any, qty: any, timestamp: any, event: any): void {
    const priceValue = Number(price);
    const qtyInUnits = Number(qty) / 1e18;
    const formattedTime = new Date(Number(timestamp) * 1000).toLocaleTimeString();

    console.log('\n🔄 === AUTO-MATCHING DETECTED === 🔄');
    console.log(`Time: ${formattedTime}`);
    console.log(`Price: ${priceValue}`);
    console.log(`Quantity: ${qtyInUnits.toFixed(6)} units`);
    console.log(`Buyer: ${buyer}`);
    console.log(`Seller: ${seller}`);

    // Check if our bot was involved
    const buyerAddress = this.buyerWallet.address.toLowerCase();
    const sellerAddress = this.sellerWallet.address.toLowerCase();

    if (buyer.toLowerCase() === buyerAddress) {
      console.log('✅ Our BUYER order was matched!');
      // Remove from active orders
      this.activeOrders.buy = this.activeOrders.buy.filter(order =>
        order.txHash !== event.transactionHash
      );
    }
    if (seller.toLowerCase() === sellerAddress) {
      console.log('✅ Our SELLER order was matched!');
      // Remove from active orders
      this.activeOrders.sell = this.activeOrders.sell.filter(order =>
        order.txHash !== event.transactionHash
      );
    }
    console.log('================================\n');

    // Display updated order book after matching
    this.displayOrderBook();
  }

  async getOraclePrice(): Promise<bigint | null> {
    try {
      const price = await this.oracleContract.indexPrice();
      // Oracle returns price in e18 format (e.g., 100e18)
      // We need to scale it down to simple integer for OrderBook
      const scaledPrice = price / BigInt(1e18);
      console.log(`Oracle price fetched: ${Number(scaledPrice)} (raw: ${price})`);
      return scaledPrice;
    } catch (error) {
      console.error('Error fetching oracle price:', (error as Error).message);
      return null;
    }
  }

  generateRandomBuyPrice(basePrice: bigint): bigint {
    // Generate buy prices BELOW the base price to prevent self-matching
    const spreadBasisPoints = BigInt(Math.floor(this.config.spreadPercentage * 100));
    const minSpread = (basePrice * 50n) / 10000n; // Minimum 0.5% below base price
    const maxAdjustment = (basePrice * spreadBasisPoints) / 10000n;

    // Random value between minSpread and maxAdjustment below base price
    const randomAdjustment = minSpread + BigInt(Math.floor(Math.random() * Number(maxAdjustment - minSpread + 1n)));

    return basePrice - randomAdjustment;
  }

  generateRandomSellPrice(basePrice: bigint): bigint {
    // Generate sell prices ABOVE the base price to prevent self-matching
    const spreadBasisPoints = BigInt(Math.floor(this.config.spreadPercentage * 100));
    const minSpread = (basePrice * 50n) / 10000n; // Minimum 0.5% above base price
    const maxAdjustment = (basePrice * spreadBasisPoints) / 10000n;

    // Random value between minSpread and maxAdjustment above base price
    const randomAdjustment = minSpread + BigInt(Math.floor(Math.random() * Number(maxAdjustment - minSpread + 1n)));

    return basePrice + randomAdjustment;
  }

  generateRandomSize(): bigint {
    const { orderSizeMin, orderSizeMax } = this.config;
    const size = Math.random() * (orderSizeMax - orderSizeMin) + orderSizeMin;
    // Convert to wei (18 decimals)
    return parseEther(size.toFixed(6));
  }

  async placeBuyOrder(price: bigint, amount: bigint): Promise<string | null> {
    try {
      const priceValue = Number(price);
      console.log(`[BUYER ${this.buyerWallet.address}] Placing BUY order at price ${priceValue} with amount ${amount}`);
      console.log(`Debug - Price as bigint: ${price}, Amount as bigint: ${amount}`);

      const tx = await this.buyerContract.place(true, price, amount);

      await tx.wait();
      console.log(`[BUYER] BUY order placed successfully. TX: ${tx.hash}`);

      this.activeOrders.buy.push({
        price,
        amount,
        txHash: tx.hash,
        timestamp: Date.now()
      });

      return tx.hash;
    } catch (error) {
      console.error(`[BUYER] Error placing buy order:`, (error as Error).message);
      return null;
    }
  }

  async placeSellOrder(price: bigint, amount: bigint): Promise<string | null> {
    try {
      const priceValue = Number(price);
      console.log(`[SELLER ${this.sellerWallet.address}] Placing SELL order at price ${priceValue} with amount ${amount}`);

      const tx = await this.sellerContract.place(false, price, amount);

      await tx.wait();
      console.log(`[SELLER] SELL order placed successfully. TX: ${tx.hash}`);

      this.activeOrders.sell.push({
        price,
        amount,
        txHash: tx.hash,
        timestamp: Date.now()
      });

      return tx.hash;
    } catch (error) {
      console.error(`[SELLER] Error placing sell order:`, (error as Error).message);
      return null;
    }
  }

  displayOrderBook(): void {
    console.log('\n📊 === ORDER BOOK STATUS === 📊');

    // Sort orders by price
    const buyOrders = [...this.activeOrders.buy].sort((a, b) =>
      Number(b.price) - Number(a.price)
    );
    const sellOrders = [...this.activeOrders.sell].sort((a, b) =>
      Number(a.price) - Number(b.price)
    );

    console.log('\n🟢 BUY ORDERS (Bids):');
    if (buyOrders.length === 0) {
      console.log('  No active buy orders');
    } else {
      console.log('  Price     | Amount (units) | Age');
      console.log('  ----------|----------------|--------');
      buyOrders.forEach(order => {
        const price = Number(order.price);
        const amount = (Number(order.amount) / 1e18).toFixed(6);
        const age = Math.floor((Date.now() - order.timestamp) / 1000);
        console.log(`  ${price.toString().padEnd(9)} | ${amount.padEnd(14)} | ${age}s`);
      });
    }

    console.log('\n🔴 SELL ORDERS (Asks):');
    if (sellOrders.length === 0) {
      console.log('  No active sell orders');
    } else {
      console.log('  Price     | Amount (units) | Age');
      console.log('  ----------|----------------|--------');
      sellOrders.forEach(order => {
        const price = Number(order.price);
        const amount = (Number(order.amount) / 1e18).toFixed(6);
        const age = Math.floor((Date.now() - order.timestamp) / 1000);
        console.log(`  ${price.toString().padEnd(9)} | ${amount.padEnd(14)} | ${age}s`);
      });
    }

    // Calculate spread if both sides have orders
    if (buyOrders.length > 0 && sellOrders.length > 0) {
      const bestBid = Number(buyOrders[0].price);
      const bestAsk = Number(sellOrders[0].price);
      const spread = bestAsk - bestBid;
      const spreadPercent = ((spread / bestAsk) * 100).toFixed(2);

      console.log('\n📈 MARKET STATS:');
      console.log(`  Best Bid: ${bestBid}`);
      console.log(`  Best Ask: ${bestAsk}`);
      console.log(`  Spread: ${spread} (${spreadPercent}%)`);
    }

    console.log('\n📦 SUMMARY:');
    console.log(`  Total Buy Orders: ${this.activeOrders.buy.length}`);
    console.log(`  Total Sell Orders: ${this.activeOrders.sell.length}`);
    console.log('================================\n');
  }

  async cancelOldOrders(): Promise<void> {
    const now = Date.now();
    const maxOrderAge = 60000;

    this.activeOrders.buy = this.activeOrders.buy.filter(order => {
      return (now - order.timestamp) < maxOrderAge;
    });

    this.activeOrders.sell = this.activeOrders.sell.filter(order => {
      return (now - order.timestamp) < maxOrderAge;
    });
  }

  async placeRandomOrders(): Promise<void> {
    const oraclePrice = await this.getOraclePrice();

    if (!oraclePrice) {
      console.log('Could not fetch oracle price, skipping this round');
      return;
    }

    await this.cancelOldOrders();

    const numBuyOrders = Math.floor(Math.random() * this.config.maxOrdersPerSide) + 1;
    const numSellOrders = Math.floor(Math.random() * this.config.maxOrdersPerSide) + 1;

    const priceValue = Number(oraclePrice);
    console.log(`\n=== Placing ${numBuyOrders} BUY and ${numSellOrders} SELL orders around oracle price ${priceValue} ===`);

    for (let i = 0; i < numBuyOrders; i++) {
      if (this.activeOrders.buy.length < this.config.maxOrdersPerSide) {
        const buyPrice = this.generateRandomBuyPrice(oraclePrice);
        const buyAmount = this.generateRandomSize();
        await this.placeBuyOrder(buyPrice, buyAmount);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    for (let i = 0; i < numSellOrders; i++) {
      if (this.activeOrders.sell.length < this.config.maxOrdersPerSide) {
        const sellPrice = this.generateRandomSellPrice(oraclePrice);
        const sellAmount = this.generateRandomSize();
        await this.placeSellOrder(sellPrice, sellAmount);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    // Display order book status
    this.displayOrderBook();
  }

  async checkAndSetupAccounts(): Promise<void> {
    console.log('\n=== ACCOUNT SETUP ===');

    // Check ETH balances
    const buyerBalance = await this.provider.getBalance(this.buyerWallet.address);
    const sellerBalance = await this.provider.getBalance(this.sellerWallet.address);

    console.log(`Buyer Account: ${this.buyerWallet.address}`);
    console.log(`Buyer ETH Balance: ${Number(buyerBalance) / 1e18} ETH`);
    console.log(`Seller Account: ${this.sellerWallet.address}`);
    console.log(`Seller ETH Balance: ${Number(sellerBalance) / 1e18} ETH`);

    // Check if accounts have sufficient ETH
    const minEthRequired = parseEther('0.1'); // 0.1 ETH minimum
    if (buyerBalance < minEthRequired) {
      console.warn(`⚠️ Buyer account has insufficient ETH balance!`);
    }
    if (sellerBalance < minEthRequired) {
      console.warn(`⚠️ Seller account has insufficient ETH balance!`);
    }

    console.log('===================\n');
  }

  async start(): Promise<void> {
    console.log('Starting Multi-Account Market Maker Bot...');
    console.log(`Configuration:
      - Spread: ${this.config.spreadPercentage}%
      - Order size: ${this.config.orderSizeMin} - ${this.config.orderSizeMax} units
      - Update interval: ${this.config.updateInterval}ms
      - Max orders per side: ${this.config.maxOrdersPerSide}
    `);

    await this.checkAndSetupAccounts();
    await this.placeRandomOrders();

    setInterval(async () => {
      await this.placeRandomOrders();
    }, this.config.updateInterval);
  }

  async stop(): Promise<void> {
    console.log('Stopping Market Maker Bot...');
    process.exit(0);
  }
}

const CONTRACT_ABI = [
  "function place(bool isBid, int256 price, uint256 qty) returns (bytes32 orderId)",
  "function cancel(bytes32 orderId)",
  "function matchAtBest(uint256 maxIters) returns (uint256 numMatched)",
  "event TradeMatched(bytes32 indexed buyOrderId, bytes32 indexed sellOrderId, address buyer, address seller, int256 price, uint256 qty, uint256 timestamp)"
];

const ORACLE_ABI = [
  "function getLatestPrice() external view returns (uint256 price, uint256 timestamp)",
  "function indexPrice() external view returns (uint256)",
  "function markPrice() external view returns (uint256)"
];

async function main(): Promise<void> {
  const config: MarketMakerConfig = {
    rpcUrl: process.env.RPC_URL || 'http://localhost:8545',
    accounts: {
      buyer: {
        privateKey: process.env.BUYER_PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80', // Hardhat account #0
        name: process.env.BUYER_NAME || 'Buyer_Bot'
      },
      seller: {
        privateKey: process.env.SELLER_PRIVATE_KEY || '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d', // Hardhat account #1
        name: process.env.SELLER_NAME || 'Seller_Bot'
      }
    },
    contractAddress: process.env.CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    contractABI: CONTRACT_ABI,
    oracleAddress: process.env.ORACLE_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    oracleABI: ORACLE_ABI,
    spreadPercentage: parseFloat(process.env.SPREAD_PERCENTAGE || '0.5'),
    orderSizeMin: parseFloat(process.env.ORDER_SIZE_MIN || '0.1'),
    orderSizeMax: parseFloat(process.env.ORDER_SIZE_MAX || '1.0'),
    updateInterval: parseInt(process.env.UPDATE_INTERVAL || '10000'),
    maxOrdersPerSide: parseInt(process.env.MAX_ORDERS_PER_SIDE || '3')
  };

  const bot = new MarketMakerBot(config);

  process.on('SIGINT', async () => {
    await bot.stop();
  });

  process.on('SIGTERM', async () => {
    await bot.stop();
  });

  await bot.start();
}

main().catch(console.error);