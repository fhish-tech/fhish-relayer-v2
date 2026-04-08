import "dotenv/config";
import { ethers } from "ethers";
import express from "express";
import { RelayerEngine } from "./compute.js";
import { startListener } from "./listener.js";
import { createResponder } from "./responder.js";

const GATEWAY_ABI = [
  "event PublicDecryptionRequest(uint256 indexed decryptionId, bytes32[] ctHandles, bytes extraData)",
  "event PublicDecryptionResponse(uint256 indexed decryptionId, bytes decryptedResult, bytes[] signatures, bytes extraData)",
  "function fulfillPublicDecryption(uint256 decryptionId, bytes decryptedResult, bytes[] signatures) external",
  "function fulfillPublicDecryptionNoVerify(uint256 decryptionId, bytes decryptedResult) external",
  "function isDecryptionDone(uint256 decryptionId) external view returns (bool)",
  "function requestDecryption(uint256[] calldata ctsHandles, bytes4 callbackSelector, uint256 msgValue, uint256 maxTimestamp, bool passSignaturesToCaller) external returns (uint256)"
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY;
  const rpcUrl = process.env.RPC_URL;
  const gatewayAddress = process.env.GATEWAY_ADDRESS;
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8080";

  if (!privateKey) throw new Error("PRIVATE_KEY not set");
  if (!rpcUrl) throw new Error("RPC_URL not set");
  if (!gatewayAddress) throw new Error("GATEWAY_ADDRESS not set");

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const gateway = new ethers.Contract(gatewayAddress, GATEWAY_ABI, signer);

  console.log(`FHISH Relayer v2 starting:
  Gateway contract: ${gatewayAddress}
  Relayer address:  ${signer.address}
  Gateway URL:      ${gatewayUrl}
  RPC:             ${rpcUrl}
  `);

  const engine = new RelayerEngine(gatewayUrl);
  await engine.init();

  const responder = createResponder(gateway, signer);

  await startListener(gateway, engine, responder);

  const app = express();
  app.get("/health", (_req, res) => res.json({ status: "ok", relayer: signer.address }));
  const port = parseInt(process.env.HEALTH_PORT || "3001", 10);
  app.listen(port, () => console.log(`Health server on port ${port}`));
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
