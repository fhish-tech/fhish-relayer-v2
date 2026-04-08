# FHISH Relayer V2 — AGENTS.md

## Tech Stack
- **Runtime**: Node.js 20+
- **Language**: TypeScript
- **HTTP Client**: axios (with retry/backoff)
- **Blockchain**: ethers v6
- **Monitoring**: Prometheus (prom-client)
- **Container**: Docker + Docker Compose

## Build Commands
```bash
npm install              # Install dependencies
npm run start            # ts-node src/index.ts
npm run dev              # Development mode
docker compose up        # Production with Docker
```

## Key Files
- `src/index.ts`         — Main entry: initializes engine, listener, responder, health server
- `src/listener.ts`       — Polls FhishGateway for PublicDecryptionRequest events
- `src/compute.ts`        — RelayerEngine: orchestrates decryption via KMS
- `src/kms.ts`            — KMSClient: HTTP calls to gateway /decrypt with retry
- `src/responder.ts`      — Signs and broadcasts fulfillment transactions
- `src/test-compute.ts`   — Local test script
- `.env`                  — Configuration (gitignored)

## Event Flow
1. Listen for `PublicDecryptionRequest(decryptionId, ctHandles[], extraData)`
2. For each handle in ctHandles: POST to gateway /decrypt
3. Receive plaintext values from gateway
4. Sign results with EIP-712 (relayer private key)
5. Call FhishGateway.fulfillPublicDecryption(decryptionId, encodedResults, [signature])

## Environment Variables
```
RPC_URL=https://ethereum-sepolia.publicnode.com
PRIVATE_KEY=0x...                    # Relayer wallet private key
GATEWAY_ADDRESS=0x...               # On-chain FhishGateway address
GATEWAY_URL=http://localhost:8080   # Gateway HTTP endpoint
FHISH_RELAYER_SECRET=fhish-default-secret
```

## Architecture
Authorized relayer service. Watches on-chain events, calls FHISH gateway for decryption,
signs results with ECDSA, and broadcasts fulfillment transactions.
Never contacts Zama infrastructure.
