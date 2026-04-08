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
    console.log(`[RelayerEngine] Created with gatewayUrl=${gatewayUrl}, retries=${this.maxRetries}, delay=${this.retryDelayMs}ms`);
  }

  async init(): Promise<void> {
    console.log(`[RelayerEngine] Initializing...`);
    console.log(`[RelayerEngine] Checking gateway health: ${this.gatewayUrl}/health`);

    try {
      const response = await fetch(`${this.gatewayUrl}/health`);
      const data = await response.json();
      console.log(`[RelayerEngine] Gateway health:`, JSON.stringify(data));
    } catch (err: any) {
      console.warn(`[RelayerEngine] ⚠️ Gateway health check failed (will retry on decrypt): ${err.message}`);
    }

    this.initialized = true;
    console.log("[RelayerEngine] ✓ Ready");
  }

  async compute(handles: Uint8Array[]): Promise<bigint[]> {
    if (!this.initialized) throw new Error("RelayerEngine not initialized");

    const handleHexes = handles.map((h) => {
      let hex = "";
      for (const b of h) hex += b.toString(16).padStart(2, "0");
      return hex;
    });

    console.log(`[RelayerEngine] compute() called with ${handleHexes.length} handles`);
    for (let i = 0; i < handleHexes.length; i++) {
      console.log(`[RelayerEngine] handle[${i}]: ${handleHexes[i].slice(0, 40)}... (${handleHexes[i].length} chars)`);
    }

    const results: bigint[] = [];
    for (let i = 0; i < handleHexes.length; i++) {
      const hex = handleHexes[i];
      let lastError: Error | null = null;
      let success = false;

      for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
        console.log(`[RelayerEngine] Decrypting handle[${i}] (${hex.slice(0, 20)}...) attempt ${attempt}/${this.maxRetries}`);
        try {
          const result = await this.kms.decrypt(hex);
          console.log(`[RelayerEngine] ★ Handle[${i}] decrypted: ${result}`);
          results.push(result);
          success = true;
          break;
        } catch (err) {
          lastError = err as Error;
          console.error(`[RelayerEngine] Attempt ${attempt} failed for handle[${i}]: ${lastError.message}`);
          if (attempt < this.maxRetries) {
            const delay = this.retryDelayMs * attempt;
            console.log(`[RelayerEngine] Retrying in ${delay}ms...`);
            await new Promise((r) => setTimeout(r, delay));
          }
        }
      }

      if (!success) {
        console.error(`[RelayerEngine] ❌ All ${this.maxRetries} attempts failed for handle[${i}]`);
        throw new Error(`Failed to decrypt handle ${i + 1} after ${this.maxRetries} attempts: ${lastError?.message}`);
      }
    }

    console.log(`[RelayerEngine] ★ All handles decrypted: [${results.join(", ")}]`);
    return results;
  }

  async signResult(decryptionId: bigint, result: bigint, signer: ethers.Signer): Promise<string> {
    console.log(`[RelayerEngine] Signing result id=${decryptionId}, result=${result}`);
    const message = ethers.solidityPackedKeccak256(
      ["uint256", "uint256"],
      [decryptionId, result]
    );
    const sig = await signer.signMessage(ethers.getBytes(message));
    console.log(`[RelayerEngine] Signature: ${sig.slice(0, 20)}...`);
    return sig;
  }
}
