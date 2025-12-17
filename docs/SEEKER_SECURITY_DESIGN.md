# Seeker Maximum Security Design

## Current Implementation vs. Maximum Security

### Current State ✅
- Android KeyStore with StrongBox (Titan M2)
- ECDSA (secp256r1) signing
- Key attestation chain
- Hardware-backed key storage

### Enhancements for Maximum Security

## 1. Biometric Authentication

Enable biometric requirement for signing operations:

```kotlin
val builder = KeyGenParameterSpec.Builder(alias, PURPOSE_SIGN or PURPOSE_VERIFY)
    .setDigests(KeyProperties.DIGEST_SHA256)
    .setUserAuthenticationRequired(true)           // ← REQUIRE auth
    .setUserAuthenticationValidityDurationSeconds(30) // 30s window
    // OR for per-operation biometric:
    .setUserAuthenticationParameters(
        0,  // Require auth for every operation
        KeyProperties.AUTH_BIOMETRIC_STRONG or KeyProperties.AUTH_DEVICE_CREDENTIAL
    )
    .setIsStrongBoxBacked(true)
```

### Biometric Modes

| Mode | Use Case |
|------|----------|
| Per-Operation | High-value transactions (transfers > $1000) |
| Time-Window (30s) | Normal signing operations |
| Session-Based | Low-risk reads/queries |

## 2. True Ed25519 via Seed Vault SDK

The Solana Seeker has a dedicated **Seed Vault** app that provides:
- True Ed25519 key derivation (BIP-44 Solana paths)
- Hardware-isolated seed storage
- Cross-app signing via Mobile Wallet Adapter (MWA)

```kotlin
// Using Solana Mobile Wallet Adapter
val walletAdapter = MobileWalletAdapter(
    connectionIdentity = ConnectionIdentity(
        identityUri = Uri.parse("https://estream.io"),
        iconUri = Uri.parse("https://estream.io/icon.png"),
        identityName = "eStream"
    )
)

suspend fun signWithSeedVault(message: ByteArray): ByteArray {
    return walletAdapter.transact { 
        signMessages(
            arrayOf(message),
            arrayOf(authorizedPubkey)
        )
    }.signatures.first()
}
```

## 3. Device Registry in estream-core

### Why a Native Device Registry?

The server should maintain an authoritative registry of trusted devices:

```rust
// estream-core/src/registry/device.rs

pub struct DeviceRecord {
    /// Device's Ed25519 public key
    pub public_key: [u8; 32],
    
    /// Device attestation proof (certificate chain)
    pub attestation: Option<AttestationProof>,
    
    /// Trust level based on hardware capabilities
    pub trust_level: TrustLevel,
    
    /// When the device was registered
    pub registered_at: i64,
    
    /// Last activity timestamp
    pub last_seen: i64,
    
    /// Device metadata
    pub metadata: DeviceMetadata,
    
    /// Revocation status
    pub status: DeviceStatus,
    
    /// Governance approval (for high-trust operations)
    pub governance_approval: Option<GovernanceApproval>,
}

pub struct DeviceMetadata {
    pub device_model: String,        // "Seeker", "Pixel 8", etc.
    pub security_level: String,      // "strongbox", "tee", "software"
    pub os_version: String,
    pub app_version: String,
    pub push_token: Option<String>,  // For notifications
}

pub enum DeviceStatus {
    Active,
    Suspended,
    Revoked { reason: String, revoked_at: i64 },
    PendingApproval,
}
```

### Registration Flow

```
┌──────────────┐     ┌─────────────────┐     ┌──────────────┐
│   Seeker     │     │   estream-core  │     │   Solana     │
│   Device     │     │   (API/Registry)│     │   (Anchor)   │
└──────┬───────┘     └────────┬────────┘     └──────┬───────┘
       │                      │                      │
       │ 1. Generate Key      │                      │
       │ (StrongBox/SeedVault)│                      │
       │                      │                      │
       │ 2. Get Attestation   │                      │
       │ (Certificate Chain)  │                      │
       │                      │                      │
       │ 3. Register Request  │                      │
       │ ─────────────────────>                      │
       │ {pubkey, attestation}│                      │
       │                      │                      │
       │                      │ 4. Verify Attestation│
       │                      │ (Google Root CA)     │
       │                      │                      │
       │                      │ 5. Anchor to Chain   │
       │                      │ ─────────────────────>
       │                      │ (hash of device record)
       │                      │                      │
       │                      │ 6. Store Device      │
       │                      │ (local + on-chain)   │
       │                      │                      │
       │ 7. Confirmation      │                      │
       │ <─────────────────────                      │
       │ {device_id, trust_level}                    │
```

