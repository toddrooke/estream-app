/**
 * useEphemeralLinkHandler - Hook for handling incoming ephemeral links
 * 
 * Handles deep links from link.estream.dev/e/{key} and fetches the
 * encrypted payload from the edge proxy.
 */

import { useEffect, useState, useCallback } from 'react';
import { Linking } from 'react-native';
import { getNetworkEndpoints } from '@estream/react-native';

// ============================================================================
// Types
// ============================================================================

export interface EphemeralPayload {
  type: 'friend-invite' | 'payment-request' | 'org-invite';
  lookupKey: string;
  expiresAt: number;
  // Friend invite
  senderName?: string;
  senderKemPublic?: string;
  // Payment request
  amount?: string;
  currency?: string;
  memo?: string;
  recipientKeyRef?: string;
  // Org invite
  orgId?: string;
  orgName?: string;
  role?: string;
  inviteCode?: string;
}

export interface EphemeralLinkState {
  /** Whether we're currently fetching a payload */
  isLoading: boolean;
  /** The fetched payload (if any) */
  payload: EphemeralPayload | null;
  /** Error message (if any) */
  error: string | null;
  /** Clear the current payload */
  clear: () => void;
}

// ============================================================================
// Constants
// ============================================================================

const LINK_DOMAIN = 'link.estream.dev';
const PATH_PREFIX = '/e/';

// ============================================================================
// Hook
// ============================================================================

export function useEphemeralLinkHandler(): EphemeralLinkState {
  const [isLoading, setIsLoading] = useState(false);
  const [payload, setPayload] = useState<EphemeralPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Clear the current payload
  const clear = useCallback(() => {
    setPayload(null);
    setError(null);
  }, []);

  // Fetch payload from edge proxy
  const fetchPayload = useCallback(async (lookupKey: string) => {
    setIsLoading(true);
    setError(null);

    try {
      const endpoints = getNetworkEndpoints();
      const baseUrl = endpoints.sparkLatticeUrl || 'https://edge.estream.dev';
      
      const response = await fetch(`${baseUrl}/e/${lookupKey}`, {
        headers: { 'Accept': 'application/json' },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        
        if (response.status === 404) {
          setError('This link was not found or has already been used.');
        } else if (response.status === 410) {
          setError('This link has expired.');
        } else {
          setError(errorData.message || 'Failed to fetch invite.');
        }
        return;
      }

      const data = await response.json();
      
      // Parse the encrypted payload
      // Note: In production, we'd decrypt using ML-KEM here
      // For now, we parse the type and basic metadata
      const ephemeralPayload: EphemeralPayload = {
        type: data.type as EphemeralPayload['type'],
        lookupKey,
        expiresAt: data.expires_at,
      };

      // Add type-specific fields
      if (data.type === 'friend-invite') {
        ephemeralPayload.senderKemPublic = data.kem_public;
        // Note: senderName would be decrypted from encrypted_payload
      } else if (data.type === 'payment-request') {
        // These would be decrypted from the payload
        // For now, we'd need the decryption key from the link creator
      } else if (data.type === 'org-invite') {
        // These would be decrypted from the payload
      }

      setPayload(ephemeralPayload);
    } catch (err) {
      console.error('[EphemeralLink] Fetch error:', err);
      setError('Failed to load invite. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Parse URL and extract lookup key
  const handleUrl = useCallback((url: string) => {
    try {
      const parsed = new URL(url);
      
      if (parsed.host !== LINK_DOMAIN) {
        return; // Not an ephemeral link
      }

      if (!parsed.pathname.startsWith(PATH_PREFIX)) {
        return; // Not an /e/ path
      }

      const lookupKey = parsed.pathname.slice(PATH_PREFIX.length);
      
      if (lookupKey && lookupKey.length >= 6) {
        console.log('[EphemeralLink] Handling link:', lookupKey);
        fetchPayload(lookupKey);
      }
    } catch (err) {
      console.error('[EphemeralLink] URL parse error:', err);
    }
  }, [fetchPayload]);

  // Listen for deep links
  useEffect(() => {
    // Handle initial URL (app opened via link)
    const handleInitialUrl = async () => {
      const initialUrl = await Linking.getInitialURL();
      if (initialUrl) {
        handleUrl(initialUrl);
      }
    };

    handleInitialUrl();

    // Handle URLs while app is running
    const subscription = Linking.addEventListener('url', (event) => {
      handleUrl(event.url);
    });

    return () => {
      subscription.remove();
    };
  }, [handleUrl]);

  return {
    isLoading,
    payload,
    error,
    clear,
  };
}

export default useEphemeralLinkHandler;
