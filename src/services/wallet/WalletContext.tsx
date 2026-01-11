/**
 * Wallet Context
 * 
 * React context for wallet state and operations.
 * Provides unified access to both Solana (MWA) and eStream identity.
 */

import React, { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';
import { Platform } from 'react-native';
import { WalletService, getWalletService, type WalletAccount, type SignResult, type SendResult } from './WalletService';
import type { Transaction, VersionedTransaction } from '@solana/web3.js';

// ============================================================================
// Context Types
// ============================================================================

interface WalletContextValue {
  /** Current wallet account state */
  account: WalletAccount | null;
  /** Loading state */
  isLoading: boolean;
  /** Error message */
  error: string | null;
  /** Is Solana wallet connected (Android only) */
  isSolanaConnected: boolean;
  
  // Actions
  /** Initialize wallet */
  initialize: () => Promise<void>;
  /** Connect Solana wallet (Android MWA) */
  connectSolana: () => Promise<boolean>;
  /** Disconnect Solana wallet */
  disconnectSolana: () => Promise<void>;
  /** Sign a Solana transaction */
  signTransaction: (tx: Transaction | VersionedTransaction) => Promise<Transaction | VersionedTransaction>;
  /** Sign and send a transaction */
  sendTransaction: (tx: Transaction | VersionedTransaction) => Promise<SendResult>;
  /** Sign a message with eStream identity */
  signMessage: (message: Uint8Array) => Promise<SignResult>;
  /** Sign a governance action */
  signGovernance: (action: { type: string; operation: string; params: Record<string, unknown> }) => Promise<SignResult>;
  /** Mint identity NFT */
  mintIdentityNft: () => Promise<boolean>;
}

// ============================================================================
// Context
// ============================================================================

const WalletContext = createContext<WalletContextValue | undefined>(undefined);

// ============================================================================
// Provider
// ============================================================================

interface WalletProviderProps {
  children: ReactNode;
}

export function WalletProvider({ children }: WalletProviderProps): JSX.Element {
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSolanaConnected, setIsSolanaConnected] = useState(false);

  const walletService = getWalletService();

  const initialize = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    
    try {
      const walletAccount = await walletService.initialize();
      setAccount(walletAccount);
      setIsSolanaConnected(walletService.isSolanaWalletConnected());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to initialize wallet');
    } finally {
      setIsLoading(false);
    }
  }, [walletService]);

  const connectSolana = useCallback(async (): Promise<boolean> => {
    if (Platform.OS !== 'android') {
      setError('Solana wallet requires Android');
      return false;
    }

    try {
      const address = await walletService.connectSolanaWallet();
      if (address) {
        setIsSolanaConnected(true);
        // Refresh account to include Solana address
        await initialize();
        return true;
      }
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to connect');
      return false;
    }
  }, [walletService, initialize]);

  const disconnectSolana = useCallback(async () => {
    await walletService.disconnectSolanaWallet();
    setIsSolanaConnected(false);
    await initialize();
  }, [walletService, initialize]);

  const signTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction) => {
      return walletService.signTransaction(tx);
    },
    [walletService]
  );

  const sendTransaction = useCallback(
    async (tx: Transaction | VersionedTransaction): Promise<SendResult> => {
      return walletService.signAndSendTransaction(tx);
    },
    [walletService]
  );

  const signMessage = useCallback(
    async (message: Uint8Array): Promise<SignResult> => {
      return walletService.signMessage(message);
    },
    [walletService]
  );

  const signGovernance = useCallback(
    async (action: { type: string; operation: string; params: Record<string, unknown> }): Promise<SignResult> => {
      return walletService.signGovernanceAction(action);
    },
    [walletService]
  );

  const mintIdentityNft = useCallback(async (): Promise<boolean> => {
    try {
      const result = await walletService.mintIdentityNft();
      if (result.success) {
        await initialize();
        return true;
      }
      setError(result.error || 'Minting failed');
      return false;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Minting failed');
      return false;
    }
  }, [walletService, initialize]);

  // Auto-initialize on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  const value: WalletContextValue = {
    account,
    isLoading,
    error,
    isSolanaConnected,
    initialize,
    connectSolana,
    disconnectSolana,
    signTransaction,
    sendTransaction,
    signMessage,
    signGovernance,
    mintIdentityNft,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

// ============================================================================
// Hook
// ============================================================================

export function useWallet(): WalletContextValue {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
}
