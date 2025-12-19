/**
 * Vault Context - React context for vault service access.
 * 
 * Provides the best available vault service to the app.
 */

import React, { createContext, useContext, useEffect, useState, useCallback, ReactNode } from 'react';
import { VaultService, AttestationData, getVaultService } from './VaultService';
import { TrustLevel, SignedEnvelopeHeaders } from '@/types';
import { signRequestEnvelope, createSignedClient } from '@/api/signedClient';

interface VaultContextValue {
  // Vault state
  isLoading: boolean;
  isAvailable: boolean;
  error: Error | null;
  trustLevel: TrustLevel | null;
  publicKey: string | null;
  
  // Actions
  getPublicKey: () => Promise<Uint8Array>;
  getPublicKeyBase58: () => Promise<string>;
  sign: (message: Uint8Array) => Promise<Uint8Array>;
  signRequest: (method: string, path: string, body: unknown) => Promise<SignedEnvelopeHeaders>;
  getAttestation: () => Promise<AttestationData | null>;
  
  // Signed API client
  api: ReturnType<typeof createSignedClient> | null;
}

const VaultContext = createContext<VaultContextValue | null>(null);

interface VaultProviderProps {
  children: ReactNode;
  nodeUrl?: string;
}

/**
 * Vault Provider - Initializes and provides vault service.
 */
export function VaultProvider({ children, nodeUrl }: VaultProviderProps) {
  const [vault, setVault] = useState<VaultService | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isAvailable, setIsAvailable] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [trustLevel, setTrustLevel] = useState<TrustLevel | null>(null);
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [api, setApi] = useState<ReturnType<typeof createSignedClient> | null>(null);

  // Initialize vault
  useEffect(() => {
    let mounted = true;

    async function initVault() {
      try {
        const vaultService = await getVaultService();
        
        if (!mounted) return;
        
        setVault(vaultService);
        setIsAvailable(true);
        
        // Get initial state
        const level = await vaultService.getTrustLevel();
        const pubKey = await vaultService.getPublicKeyBase58();
        
        if (!mounted) return;
        
        setTrustLevel(level);
        setPublicKey(pubKey);
        
        // Create API client
        const client = createSignedClient(vaultService, nodeUrl);
        setApi(client);
        
      } catch (err) {
        console.error('Failed to initialize vault:', err);
        if (mounted) {
          setError(err as Error);
          setIsAvailable(false);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    initVault();

    return () => {
      mounted = false;
    };
  }, [nodeUrl]);

  // Callbacks that use vault
  const getPublicKeyAsync = useCallback(async (): Promise<Uint8Array> => {
    if (!vault) {
      throw new Error('Vault not initialized');
    }
    return vault.getPublicKey();
  }, [vault]);

  const getPublicKeyBase58Async = useCallback(async (): Promise<string> => {
    if (!vault) {
      throw new Error('Vault not initialized');
    }
    return vault.getPublicKeyBase58();
  }, [vault]);

  const signAsync = useCallback(async (message: Uint8Array): Promise<Uint8Array> => {
    if (!vault) {
      throw new Error('Vault not initialized');
    }
    return vault.sign(message);
  }, [vault]);

  const signRequestAsync = useCallback(async (
    method: string,
    path: string,
    body: unknown
  ): Promise<SignedEnvelopeHeaders> => {
    if (!vault) {
      throw new Error('Vault not initialized');
    }
    return signRequestEnvelope(vault, method, path, body);
  }, [vault]);

  const getAttestationAsync = useCallback(async (): Promise<AttestationData | null> => {
    if (!vault || !vault.getAttestation) {
      return null;
    }
    return vault.getAttestation();
  }, [vault]);

  const value: VaultContextValue = {
    isLoading,
    isAvailable,
    error,
    trustLevel,
    publicKey,
    getPublicKey: getPublicKeyAsync,
    getPublicKeyBase58: getPublicKeyBase58Async,
    sign: signAsync,
    signRequest: signRequestAsync,
    getAttestation: getAttestationAsync,
    api,
  };

  return (
    <VaultContext.Provider value={value}>
      {children}
    </VaultContext.Provider>
  );
}

/**
 * Hook to access vault context.
 */
export function useVault(): VaultContextValue {
  const context = useContext(VaultContext);
  if (!context) {
    throw new Error('useVault must be used within a VaultProvider');
  }
  return context;
}

/**
 * Hook to get the signed API client.
 */
export function useSignedApi() {
  const { api, isLoading, error } = useVault();
  return { api, isLoading, error };
}

/**
 * Hook to get trust level badge info.
 */
export function useTrustBadge() {
  const { trustLevel, isLoading } = useVault();
  
  if (isLoading || !trustLevel) {
    return { label: 'Loading...', color: 'gray', icon: '⏳' };
  }
  
  switch (trustLevel) {
    case TrustLevel.Certified:
      return { label: 'Certified', color: 'gold', icon: '🛡️' };
    case TrustLevel.HardwareBacked:
      return { label: 'Hardware', color: 'green', icon: '🔒' };
    case TrustLevel.SoftwareBacked:
      return { label: 'Software', color: 'orange', icon: '⚠️' };
    default:
      return { label: 'Unknown', color: 'red', icon: '❓' };
  }
}