### On-Chain Anchoring

For maximum trust, device registrations should be anchored on-chain:

```rust
// Anchor program: estream-governance
pub fn register_device(
    ctx: Context<RegisterDevice>,
    public_key: [u8; 32],
    attestation_hash: [u8; 32],
    trust_level: u8,
) -> Result<()> {
    let device = &mut ctx.accounts.device_record;
    device.public_key = public_key;
    device.attestation_hash = attestation_hash;
    device.trust_level = trust_level;
    device.registered_at = Clock::get()?.unix_timestamp;
    device.status = DeviceStatus::Active;
    
    emit!(DeviceRegistered {
        public_key,
        trust_level,
        timestamp: device.registered_at,
    });
    
    Ok(())
}
```

## 4. Biometric App Access

For app-level access control (not just signing):

```kotlin
class BiometricAuthenticator(private val context: Context) {
    
    private val executor = ContextCompat.getMainExecutor(context)
    
    fun authenticate(
        title: String = "Authenticate to eStream",
        subtitle: String = "Use fingerprint or face unlock",
        onSuccess: () -> Unit,
        onError: (String) -> Unit
    ) {
        val promptInfo = BiometricPrompt.PromptInfo.Builder()
            .setTitle(title)
            .setSubtitle(subtitle)
            .setAllowedAuthenticators(
                BiometricManager.Authenticators.BIOMETRIC_STRONG or
                BiometricManager.Authenticators.DEVICE_CREDENTIAL
            )
            .build()
        
        val biometricPrompt = BiometricPrompt(
            context as FragmentActivity,
            executor,
            object : BiometricPrompt.AuthenticationCallback() {
                override fun onAuthenticationSucceeded(result: AuthenticationResult) {
                    onSuccess()
                }
                
                override fun onAuthenticationError(errorCode: Int, errString: CharSequence) {
                    onError(errString.toString())
                }
            }
        )
        
        biometricPrompt.authenticate(promptInfo)
    }
}
```

### App Access Modes

| Action | Auth Required | Notes |
|--------|---------------|-------|
| App Launch | Optional | User preference |
| View Balance | No | Read-only |
| View Transactions | No | Read-only |
| Transfer < $100 | Biometric | Quick confirm |
| Transfer > $100 | Biometric + PIN | Double confirm |
| Export Keys | Biometric + PIN + Delay | Maximum security |
| Change Settings | Biometric | Prevent tampering |

## 5. Security Levels Matrix

| Feature | Software | TEE | StrongBox | Seed Vault |
|---------|----------|-----|-----------|------------|
| Key Storage | Memory | Secure World | Titan M2 | Dedicated SE |
| Key Extraction | Possible | Very Hard | Impossible | Impossible |
| Side-Channel | Vulnerable | Hardened | Resistant | Resistant |
| Attestation | None | Weak | Strong | Very Strong |
| Ed25519 | Tweetnacl | KeyStore EC | KeyStore EC | Native Ed25519 |
| Solana Native | No | No | No | **Yes** |

## Recommendation

For **maximum security on Seeker**, use this priority:

1. **Seed Vault + MWA** for Solana transactions (Ed25519)
2. **StrongBox** for app-specific keys (ECDSA)
3. **Biometric** for all signing operations
4. **Device Registry** in estream-core with on-chain anchoring
5. **Per-operation auth** for high-value transactions

This creates a defense-in-depth architecture where:
- Keys never leave secure hardware
- Every signing requires biometric proof
- Device identity is verified and anchored on-chain
- Server can verify attestation before trusting requests

