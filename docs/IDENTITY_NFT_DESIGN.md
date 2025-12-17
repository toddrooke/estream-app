# eStream & TakeTitle Identity NFT Design

## Overview

Three-tier NFT system with privacy-preserving dynamic updates and deep linking.

## NFT Types

### 1. eStream Identity NFT (Privacy-Preserving Dynamic)

**Purpose:** Represents a user's eStream node identity and trust level.

**Dynamic Elements:**
- Trust level (Software → Hardware → Certified)
- Tenure (member since date)
- Activity score (anonymized)
- Total anchors committed

**Privacy Preserved:**
- ❌ NO app list (prevents profiling)
- ❌ NO resource names
- ❌ NO identifiable patterns

**Visual Layout:**
```
┌─────────────────────────────────────┐
│  ⚡ eStream Identity                │
│                                     │
│  Trust Level: ████████░░ Hardware   │
│  Node Since:  Dec 2024              │
│  Activity:    ●●●●●○○○ (Active)     │
│  Anchors:     1,247                 │
│                                     │
└─────────────────────────────────────┘
```

**On-Chain Metadata:**
```json
{
  "name": "eStream Identity",
  "symbol": "ESTREAM",
  "description": "eStream network identity NFT",
  "image": "https://nft.estream.io/identity/{pubkey}.svg",
  "attributes": [
    { "trait_type": "Trust Level", "value": "Hardware" },
    { "trait_type": "Member Since", "value": "2024-12" },
    { "trait_type": "Activity Score", "value": 75 },
    { "trait_type": "Anchors", "value": 1247 }
  ],
  "external_url": "https://estream.io/identity/{pubkey}"
}
```

---

### 2. TakeTitle Account NFT (Dynamic)

**Purpose:** Represents a user's TakeTitle portfolio and marketplace presence.

**Dynamic Elements:**
- Total assets owned
- TITLE token balance
- Active listings count
- Listed value (USD)

**Visual Layout:**
```
┌─────────────────────────────────────┐
│  🏠 TakeTitle Portfolio             │
│                                     │
│  Assets Owned: 3                    │
│  Tokens Held:  12,450 TITLE         │
│  ┌─────────────────────────────┐   │
│  │ 🏷️ 2 FOR SALE               │   │
│  │    Listed Value: $45,000    │   │
│  └─────────────────────────────┘   │
│                                     │
│  [Tap to open TakeTitle]            │
└─────────────────────────────────────┘
```

**Deep Link:** `taketitle://account/{pubkey}`

**On-Chain Metadata:**
```json
{
  "name": "TakeTitle Portfolio",
  "symbol": "TTPORT",
  "description": "TakeTitle marketplace portfolio NFT",
  "image": "https://nft.taketitle.io/portfolio/{pubkey}.svg",
  "animation_url": "https://nft.taketitle.io/portfolio/{pubkey}.html",
  "attributes": [
    { "trait_type": "Assets Owned", "value": 3 },
    { "trait_type": "Token Balance", "value": 12450 },
    { "trait_type": "Active Listings", "value": 2 },
    { "trait_type": "Listed Value USD", "value": 45000 }
  ],
  "external_url": "https://taketitle.io/portfolio/{pubkey}"
}
```

---

### 3. TakeTitle Asset NFT (Dynamic per Asset)

**Purpose:** Represents a specific real-world asset (Title Record) with ownership and marketplace status.

**Dynamic Elements:**
- Listing status (For Sale / Not Listed)
- Token price & availability
- Viewer's ownership percentage
- Provenance depth (event count)
- Last update timestamp

**Visual Layout:**
```
┌─────────────────────────────────────┐
│  📜 Title Record #TT-2024-00123     │
│                                     │
│  Asset: 123 Main St, Austin TX      │
│  Type:  Single Family Residential   │
│                                     │
│  ┌─────────────────────────────┐   │
│  │ 🟢 LISTED FOR SALE          │   │
│  │    500 tokens @ $45 each    │   │
│  │    You own: 150 (30%)       │   │
│  └─────────────────────────────┘   │
│                                     │
│  Provenance: 47 events anchored     │
│  Last Update: 2 hours ago           │
│                                     │
│  [Tap to view in TakeTitle]         │
└─────────────────────────────────────┘
```

