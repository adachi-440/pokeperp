'use client'

import { useState, useCallback, useEffect } from 'react'
import {
  usePublicClient,
  useWalletClient,
  useAccount,
  useWatchContractEvent
} from 'wagmi'
import { parseUnits, formatUnits } from 'viem'
import { VaultAbi } from '@/lib/contracts/abis/Vault'
import { TestUSDCAbi } from '@/lib/contracts/abis/TestUSDC'
import { CONTRACT_ADDRESSES } from '@/lib/contracts/config'
import { toast } from 'sonner'

export interface Transaction {
  type: 'Deposit' | 'Withdrawal'
  amount: bigint
  timestamp: bigint
  txHash: string
  blockNumber: number
}

export interface VaultState {
  balance: bigint
  usdcBalance: bigint
  totalDeposited: bigint
  totalWithdrawn: bigint
  transactions: Transaction[]
  isLoading: boolean
  error: string | null
}

export function useVault() {
  const publicClient = usePublicClient()
  const { data: walletClient } = useWalletClient()
  const { address } = useAccount()

  const [state, setState] = useState<VaultState>({
    balance: 0n,
    usdcBalance: 0n,
    totalDeposited: 0n,
    totalWithdrawn: 0n,
    transactions: [],
    isLoading: false,
    error: null,
  })

  // Fetch user's vault and USDC balance
  const fetchBalance = useCallback(async () => {
    if (!publicClient || !address) return

    try {
      const [vaultBalance, usdcBalance] = await Promise.all([
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.Vault,
          abi: VaultAbi,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>,
        publicClient.readContract({
          address: CONTRACT_ADDRESSES.TestUSDC,
          abi: TestUSDCAbi,
          functionName: 'balanceOf',
          args: [address],
        }) as Promise<bigint>
      ])

      setState(prev => ({ ...prev, balance: vaultBalance, usdcBalance }))
    } catch (error) {
      console.error('Failed to fetch balances:', error)
      setState(prev => ({ ...prev, error: 'Failed to fetch balance' }))
    }
  }, [publicClient, address])

  // Fetch transaction history
  const fetchTransactionHistory = useCallback(async () => {
    if (!publicClient || !address) return

    try {
      // Get current block number
      const currentBlock = await publicClient.getBlockNumber()
      const fromBlock = currentBlock > 1000n ? currentBlock - 1000n : 0n

      // Fetch deposit events
      const depositLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESSES.Vault,
        event: {
          type: 'event',
          name: 'Deposited',
          inputs: [
            { indexed: true, internalType: 'address', name: 'user', type: 'address' },
            { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }
          ],
        },
        args: {
          user: address,
        },
        fromBlock,
        toBlock: 'latest',
      })

      // Fetch withdrawal events
      const withdrawalLogs = await publicClient.getLogs({
        address: CONTRACT_ADDRESSES.Vault,
        event: {
          type: 'event',
          name: 'Withdrawn',
          inputs: [
            { indexed: true, internalType: 'address', name: 'user', type: 'address' },
            { indexed: false, internalType: 'uint256', name: 'amount', type: 'uint256' }
          ],
        },
        args: {
          user: address,
        },
        fromBlock,
        toBlock: 'latest',
      })

      // Process and combine transactions
      const transactions: Transaction[] = []
      let totalDeposited = 0n
      let totalWithdrawn = 0n

      for (const log of depositLogs) {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        transactions.push({
          type: 'Deposit',
          amount: log.args.amount as bigint,
          timestamp: block.timestamp,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
        })
        totalDeposited += log.args.amount as bigint
      }

      for (const log of withdrawalLogs) {
        const block = await publicClient.getBlock({ blockNumber: log.blockNumber })
        transactions.push({
          type: 'Withdrawal',
          amount: log.args.amount as bigint,
          timestamp: block.timestamp,
          txHash: log.transactionHash,
          blockNumber: Number(log.blockNumber),
        })
        totalWithdrawn += log.args.amount as bigint
      }

      // Sort by timestamp (newest first)
      transactions.sort((a, b) => Number(b.timestamp - a.timestamp))

      setState(prev => ({
        ...prev,
        transactions,
        totalDeposited,
        totalWithdrawn,
      }))
    } catch (error) {
      console.error('Failed to fetch transaction history:', error)
    }
  }, [publicClient, address])

  // Deposit USDC to vault
  const deposit = useCallback(
    async (amount: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // Check current allowance
        const allowance = await publicClient.readContract({
          address: CONTRACT_ADDRESSES.TestUSDC,
          abi: TestUSDCAbi,
          functionName: 'allowance',
          args: [address, CONTRACT_ADDRESSES.Vault],
        }) as bigint

        // If allowance is insufficient, approve first
        if (allowance < amount) {
          toast.info('USDC承認を実行中...')

          const { request: approveRequest } = await publicClient.simulateContract({
            address: CONTRACT_ADDRESSES.TestUSDC,
            abi: TestUSDCAbi,
            functionName: 'approve',
            args: [CONTRACT_ADDRESSES.Vault, amount],
            account: address,
          })

          const approveHash = await walletClient.writeContract(approveRequest)
          await publicClient.waitForTransactionReceipt({ hash: approveHash })

          toast.success('USDC承認完了')
        }

        // Now deposit to vault
        toast.info('Vaultに預け入れ中...')

        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.Vault,
          abi: VaultAbi,
          functionName: 'deposit',
          args: [amount],
          account: address,
        })

        // Execute transaction
        const hash = await walletClient.writeContract(request)

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        // Refresh balance and history
        await Promise.all([fetchBalance(), fetchTransactionHistory()])

        toast.success(`資産を預け入れました: ${formatUnits(amount, 6)} USDC`)

        return receipt
      } catch (error) {
        console.error('Failed to deposit:', error)
        const errorMessage = (error as Error).message || 'Deposit failed'
        setState(prev => ({ ...prev, error: errorMessage }))
        toast.error('預け入れに失敗しました')
        throw error
      } finally {
        setState(prev => ({ ...prev, isLoading: false }))
      }
    },
    [walletClient, address, publicClient, fetchBalance]
  )

  // Withdraw from vault
  const withdraw = useCallback(
    async (amount: bigint) => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        // Simulate transaction first
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.Vault,
          abi: VaultAbi,
          functionName: 'withdraw',
          args: [amount],
          account: address,
        })

        // Execute transaction
        const hash = await walletClient.writeContract(request)

        // Wait for confirmation
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        // Refresh balance and history
        await Promise.all([fetchBalance(), fetchTransactionHistory()])

        toast.success(`資産を引き出しました: ${formatUnits(amount, 6)} USDC`)

        return receipt
      } catch (error) {
        console.error('Failed to withdraw:', error)
        const errorMessage = (error as Error).message || 'Withdrawal failed'

        // Parse specific error messages
        if (errorMessage.includes('insufficient')) {
          toast.error('残高が不足しています')
        } else if (errorMessage.includes('im-guard')) {
          toast.error('証拠金要件を満たしていません')
        } else {
          toast.error('引き出しに失敗しました')
        }

        setState(prev => ({ ...prev, error: errorMessage }))
        throw error
      } finally {
        setState(prev => ({ ...prev, isLoading: false }))
      }
    },
    [walletClient, address, publicClient, fetchBalance]
  )

  // Watch for Deposited events
  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.Vault,
    abi: VaultAbi,
    eventName: 'Deposited',
    onLogs: (logs) => {
      for (const log of logs) {
        const { user, amount } = log.args as any
        if (user === address) {
          fetchBalance()
          fetchTransactionHistory()
        }
      }
    },
  })

  // Watch for Withdrawn events
  useWatchContractEvent({
    address: CONTRACT_ADDRESSES.Vault,
    abi: VaultAbi,
    eventName: 'Withdrawn',
    onLogs: (logs) => {
      for (const log of logs) {
        const { user, amount } = log.args as any
        if (user === address) {
          fetchBalance()
          fetchTransactionHistory()
        }
      }
    },
  })

  // Initial load
  useEffect(() => {
    if (address) {
      fetchBalance()
      fetchTransactionHistory()
    }
  }, [fetchBalance, fetchTransactionHistory, address])

  // Get test USDC from faucet
  const faucet = useCallback(
    async () => {
      if (!walletClient || !address || !publicClient) {
        throw new Error('Wallet not connected')
      }

      setState(prev => ({ ...prev, isLoading: true, error: null }))

      try {
        const { request } = await publicClient.simulateContract({
          address: CONTRACT_ADDRESSES.TestUSDC,
          abi: TestUSDCAbi,
          functionName: 'faucet',
          args: [],
          account: address,
        })

        const hash = await walletClient.writeContract(request)
        const receipt = await publicClient.waitForTransactionReceipt({ hash })

        await fetchBalance()

        toast.success('TestUSDCを取得しました: 1000 USDC')

        return receipt
      } catch (error) {
        console.error('Failed to get test USDC:', error)
        toast.error('TestUSDCの取得に失敗しました')
        throw error
      } finally {
        setState(prev => ({ ...prev, isLoading: false }))
      }
    },
    [walletClient, address, publicClient, fetchBalance]
  )

  return {
    state,
    deposit,
    withdraw,
    faucet,
    refreshData: async () => {
      await Promise.all([fetchBalance(), fetchTransactionHistory()])
    },
  }
}