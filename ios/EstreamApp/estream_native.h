/**
 * eStream Native Library - iOS FFI Header
 *
 * Post-quantum secure messaging with QUIC transport.
 * Uses ML-KEM-1024 (Kyber) and ML-DSA-87 (Dilithium) from FIPS 203/204.
 *
 * Memory Management:
 * - Functions returning char* transfer ownership to caller
 * - Call estream_free_string() to release string memory
 * - Call estream_free_bytes() to release byte array memory
 */

#ifndef ESTREAM_NATIVE_H
#define ESTREAM_NATIVE_H

#include <stdint.h>
#include <stddef.h>

#ifdef __cplusplus
extern "C" {
#endif

// ============================================================================
// Memory Management
// ============================================================================

/**
 * Free a string allocated by estream functions.
 * @param s String pointer returned by estream functions. Can be NULL.
 */
void estream_free_string(char* s);

/**
 * Free a byte array allocated by estream functions.
 * @param ptr Pointer to byte array
 * @param len Length of the byte array
 */
void estream_free_bytes(uint8_t* ptr, size_t len);

// ============================================================================
// Connection Management
// ============================================================================

/**
 * Initialize the QUIC runtime.
 * Creates a new Tokio runtime and QUIC endpoint.
 *
 * @return Handle (>= 0) on success, -1 on runtime failure, -2 on endpoint failure
 */
long estream_initialize(void);

/**
 * Connect to an eStream node.
 *
 * @param handle Connection manager handle from estream_initialize
 * @param node_addr Server address in format "host:port"
 * @return JSON string: { "success": true, "data": {...} } or { "success": false, "error": "..." }
 *         Caller must free with estream_free_string()
 */
char* estream_connect(long handle, const char* node_addr);

/**
 * Dispose of the QUIC runtime and release resources.
 *
 * @param handle Connection manager handle
 */
void estream_dispose(long handle);

// ============================================================================
// Post-Quantum Key Generation
// ============================================================================

/**
 * Generate post-quantum device keys (ML-KEM-1024 + ML-DSA-87).
 *
 * @param app_scope Application identifier for key scoping
 * @return JSON string with public key information
 *         Caller must free with estream_free_string()
 */
char* estream_generate_device_keys(const char* app_scope);

/**
 * Generate a PreKey Bundle for publishing.
 * Allows others to initiate X3DH sessions with this device.
 *
 * @param device_id Device identifier
 * @param num_one_time_keys Number of one-time prekeys to generate
 * @return JSON string with bundle data
 *         Caller must free with estream_free_string()
 */
char* estream_generate_prekey_bundle(const char* device_id, int num_one_time_keys);

// ============================================================================
// PQ-X3DH Key Exchange
// ============================================================================

/**
 * Initiate X3DH session (sender side).
 * Alice initiates a session with Bob using Bob's PreKeyBundle.
 *
 * @param our_identity_public Our identity public key bytes
 * @param our_identity_len Length of identity key
 * @param their_bundle_json JSON-encoded PreKeyBundle
 * @return JSON with shared_secret_hex and initial_message
 *         Caller must free with estream_free_string()
 */
char* estream_x3dh_initiate(
    const uint8_t* our_identity_public,
    size_t our_identity_len,
    const char* their_bundle_json
);

/**
 * Accept X3DH session (receiver side).
 * Bob accepts a session from Alice using the initial message.
 *
 * @param our_identity_public Our identity public key bytes
 * @param our_identity_len Length of identity key
 * @param spk_secret Signed prekey secret bytes
 * @param spk_secret_len Length of signed prekey secret
 * @param opk_secret One-time prekey secret bytes
 * @param opk_secret_len Length of one-time prekey secret
 * @param initial_msg_json JSON-encoded X3dhInitialMessage
 * @return JSON with shared_secret_hex
 *         Caller must free with estream_free_string()
 */
char* estream_x3dh_accept(
    const uint8_t* our_identity_public,
    size_t our_identity_len,
    const uint8_t* spk_secret,
    size_t spk_secret_len,
    const uint8_t* opk_secret,
    size_t opk_secret_len,
    const char* initial_msg_json
);

// ============================================================================
// Double Ratchet (PQ-Enhanced)
// ============================================================================

/**
 * Initialize sender-side Double Ratchet.
 * Called after X3DH to set up message encryption.
 *
 * @param shared_secret 32-byte shared secret from X3DH
 * @param their_kem_public Their ML-KEM-1024 public key
 * @param their_kem_len Length of KEM public key
 * @return JSON with handle and initial_ciphertext
 *         Caller must free with estream_free_string()
 */
char* estream_ratchet_init_sender(
    const uint8_t* shared_secret,
    const uint8_t* their_kem_public,
    size_t their_kem_len
);

/**
 * Initialize receiver-side Double Ratchet.
 *
 * @param shared_secret 32-byte shared secret from X3DH
 * @param our_kem_secret Our KEM secret key
 * @param our_kem_secret_len Length of KEM secret key
 * @param our_kem_public Our KEM public key
 * @param our_kem_public_len Length of KEM public key
 * @param initial_ciphertext Initial ciphertext from sender
 * @param initial_ct_len Length of initial ciphertext
 * @param their_kem_public Their KEM public key
 * @param their_kem_len Length of their KEM public key
 * @return JSON with handle
 *         Caller must free with estream_free_string()
 */
char* estream_ratchet_init_receiver(
    const uint8_t* shared_secret,
    const uint8_t* our_kem_secret,
    size_t our_kem_secret_len,
    const uint8_t* our_kem_public,
    size_t our_kem_public_len,
    const uint8_t* initial_ciphertext,
    size_t initial_ct_len,
    const uint8_t* their_kem_public,
    size_t their_kem_len
);

/**
 * Encrypt a message with Double Ratchet.
 *
 * @param handle Ratchet session handle
 * @param plaintext Message bytes to encrypt
 * @param plaintext_len Length of plaintext
 * @return JSON with encrypted message data
 *         Caller must free with estream_free_string()
 */
char* estream_ratchet_encrypt(
    long handle,
    const uint8_t* plaintext,
    size_t plaintext_len
);

/**
 * Decrypt a message with Double Ratchet.
 *
 * @param handle Ratchet session handle
 * @param message_json JSON-encoded RatchetMessage
 * @return JSON with plaintext
 *         Caller must free with estream_free_string()
 */
char* estream_ratchet_decrypt(long handle, const char* message_json);

/**
 * Dispose a Double Ratchet session.
 *
 * @param handle Ratchet session handle
 */
void estream_ratchet_dispose(long handle);

// ============================================================================
// HTTP/3 Client (UDP-based write operations)
// ============================================================================

/**
 * Connect to eStream HTTP/3 server.
 * Required for write operations (POST, PUT, DELETE) as HTTP/TCP is read-only.
 *
 * @param server_addr Server address in "ip:port" format (e.g., "10.0.0.120:8443")
 * @return JSON result: {"success": true} or {"error": "..."}
 *         Caller must free with estream_free_string()
 */
char* estream_h3_connect(const char* server_addr);

/**
 * POST request over HTTP/3.
 *
 * @param path API path (e.g., "/api/v1/nft/identity")
 * @param body JSON request body
 * @return JSON with status and response body
 *         Caller must free with estream_free_string()
 */
char* estream_h3_post(const char* path, const char* body);

/**
 * GET request over HTTP/3.
 *
 * @param path API path
 * @return JSON with status and response body
 *         Caller must free with estream_free_string()
 */
char* estream_h3_get(const char* path);

/**
 * Mint an eStream Identity NFT via HTTP/3.
 *
 * @param owner Owner public key (hex)
 * @param trust_level "software", "hardware", or "certified"
 * @return JSON with NFT ID and metadata
 *         Caller must free with estream_free_string()
 */
char* estream_h3_mint_identity_nft(const char* owner, const char* trust_level);

/**
 * Check if connected to HTTP/3 server.
 *
 * @return 1 if connected, 0 otherwise
 */
int estream_h3_is_connected(void);

/**
 * Disconnect from HTTP/3 server.
 */
void estream_h3_disconnect(void);

// ============================================================================
// Utility
// ============================================================================

/**
 * Get the library version.
 *
 * @return Version string (caller must free with estream_free_string)
 */
char* estream_version(void);

#ifdef __cplusplus
}
#endif

#endif /* ESTREAM_NATIVE_H */

