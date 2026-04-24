# Fhish Relayer V2

The Relayer is a critical off-chain infrastructure component in the Fhish FHE stack. Because smart contracts on the EVM cannot natively perform heavy FHE cryptographic operations (without precompiles), the Relayer bridges the gap.

## Architecture

The Relayer operates as a Node.js daemon that continuously polls the MiniEVM network for specific events and fulfills them:

1. **Event Polling**: Uses `ethers.js` to scan for `VoteCast` or `DecryptionRequested` events on the `PrivateVotingV2` contract.
2. **Ciphertext Retrieval**: When a handle (e.g., `0x87dd4...`) is detected in an event, the Relayer queries the `fhish-gateway` HTTP API to download the raw 16KB ciphertext blob associated with that handle.
3. **WASM Decryption**: The Relayer invokes the `decrypt_ciphertext` WASM binding (via `fhish-wasm`) to securely decrypt the ciphertext locally using the loaded FHE Server keys.
4. **On-Chain Fulfillment**: Once the tally or result is decrypted, the Relayer submits a transaction back to the EVM (e.g., calling `setDecryptedResult`), officially finalizing the encrypted operation on-chain.

## Configuration
Requires the `DEPLOYER_PRIVATE_KEY` (must match the admin of the contracts) and the `GATEWAY_URL`.
