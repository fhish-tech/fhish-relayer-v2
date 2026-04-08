import "dotenv/config";
import { ethers } from "ethers";
import express from "express";
import { RelayerEngine } from "./compute.js";
import { startListener } from "./listener.js";
import { createResponder } from "./responder.js";

const GATEWAY_ABI = [
  "event CiphertextSubmitted(bytes32 indexed handle, uint256 size, address submitter)",
  "event PublicDecryptionRequest(uint256 indexed decryptionId, bytes32[] ctHandles, bytes extraData)",
  "event PublicDecryptionResponse(uint256 indexed decryptionId, bytes decryptedResult, bytes[] signatures, bytes extraData)",
  "function fulfillPublicDecryption(uint256 decryptionId, bytes decryptedResult, bytes[] signatures) external",
  "function fulfillPublicDecryptionNoVerify(uint256 decryptionId, bytes decryptedResult) external",
  "function isDecryptionDone(uint256 decryptionId) external view returns (bool)",
  "function requestDecryption(uint256[] calldata ctsHandles, bytes4 callbackSelector, uint256 msgValue, uint256 maxTimestamp, bool passSignaturesToCaller) external returns (uint256)",
  "function getCiphertext(bytes32 handle) external view returns (bytes memory ciphertext)"
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const gatewayAddress = process.env.GATEWAY_ADDRESS;
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8080";

  console.log("[RELAYER] Starting FHISH Relayer v2...");
  console.log("[RELAYER] Checking env vars...");

  if (!privateKey) throw new Error("PRIVATE_KEY not set");
  if (!rpcUrl) throw new Error("RPC_URL not set");
  if (!gatewayAddress) throw new Error("GATEWAY_ADDRESS not set");

  console.log("[RELAYER] ✓ All required env vars present");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const gateway = new ethers.Contract(gatewayAddress, GATEWAY_ABI, signer);

  console.log(`╔══════════════════════════════════════════════╗`);
  console.log(`║         FHISH RELAYER v2 RUNNING ★       ║`);
  console.log(`║  Gateway contract: ${gatewayAddress.padEnd(26)}║`);
  console.log(`║  Relayer address:  ${signer.address.padEnd(26)}║`);
  console.log(`║  Gateway URL:      ${gatewayUrl.padEnd(26)}║`);
  console.log(`║  RPC:             ${rpcUrl.slice(0, 26).padEnd(26)}║`);
  console.log(`╚══════════════════════════════════════════════╝`);

  console.log("[RELAYER] Creating RelayerEngine...");
  const engine = new RelayerEngine(gatewayUrl, signer, gatewayAddress);
  console.log("[RELAYER] Calling engine.init()...");
  await engine.init();

  console.log("[RELAYER] Creating responder...");
  const responder = createResponder(gateway, signer);

  console.log("[RELAYER] Starting event listener...");
  await startListener(gateway, engine, responder);

  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", relayer: signer.address, uptime: process.uptime() });
  });
  const port = parseInt(process.env.HEALTH_PORT || "3001", 10);
  app.listen(port, () => {
    console.log(`╔══════════════════════════════════════════════╗`);
    console.log(`║  Health server listening on port ${String(port).padEnd(18)}║`);
    console.log(`╚══════════════════════════════════════════════╝`);
  });
}

main().catch((err) => {
  console.error("[RELAYER] FATAL:", err.message);
  console.error("[RELAYER] Stack:", err.stack);
  process.exit(1);
});
