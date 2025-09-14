// SPDX-License-Identifier: MIT
pragma solidity ^0.8.13;

// Library with a heap specifically built for a limit orderbook
library FBAHeap {
    // Currently all orders are GTC limit orders
    struct Order {
        uint256 price;
        uint256 amount;
        // 'true' for bids and 'false' for asks
        bool side;
        string orderId;
    }

    // Heap structure for storing orders
    struct Heap {
        Order[] orders;
        mapping(string => uint256) orderIdToIndex; // orderId => array index + 1 (0 means not exists)
    }

    //////////// Helper methods specific to FBA
    function insertOrder(Order memory ord, Heap storage heap) internal {
        // If side is 'true' it's bid side, and we have a max heap, otherwise asks and min heap
        bool isMaxHeap = ord.side;

        // Add to array
        heap.orders.push(ord);
        uint256 newIndex = heap.orders.length - 1;

        // Update mapping (store index + 1 to distinguish from non-existent)
        heap.orderIdToIndex[ord.orderId] = newIndex + 1;

        // Maintain heap property
        heapifyUp(newIndex, isMaxHeap, heap);
    }

    /**
     * @notice Overwrites data for a specified order
     */
    function updateOrder(Order memory ord, Heap storage heap) internal {
        // Get index from mapping
        uint256 indexPlusOne = heap.orderIdToIndex[ord.orderId];
        require(indexPlusOne > 0, "Order not found");
        uint256 index = indexPlusOne - 1;

        heap.orders[index] = ord;
    }

    /**
     * @notice To delete we will find the index of the order and then overwrite at that index
     */
    function deleteOrder(string memory orderId, bool isMaxHeap, Heap storage heap)
        internal
        returns (Order memory)
    {
        uint256 indexPlusOne = heap.orderIdToIndex[orderId];
        require(indexPlusOne > 0, "Order not found");
        uint256 index = indexPlusOne - 1;

        Order memory deletedOrder = deleteAtIndex(index, isMaxHeap, heap);
        delete heap.orderIdToIndex[orderId];
        return deletedOrder;
    }

    /**
     * @notice Returns order at specified index
     */
    function getOrder(uint256 index, Heap storage heap) internal view returns (Order memory) {
        require(index < heap.orders.length, "Index out of bounds");
        return heap.orders[index];
    }

    /**
     * @notice Returns best bid/ask if exists, otherwise creates an element with extreme price
     */
    function getTopOrder(Heap storage heap, bool fallbackSide) internal view returns (Order memory) {
        // So if heap is empty create a new struct with the fallback values
        if (heap.orders.length == 0) {
            uint256 fallbackPrice;
            if (fallbackSide == true) {
                fallbackPrice = 0;
            } else {
                fallbackPrice = type(uint256).max;
            }
            return Order(fallbackPrice, 0, fallbackSide, "");
        }

        return heap.orders[0];
    }

    /**
     * @notice Returns all bids/asks above or below a threshold
     */
    function getTopOrderList(uint256 threshold, bool side, Heap storage heap) internal view returns (Order[] memory) {
        // Count the number of orders above the threshold
        uint256 count = 0;
        for (uint256 i = 0; i < heap.orders.length; i++) {
            if (isFirstLarger(heap.orders[i].price, threshold, side)) {
                count++;
            }
        }

        // Create an array to store the orders above the threshold
        Order[] memory orders = new Order[](count);
        uint256 index = 0;
        for (uint256 i = 0; i < heap.orders.length; i++) {
            if (isFirstLarger(heap.orders[i].price, threshold, side)) {
                orders[index] = heap.orders[i];
                index++;
            }
        }

        return orders;
    }

    /**
     * @notice Deletes an element at a specified index and then maintains heap
     */
    function deleteAtIndex(uint256 index, bool isMaxHeap, Heap storage heap)
        internal
        returns (Order memory)
    {
        require(index < heap.orders.length, "Index out of bounds");
        uint256 lastIndex = heap.orders.length - 1;

        // Get the item we're deleting to return it
        Order memory deletedItem = heap.orders[index];

        if (index == lastIndex) {
            heap.orders.pop();
            return deletedItem;
        }

        // Move last element to deleted position
        heap.orders[index] = heap.orders[lastIndex];
        heap.orderIdToIndex[heap.orders[index].orderId] = index + 1;
        heap.orders.pop();

        if (index == 0) {
            heapifyDown(index, isMaxHeap, heap);
            return deletedItem;
        }

        // Need to see if we need to heapify up/down
        uint256 indexParent = (index - 1) / 2;
        Order memory ordParent = heap.orders[indexParent];
        Order memory ord = heap.orders[index];

        if (isFirstLarger(ordParent.price, ord.price, isMaxHeap)) {
            heapifyDown(index, isMaxHeap, heap);
        } else {
            heapifyUp(index, isMaxHeap, heap);
        }

        return deletedItem;
    }

    /**
     * @notice Maintains heap invariant by moving elements up
     */
    function heapifyUp(uint256 index, bool isMaxHeap, Heap storage heap) private {
        while (index > 0) {
            uint256 indexParent = (index - 1) / 2;
            Order memory ord = heap.orders[index];
            Order memory ordParent = heap.orders[indexParent];

            if (isFirstLarger(ordParent.price, ord.price, isMaxHeap)) {
                break;
            }

            // Swap values to maintain heap
            heap.orders[index] = ordParent;
            heap.orders[indexParent] = ord;

            // Update mappings
            heap.orderIdToIndex[ord.orderId] = indexParent + 1;
            heap.orderIdToIndex[ordParent.orderId] = index + 1;

            index = indexParent;
        }
    }

    /**
     * @notice Maintains heap invariant by moving elements down
     */
    function heapifyDown(uint256 index, bool isMaxHeap, Heap storage heap) private {
        uint256 leftChildIndex;
        uint256 rightChildIndex;
        uint256 largestIndex;
        uint256 lastIndex = heap.orders.length - 1;

        while (true) {
            leftChildIndex = index * 2 + 1;
            rightChildIndex = index * 2 + 2;
            largestIndex = index;

            if (leftChildIndex <= lastIndex) {
                if (isFirstLarger(heap.orders[leftChildIndex].price, heap.orders[largestIndex].price, isMaxHeap)) {
                    largestIndex = leftChildIndex;
                }
            }

            if (rightChildIndex <= lastIndex) {
                if (isFirstLarger(heap.orders[rightChildIndex].price, heap.orders[largestIndex].price, isMaxHeap)) {
                    largestIndex = rightChildIndex;
                }
            }

            // Once our starting value is max one, heap invariant is met
            if (largestIndex == index) {
                break;
            }

            // Swap largest with our index
            Order memory temp = heap.orders[index];
            heap.orders[index] = heap.orders[largestIndex];
            heap.orders[largestIndex] = temp;

            // Update mappings
            heap.orderIdToIndex[heap.orders[index].orderId] = index + 1;
            heap.orderIdToIndex[heap.orders[largestIndex].orderId] = largestIndex + 1;

            index = largestIndex;
        }
    }

    //////////// Helper methods
    /**
     * @notice Compares two uint256 values based on whether it's a max or min heap
     */
    function isFirstLarger(uint256 first, uint256 second, bool isMaxHeap) internal pure returns (bool) {
        if (isMaxHeap) {
            return first >= second;
        } else {
            return first <= second;
        }
    }
}