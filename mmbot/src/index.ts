import { Wallet, JsonRpcProvider, Contract, parseEther } from 'ethers';
import * as dotenv from 'dotenv';

dotenv.config();

interface MarketMakerConfig {
  rpcUrl: string;
  privateKey: string;
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
  private wallet: Wallet;
  private contractAddress: string;
  private contractABI: string[];
  private contract: Contract;
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
    this.wallet = new Wallet(config.privateKey, this.provider);
    this.contractAddress = config.contractAddress;
    this.contractABI = config.contractABI;
    this.contract = new Contract(this.contractAddress, this.contractABI, this.wallet);
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
    // Listen for TradeMatched events
    this.contract.on('TradeMatched', (_buyOrderId, _sellOrderId, buyer, seller, price, qty, timestamp, event) => {
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
      const ourAddress = this.wallet.address.toLowerCase();
      if (buyer.toLowerCase() === ourAddress) {
        console.log('✅ Our BUY order was matched!');
        // Remove from active orders
        this.activeOrders.buy = this.activeOrders.buy.filter(order =>
          order.txHash !== event.transactionHash
        );
      }
      if (seller.toLowerCase() === ourAddress) {
        console.log('✅ Our SELL order was matched!');
        // Remove from active orders
        this.activeOrders.sell = this.activeOrders.sell.filter(order =>
          order.txHash !== event.transactionHash
        );
      }
      console.log('================================\n');
    });

    console.log('📡 Event listener for auto-matching initialized');
  }

  async getOraclePrice(): Promise<bigint | null> {
    try {
      const price = await this.oracleContract.indexPrice();
      // Price is in scaled format (scale=18 means the price unit)
      // The actual price value doesn't need division, it's already the price
      const priceValue = Number(price);
      console.log(`Oracle price fetched: ${priceValue}`);
      return price;
    } catch (error) {
      console.error('Error fetching oracle price:', (error as Error).message);
      return null;
    }
  }

  generateRandomPrice(basePrice: bigint, isAbove: boolean): bigint {
    // Fixed 0.1% spread (10 basis points)
    const basisPoints = 10n;
    const adjustment = (basePrice * basisPoints) / 10000n;

    if (isAbove) {
      return basePrice + adjustment;
    } else {
      return basePrice - adjustment;
    }
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
      console.log(`Placing BUY order at price ${priceValue} with amount ${amount}`);
      console.log(`Debug - Price as bigint: ${price}, Amount as bigint: ${amount}`);

      const tx = await this.contract.place(true, price, amount);

      await tx.wait();
      console.log(`BUY order placed successfully. TX: ${tx.hash}`);

      this.activeOrders.buy.push({
        price,
        amount,
        txHash: tx.hash,
        timestamp: Date.now()
      });

      return tx.hash;
    } catch (error) {
      console.error('Error placing buy order:', (error as Error).message);
      return null;
    }
  }

  async placeSellOrder(price: bigint, amount: bigint): Promise<string | null> {
    try {
      const priceValue = Number(price);
      console.log(`Placing SELL order at price ${priceValue} with amount ${amount}`);

      const tx = await this.contract.place(false, price, amount);

      await tx.wait();
      console.log(`SELL order placed successfully. TX: ${tx.hash}`);

      this.activeOrders.sell.push({
        price,
        amount,
        txHash: tx.hash,
        timestamp: Date.now()
      });

      return tx.hash;
    } catch (error) {
      console.error('Error placing sell order:', (error as Error).message);
      return null;
    }
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
        const buyPrice = this.generateRandomPrice(oraclePrice, false);
        const buyAmount = this.generateRandomSize();
        await this.placeBuyOrder(buyPrice, buyAmount);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    for (let i = 0; i < numSellOrders; i++) {
      if (this.activeOrders.sell.length < this.config.maxOrdersPerSide) {
        const sellPrice = this.generateRandomPrice(oraclePrice, true);
        const sellAmount = this.generateRandomSize();
        await this.placeSellOrder(sellPrice, sellAmount);

        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }

    console.log(`\nActive orders - BUY: ${this.activeOrders.buy.length}, SELL: ${this.activeOrders.sell.length}`);
  }

  async start(): Promise<void> {
    console.log('Starting Market Maker Bot...');
    console.log(`Configuration:
      - Spread: ${this.config.spreadPercentage}%
      - Order size: ${this.config.orderSizeMin} - ${this.config.orderSizeMax} units
      - Update interval: ${this.config.updateInterval}ms
      - Max orders per side: ${this.config.maxOrdersPerSide}
    `);

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
    privateKey: process.env.PRIVATE_KEY || '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80',
    contractAddress: process.env.CONTRACT_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    contractABI: CONTRACT_ABI,
    oracleAddress: process.env.ORACLE_ADDRESS || '0x5FbDB2315678afecb367f032d93F642f64180aa3',
    oracleABI: ORACLE_ABI,
    spreadPercentage: parseFloat(process.env.SPREAD_PERCENTAGE || '0.5'),
    orderSizeMin: parseFloat(process.env.ORDER_SIZE_MIN || '0.1'), // 0.01 -> 0.1 ETHに増加
    orderSizeMax: parseFloat(process.env.ORDER_SIZE_MAX || '1.0'), // 0.1 -> 1.0 ETHに増加
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