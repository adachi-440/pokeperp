// SPDX-License-Identifier: MIT
pragma solidity ^0.8.29;

import { IOrderBook } from "../interfaces/IOrderBook.sol";
import { IOracleAdapter } from "../interfaces/IOracleAdapter.sol";
import { ISettlementHook } from "../interfaces/ISettlementHook.sol";
import { OrderBookTypes } from "../libraries/OrderBookTypes.sol";

contract OrderBookMVP is IOrderBook {
    using OrderBookTypes for OrderBookTypes.BookState;

    OrderBookTypes.MarketCfg public marketCfg;
    OrderBookTypes.BookState private bookState;

    constructor(
        uint256 _minQty,
        uint256 _minNotional,
        uint256 _deviationLimit,
        address _oracleAdapter
    ) {
        marketCfg.minQty = _minQty;
        marketCfg.minNotional = _minNotional;
        marketCfg.deviationLimit = _deviationLimit;
        marketCfg.oracleAdapter = _oracleAdapter;

        bookState.bestBidPrice = OrderBookTypes.NULL_PRICE;
        bookState.bestAskPrice = OrderBookTypes.NULL_PRICE;
        bookState.nextOrderId = 1;
    }

    function place(bool isBid, int24 price, uint256 qty) external returns (bytes32 orderId) {
        require(qty >= marketCfg.minQty, "Qty too small");

        uint256 notional = _calculateNotional(price, qty);
        require(notional >= marketCfg.minNotional, "Notional too small");

        orderId = bytes32(bookState.nextOrderId++);

        OrderBookTypes.Order storage order = bookState.orders[orderId];
        order.id = orderId;
        order.trader = msg.sender;
        order.isBid = isBid;
        order.price = price;
        order.qty = qty;
        order.timestamp = block.timestamp;

        _addOrderToLevel(order, isBid, price);
        bookState.traderOrders[msg.sender].push(orderId);

        emit OrderPlaced(orderId, msg.sender, isBid, price, qty, block.timestamp);
    }


    function matchAtBest(uint256 stepsMax) external returns (uint256 matched) {
        matched = 0;
        uint256 steps = 0;

        while (steps < stepsMax && bookState.bestBidPrice != OrderBookTypes.NULL_PRICE
               && bookState.bestAskPrice != OrderBookTypes.NULL_PRICE
               && bookState.bestBidPrice >= bookState.bestAskPrice) {

            if (!_withinBand(bookState.bestBidPrice)) break;

            uint256 matchedQty = _executeTrade();
            if (matchedQty == 0) break;

            matched += matchedQty;
            steps++;
        }
    }

    function bestBidPrice() external view returns (int24) {
        return bookState.bestBidPrice;
    }

    function bestAskPrice() external view returns (int24) {
        return bookState.bestAskPrice;
    }

    function orderOf(bytes32 orderId) external view returns (Order memory) {
        OrderBookTypes.Order storage o = bookState.orders[orderId];
        return Order({
            id: o.id,
            trader: o.trader,
            isBid: o.isBid,
            price: o.price,
            qty: o.qty,
            timestamp: o.timestamp,
            nextId: o.nextId,
            prevId: o.prevId
        });
    }

    function levelOf(bool isBid, int24 price) external view returns (Level memory) {
        OrderBookTypes.Level storage l = bookState.levels[isBid][price];
        return Level({
            totalQty: l.totalQty,
            headId: l.headId,
            tailId: l.tailId
        });
    }

    function getOpenOrders(address trader) external view returns (bytes32[] memory) {
        return bookState.traderOrders[trader];
    }

    function setSettlementHook(address _settlementHook) external {
        marketCfg.settlementHook = _settlementHook;
    }

    function _addOrderToLevel(OrderBookTypes.Order storage order, bool isBid, int24 price) private {
        OrderBookTypes.Level storage level = bookState.levels[isBid][price];

        if (level.headId == bytes32(0)) {
            level.headId = order.id;
            level.tailId = order.id;
        } else {
            OrderBookTypes.Order storage tail = bookState.orders[level.tailId];
            tail.nextId = order.id;
            order.prevId = level.tailId;
            level.tailId = order.id;
        }

        level.totalQty += order.qty;

        if (isBid) {
            if (bookState.bestBidPrice == OrderBookTypes.NULL_PRICE || price > bookState.bestBidPrice) {
                bookState.bestBidPrice = price;
            }
        } else {
            if (bookState.bestAskPrice == OrderBookTypes.NULL_PRICE || price < bookState.bestAskPrice) {
                bookState.bestAskPrice = price;
            }
        }
    }

    function _removeOrderFromLevel(OrderBookTypes.Order storage order) private {
        OrderBookTypes.Level storage level = bookState.levels[order.isBid][order.price];

        // Calculate quantity to remove from level
        uint256 qtyToRemove = order.qty - order.filledQty;

        if (order.prevId != bytes32(0)) {
            bookState.orders[order.prevId].nextId = order.nextId;
        } else {
            level.headId = order.nextId;
        }

        if (order.nextId != bytes32(0)) {
            bookState.orders[order.nextId].prevId = order.prevId;
        } else {
            level.tailId = order.prevId;
        }

        level.totalQty -= qtyToRemove;

        if (level.totalQty == 0 || level.headId == bytes32(0)) {
            if (order.isBid) {
                bookState.bestBidPrice = _nextLowerNonEmptyBid(order.price);
            } else {
                bookState.bestAskPrice = _nextHigherNonEmptyAsk(order.price);
            }
        }
    }

    function _removeFullyFilledOrder(OrderBookTypes.Order storage order) private {
        OrderBookTypes.Level storage level = bookState.levels[order.isBid][order.price];

        if (order.prevId != bytes32(0)) {
            bookState.orders[order.prevId].nextId = order.nextId;
        } else {
            level.headId = order.nextId;
        }

        if (order.nextId != bytes32(0)) {
            bookState.orders[order.nextId].prevId = order.prevId;
        } else {
            level.tailId = order.prevId;
        }

        // For fully filled orders, no need to update totalQty as it was already done in _executeTrade

        if (level.totalQty == 0 || level.headId == bytes32(0)) {
            if (order.isBid) {
                bookState.bestBidPrice = _nextLowerNonEmptyBid(order.price);
            } else {
                bookState.bestAskPrice = _nextHigherNonEmptyAsk(order.price);
            }
        }
    }

    function _executeTrade() private returns (uint256) {
        OrderBookTypes.Level storage bidLevel = bookState.levels[true][bookState.bestBidPrice];
        OrderBookTypes.Level storage askLevel = bookState.levels[false][bookState.bestAskPrice];

        if (bidLevel.headId == bytes32(0) || askLevel.headId == bytes32(0)) return 0;

        OrderBookTypes.Order storage bidOrder = bookState.orders[bidLevel.headId];
        OrderBookTypes.Order storage askOrder = bookState.orders[askLevel.headId];

        uint256 bidRemaining = bidOrder.qty - bidOrder.filledQty;
        uint256 askRemaining = askOrder.qty - askOrder.filledQty;
        uint256 matchQty = bidRemaining < askRemaining ? bidRemaining : askRemaining;

        bidOrder.filledQty += matchQty;
        askOrder.filledQty += matchQty;

        // Update level quantities
        bidLevel.totalQty -= matchQty;
        askLevel.totalQty -= matchQty;

        emit TradeMatched(
            bidOrder.id,
            askOrder.id,
            bidOrder.trader,
            askOrder.trader,
            bookState.bestBidPrice,
            matchQty,
            block.timestamp
        );

        if (marketCfg.settlementHook != address(0)) {
            ISettlementHook(marketCfg.settlementHook).onMatch(
                ISettlementHook.MatchInfo({
                    buyer: bidOrder.trader,
                    seller: askOrder.trader,
                    price: bookState.bestBidPrice,
                    qty: matchQty,
                    timestamp: block.timestamp,
                    buyOrderId: bidOrder.id,
                    sellOrderId: askOrder.id
                })
            );
        }

        if (bidOrder.filledQty == bidOrder.qty) {
            _removeFullyFilledOrder(bidOrder);
            delete bookState.orders[bidOrder.id];
        }

        if (askOrder.filledQty == askOrder.qty) {
            _removeFullyFilledOrder(askOrder);
            delete bookState.orders[askOrder.id];
        }

        return matchQty;
    }

    function _nextLowerNonEmptyBid(int24 currentPrice) private view returns (int24) {
        // Limit search to reasonable range to avoid gas exhaustion
        int24 minPrice = currentPrice - 1000 > -887272 ? currentPrice - 1000 : int24(-887272);
        for (int24 price = currentPrice - 1; price >= minPrice; price--) {
            if (bookState.levels[true][price].totalQty > 0) {
                return price;
            }
        }
        return OrderBookTypes.NULL_PRICE;
    }

    function _nextHigherNonEmptyAsk(int24 currentPrice) private view returns (int24) {
        // Limit search to reasonable range to avoid gas exhaustion
        int24 maxPrice = currentPrice + 1000 < 887272 ? currentPrice + 1000 : int24(887272);
        for (int24 price = currentPrice + 1; price <= maxPrice; price++) {
            if (bookState.levels[false][price].totalQty > 0) {
                return price;
            }
        }
        return OrderBookTypes.NULL_PRICE;
    }

    function _withinBand(int24 price) private view returns (bool) {
        if (marketCfg.oracleAdapter == address(0)) return true;

        uint256 oraclePrice = IOracleAdapter(marketCfg.oracleAdapter).markPrice();
        uint256 tickPrice = _priceToUint(price);

        uint256 deviation = tickPrice > oraclePrice
            ? ((tickPrice - oraclePrice) * 10000) / oraclePrice
            : ((oraclePrice - tickPrice) * 10000) / oraclePrice;

        return deviation <= marketCfg.deviationLimit;
    }

    function _calculateNotional(int24 price, uint256 qty) private pure returns (uint256) {
        uint256 priceValue = _priceToUint(price);
        return (priceValue * qty) / 1e18;
    }

    function _priceToUint(int24 price) private pure returns (uint256) {
        // Simplified price calculation for MVP
        // price represents price level directly
        // price 100 = 100e18 price

        if (price == 0) return 1e18;

        // Simple mapping: price = price * 1e18
        // This ensures price 100 = 100e18 price
        if (price > 0) {
            return uint256(uint24(price)) * 1e18;
        } else {
            // For negative prices, use fraction of 1e18
            uint256 absPrice = uint256(uint24(-price));
            return 1e18 * 1e18 / (absPrice * 1e18);
        }
    }
}