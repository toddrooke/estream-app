/**
 * Crypto utilities for estream-app.
 * 
 * Uses @noble/hashes for cryptographic primitives.
 */

import nacl from 'tweetnacl';
import { sha256 as nobleSha256 } from '@noble/hashes/sha256';

/**
 * SHA256 hash function.
 * @param data - Data to hash
 * @returns 32-byte hash
 */
export function sha256(data: Uint8Array): Uint8Array {
  return nobleSha256(data);
}

/**
 * Generate a random 32-byte value.
 */
export function randomBytes(length: number = 32): Uint8Array {
  return nacl.randomBytes(length);
}

/**
 * Generate an Ed25519 keypair.
 */
export function generateKeyPair(): { publicKey: Uint8Array; secretKey: Uint8Array } {
  return nacl.sign.keyPair();
}

/**
 * Sign a message with Ed25519.
 * @param message - Message to sign
 * @param secretKey - 64-byte secret key
 * @returns 64-byte signature
 */
export function sign(message: Uint8Array, secretKey: Uint8Array): Uint8Array {
  return nacl.sign.detached(message, secretKey);
}

/**
 * Verify an Ed25519 signature.
 * @param message - Original message
 * @param signature - 64-byte signature
 * @param publicKey - 32-byte public key
 * @returns true if valid
 */
export function verify(
  message: Uint8Array,
  signature: Uint8Array,
  publicKey: Uint8Array
): boolean {
  return nacl.sign.detached.verify(message, signature, publicKey);
}

/**
 * Convert bytes to hex string.
 */
export function toHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert hex string to bytes.
 */
export function fromHex(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

/**
 * Constant-time equality check.
 * @param a - First array
 * @param b - Second array
 * @returns true if equal
 */
export function constantTimeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a[i] ^ b[i];
  }
  return result === 0;
}


