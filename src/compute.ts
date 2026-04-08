import { ethers } from "ethers";
import { KMSClient } from "./kms.js";

export class RelayerEngine {
  private initialized = false;
  private readonly gatewayUrl: string;
  private readonly kms: KMSClient;
  private readonly maxRetries: number;
  private readonly retryDelayMs: number;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
    this.kms = new KMSClient(gatewayUrl);
    this.maxRetries = 3;
    this.retryDelayMs = 2000;
  }

  async init(): Promise<void> {
    console.log(`[RelayerEngine] Initializing with gateway: ${this.gatewayUrl}`);
    this.initialized = true;
    console.log("[RelayerEngine] Ready");
  }

  async compute(handles: Uint8Array[]): Promise<bigint[]> {
    if (!this.initialized) throw new Error("RelayerEngine not initialized");

    const handleHexes = handles.map((h) => {
      let hex = "";
      for (const b of h) hex += b.toString(16).padStart(2, "0");
      return hex;
    });

    const results: bigint[] = [];
    for (let i = 0; i < handleHexes.length; i++) {
      const hex = handleHexes[i];
      let lastError: Error | null = null;
      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        try {
          console.log(`[RelayerEngine] Decrypting handle ${i + 1}/${handleHexes.length} (attempt ${attempt})`);
          const result = await this.kms.decrypt(hex);
          results.push(result);
          console.log(`[RelayerEngine] Handle ${i + 1} decrypted: ${result}`);
          break;
        } catch (err) {
          lastError = err as Error;
          console.error(`[RelayerEngine] Attempt ${attempt} failed for handle ${i + 1}: ${lastError.message}`);
          if (attempt < this.maxRetries) {
            const delay = this.retryDelayMs * attempt;
            console.log(`[RelayerEngine] Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }
      if (results.length !== i + 1) {
        throw new Error(`Failed to decrypt handle ${i + 1} after ${this.maxRetries} attempts: ${lastError?.message}`);
      }
    }
    return results;
  }

  async signResult(decryptionId: bigint, result: bigint, signer: ethers.Signer): Promise<string> {
    const message = ethers.solidityPackedKeccak256(
      ["uint256", "uint256"],
      [decryptionId, result]
    );
    return signer.signMessage(ethers.getBytes(message));
  }
}
