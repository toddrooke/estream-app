/**
 * Signed API Client
 * 
 * Generates signed request envelopes for privileged API operations.
 * Uses estream-browser WASM for cryptographic operations.
 */

import { VaultService } from '@/services/vault/VaultService';
import { SignedEnvelopeHeaders } from '@/types';
import { sha256 } from '@/utils/crypto';
import bs58 from 'bs58';
import { networkConfig } from '@estream/react-native';

// Get API endpoint from network config (changes based on selected environment)
const getDefaultNodeUrl = () => networkConfig.getEndpoints().apiEndpoint;

/**
 * Generate a cryptographically random nonce.
 */
function generateNonce(): Uint8Array {
  const nonce = new Uint8Array(32);
  // Use crypto.getRandomValues in React Native
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    crypto.getRandomValues(nonce);
  } else {
    // Fallback for older environments
    for (let i = 0; i < 32; i++) {
      nonce[i] = Math.floor(Math.random() * 256);
    }
  }
  return nonce;
}

/**
 * Convert bytes to hex string.
 */
function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Stable JSON stringify for body hash.
 * Sorts object keys alphabetically for deterministic output.
 */
function stableStringify(obj: unknown): string {
  if (obj === null) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) {
    return '[' + obj.map(stableStringify).join(',') + ']';
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const pairs = keys.map(
    (key) => `"${key}":${stableStringify((obj as Record<string, unknown>)[key])}`
  );
  return '{' + pairs.join(',') + '}';
}

/**
 * Generate signed envelope headers for a request.
 */
export async function signRequestEnvelope(
  vault: VaultService,
  method: string,
  path: string,
  body: unknown
): Promise<SignedEnvelopeHeaders> {
  // 1. Generate nonce
  const nonce = generateNonce();
  
  // 2. Get timestamp
  const timestamp = Date.now();
  
  // 3. Hash body
  const bodyJson = body ? stableStringify(body) : '';
  const bodyHash = sha256(new TextEncoder().encode(bodyJson));
  
  // 4. Build signing payload
  const payload = `${method}.${path}.${toHex(bodyHash)}.${timestamp}.${toHex(nonce)}`;
  
  // 5. Sign with vault
  const signature = await vault.sign(new TextEncoder().encode(payload));
  
  // 6. Get public key
  const publicKey = await vault.getPublicKey();
  
  // 7. Return headers
  return {
    'X-Device-Public-Key': bs58.encode(publicKey),
    'X-Device-Signature': bs58.encode(signature),
    'X-Device-Timestamp': timestamp.toString(),
    'X-Device-Nonce': toHex(nonce),
    'X-Body-Hash': toHex(bodyHash),
  };
}

/**
 * Make a signed fetch request.
 */
export async function signedFetch(
  vault: VaultService,
  method: string,
  path: string,
  body?: unknown,
  nodeUrl?: string
): Promise<Response> {
  const url = nodeUrl ?? getDefaultNodeUrl();
  const headers = await signRequestEnvelope(vault, method, path, body);
  
  const init: RequestInit = {
    method,
    headers: {
      'Content-Type': 'application/json',
      ...headers,
    },
  };
  
  if (body && method !== 'GET' && method !== 'HEAD') {
    init.body = JSON.stringify(body);
  }
  
  return fetch(`${url}${path}`, init);
}

/**
 * Create a signed API client bound to a vault and node.
 */
export function createSignedClient(vault: VaultService, nodeUrl?: string) {
  const url = nodeUrl ?? getDefaultNodeUrl();
  return {
    get: (path: string) => signedFetch(vault, 'GET', path, undefined, url),
    post: (path: string, body: unknown) => signedFetch(vault, 'POST', path, body, url),
    put: (path: string, body: unknown) => signedFetch(vault, 'PUT', path, body, url),
    delete: (path: string) => signedFetch(vault, 'DELETE', path, undefined, url),
  };
}





