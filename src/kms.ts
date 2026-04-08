import axios, { AxiosInstance } from "axios";
import { ethers } from "ethers";

export class KMSClient {
  private readonly http: AxiosInstance;
  private readonly secret: string;
  private readonly gatewayUrl: string;
  private gatewayContract: ethers.Contract | null = null;
  private signer: ethers.Signer | null = null;

  constructor(gatewayUrl: string, signer?: ethers.Signer, gatewayContractAddress?: string) {
    this.gatewayUrl = gatewayUrl;
    this.secret = process.env.FHISH_RELAYER_SECRET || "fhish-default-secret";
    console.log(`[KMS] Initialized for gateway: ${gatewayUrl}`);
    console.log(`[KMS] Using secret: ${this.secret === "fhish-default-secret" ? "DEFAULT (⚠️ change in production!)" : "CUSTOM ✓"}`);

    this.http = axios.create({
      baseURL: gatewayUrl,
      timeout: 30000,
    });

    if (signer && gatewayContractAddress) {
      this.signer = signer;
      const GATEWAY_CONTRACT_ABI = [
        "function getCiphertext(bytes32 handle) external view returns (bytes memory ciphertext)"
      ] as const;
      this.gatewayContract = new ethers.Contract(gatewayContractAddress, GATEWAY_CONTRACT_ABI, signer);
      console.log(`[KMS] Gateway contract initialized at: ${gatewayContractAddress}`);
    }
  }

  async fetchCiphertext(handleHex: string): Promise<string> {
    const cleanHandle = handleHex.startsWith("0x") ? handleHex : `0x${handleHex}`;
    console.log(`[KMS] Fetching ciphertext for handle: ${cleanHandle.slice(0, 20)}...`);

    if (this.gatewayContract) {
      try {
        console.log(`[KMS] Fetching from gateway contract...`);
        const ctBytes = await this.gatewayContract.getCiphertext(cleanHandle);
        console.log(`[KMS] Gateway contract returned: ${ctBytes.length} bytes`);
        const hex = ethers.hexlify(ctBytes);
        return hex;
      } catch (err: any) {
        console.warn(`[KMS] Gateway contract fetch failed: ${err.message}, falling back to HTTP`);
      }
    }

    console.log(`[KMS] Fetching from gateway HTTP service...`);
    const response = await this.http.get(`/ciphertext/${cleanHandle}`, {
      headers: {
        "x-fhish-relayer-secret": this.secret,
      },
    });

    console.log(`[KMS] Response status: ${response.status}`);
    if (!response.data?.ciphertext) {
      throw new Error(`Gateway /ciphertext response missing ciphertext`);
    }

    console.log(`[KMS] ★ Fetched ciphertext from HTTP: ${response.data.ciphertext.length} chars`);
    return response.data.ciphertext;
  }

  async decrypt(handleHex: string, type = "uint32"): Promise<bigint> {
    console.log(`[KMS] decrypt() handleHex: ${handleHex.slice(0, 40)}... (${handleHex.length} chars)`);
    console.log(`[KMS]   x-fhish-relayer-secret: ${this.secret.slice(0, 4)}...`);

    let ciphertextHex: string;
    const cleanHex = handleHex.startsWith("0x") ? handleHex : `0x${handleHex}`;

    if (cleanHex.length === 66) {
      console.log(`[KMS] Length=66 → treating as keccak256 handle, fetching ciphertext from gateway...`);
      ciphertextHex = await this.fetchCiphertext(cleanHex);
    } else {
      console.log(`[KMS] Length=${cleanHex.length} → treating as raw ciphertext hex`);
      ciphertextHex = cleanHex;
    }

    console.log(`[KMS] POST /decrypt type=${type}`);
    console.log(`[KMS]   ciphertext: ${ciphertextHex.slice(0, 40)}... (${ciphertextHex.length} chars)`);

    try {
      const response = await this.http.post(
        "/decrypt",
        { ciphertext: ciphertextHex, type },
        {
          headers: {
            "Content-Type": "application/json",
            "x-fhish-relayer-secret": this.secret,
          },
        }
      );

      console.log(`[KMS] Response status: ${response.status}`);

      if (!response.data?.plaintext) {
        throw new Error(`KMS response missing plaintext: ${JSON.stringify(response.data)}`);
      }

      const result = BigInt(response.data.plaintext);
      console.log(`[KMS] ★ Decrypted: ${result}`);
      return result;
    } catch (err: any) {
      console.error(`[KMS] ❌ Request failed:`);
      console.error(`[KMS]   status: ${err.response?.status}`);
      console.error(`[KMS]   data: ${JSON.stringify(err.response?.data)}`);
      console.error(`[KMS]   message: ${err.message}`);
      throw err;
    }
  }
}