**Deep Links:**
- `taketitle://asset/{asset_id}` - Asset detail view
- `taketitle://listing/{listing_id}` - Marketplace listing
- `taketitle://buy/{asset_id}` - Direct buy flow

**On-Chain Metadata:**
```json
{
  "name": "Title Record #TT-2024-00123",
  "symbol": "TTDEED",
  "description": "TakeTitle real-world asset deed",
  "image": "https://nft.taketitle.io/asset/{asset_id}.svg",
  "animation_url": "https://nft.taketitle.io/asset/{asset_id}.html",
  "attributes": [
    { "trait_type": "Asset Type", "value": "Single Family Residential" },
    { "trait_type": "Location", "value": "Austin, TX" },
    { "trait_type": "Listing Status", "value": "For Sale" },
    { "trait_type": "Token Price USD", "value": 45 },
    { "trait_type": "Tokens Available", "value": 500 },
    { "trait_type": "Provenance Events", "value": 47 },
    { "trait_type": "Total Supply", "value": 1000 }
  ],
  "external_url": "https://taketitle.io/asset/{asset_id}",
  "properties": {
    "category": "real_world_asset",
    "deed_standard": "DEED-1.0"
  }
}
```

---

## Deep Link Scheme

| Pattern | Target | Description |
|---------|--------|-------------|
| `taketitle://account/{pubkey}` | Account view | Opens user's portfolio |
| `taketitle://asset/{asset_id}` | Asset detail | Opens asset information |
| `taketitle://listing/{listing_id}` | Listing view | Opens marketplace listing |
| `taketitle://buy/{asset_id}` | Buy flow | Opens purchase interface |

---

## Privacy Matrix

| NFT Type | Dynamic? | Visible | Hidden |
|----------|----------|---------|--------|
| eStream Identity | Yes (limited) | Trust level, tenure, activity score, anchor count | App list, resource names, usage patterns |
| TakeTitle Account | Yes | Asset count, listings, token balance | Specific asset details, transaction history |
| TakeTitle Asset | Yes | Listing status, ownership %, price, provenance | Buyer identities, full transaction log |

---

## Technical Implementation

### Dynamic Image Generation

NFT images are generated server-side as SVG with dynamic data:

```
GET https://nft.estream.io/identity/{pubkey}.svg
GET https://nft.taketitle.io/portfolio/{pubkey}.svg
GET https://nft.taketitle.io/asset/{asset_id}.svg
```

### Animation URL (Interactive HTML)

For richer experiences, `animation_url` points to an interactive HTML page:

```
GET https://nft.taketitle.io/asset/{asset_id}.html
```

This can include:
- Real-time price updates
- Clickable deep links
- Animated status indicators

### Refresh Mechanism

Marketplaces like Magic Eden / Tensor refresh metadata periodically. We ensure:
- Image URLs are cache-busted with query params
- Metadata endpoint returns fresh data
- `animation_url` fetches live data on load

---

## Metaplex Standard

All NFTs follow Metaplex Token Metadata standard with:
- `uri` pointing to JSON metadata
- `symbol` for marketplace display
- `seller_fee_basis_points` for royalties (if applicable)
- `creators` array for attribution

---

## Local Development

Use Solana local validator with Metaplex for testing:

```bash
# Start local validator with Metaplex programs
solana-test-validator --bpf-program metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s metaplex.so

# Deploy NFT collection
anchor deploy --provider.cluster localnet
```

---

## Future Enhancements

1. **Animated SVGs** - Subtle animations for activity indicators
2. **3D Models** - GLTF models for AR/VR wallets
3. **Audio** - Transaction notification sounds
4. **Composable** - Combine multiple asset NFTs into portfolio view
