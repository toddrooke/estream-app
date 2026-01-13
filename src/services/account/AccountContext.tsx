/**
 * Account Context
 * 
 * React context that provides account state to the app.
 * Integrates with VaultContext to auto-create account on first launch.
 */

import React, { createContext, useContext, useEffect, useState, ReactNode, useCallback } from 'react';
import { AccountService, Account, AccountUpdate, hashPubkey } from './AccountService';
import { useVault } from '../vault';

// ============================================================================
// Context Types
// ============================================================================

interface AccountContextValue {
  /** Current account (null if not loaded yet) */
  account: Account | null;
  
  /** Loading state */
  isLoading: boolean;
  
  /** Whether this is a new account (just created) */
  isNewAccount: boolean;
  
  /** Update account fields */
  updateAccount: (updates: AccountUpdate) => Promise<void>;
  
  /** Complete onboarding */
  completeOnboarding: () => Promise<void>;
  
  /** Refresh account from storage */
  refresh: () => Promise<void>;
}

const AccountContext = createContext<AccountContextValue | null>(null);

// ============================================================================
// Provider
// ============================================================================

interface AccountProviderProps {
  children: ReactNode;
}

export function AccountProvider({ children }: AccountProviderProps) {
  const { publicKey, getPublicKey, isLoading: vaultLoading } = useVault();
  
  const [account, setAccount] = useState<Account | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isNewAccount, setIsNewAccount] = useState(false);

  // Initialize account when vault is ready
  useEffect(() => {
    if (vaultLoading) return;
    
    let mounted = true;

    async function initAccount() {
      try {
        // Get the public key from vault
        const pubkey = await getPublicKey();
        const pubkeyHash = hashPubkey(pubkey);
        
        // Check if account already exists
        const existing = await AccountService.load();
        const isNew = !existing || existing.pubkeyHash !== pubkeyHash;
        
        // Get or create account
        const acct = await AccountService.getOrCreate(pubkeyHash);
        
        if (mounted) {
          setAccount(acct);
          setIsNewAccount(isNew && !existing?.onboardingComplete);
          setIsLoading(false);
          
          if (isNew) {
            console.log('[Account] New account created');
          } else {
            console.log('[Account] Loaded existing account:', acct.displayName);
          }
        }
      } catch (error) {
        console.error('[Account] Init failed:', error);
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initAccount();

    return () => {
      mounted = false;
    };
  }, [vaultLoading, getPublicKey]);

  // Subscribe to account changes
  useEffect(() => {
    const unsubscribe = AccountService.subscribe(setAccount);
    return unsubscribe;
  }, []);

  const updateAccount = useCallback(async (updates: AccountUpdate) => {
    const updated = await AccountService.update(updates);
    if (updated) {
      setAccount(updated);
    }
  }, []);

  const completeOnboarding = useCallback(async () => {
    await updateAccount({ onboardingComplete: true });
    setIsNewAccount(false);
  }, [updateAccount]);

  const refresh = useCallback(async () => {
    const loaded = await AccountService.load();
    setAccount(loaded);
  }, []);

  const value: AccountContextValue = {
    account,
    isLoading: isLoading || vaultLoading,
    isNewAccount,
    updateAccount,
    completeOnboarding,
    refresh,
  };

  return (
    <AccountContext.Provider value={value}>
      {children}
    </AccountContext.Provider>
  );
}

// ============================================================================
// Hooks
// ============================================================================

/**
 * Hook to access account context
 */
export function useAccount(): AccountContextValue {
  const context = useContext(AccountContext);
  if (!context) {
    throw new Error('useAccount must be used within an AccountProvider');
  }
  return context;
}

/**
 * Hook to get Spark visual parameters from account
 */
export function useSparkParams() {
  const { account } = useAccount();
  
  if (!account) {
    return null;
  }
  
  return {
    pubkeyHash: account.pubkeyHash,
    displayName: account.displayName,
  };
}
