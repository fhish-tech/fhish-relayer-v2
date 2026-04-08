import axios, { AxiosInstance } from "axios";

export class KMSClient {
  private readonly http: AxiosInstance;
  private readonly secret: string;
  private readonly gatewayUrl: string;

  constructor(gatewayUrl: string) {
    this.gatewayUrl = gatewayUrl;
    this.secret = process.env.FHISH_RELAYER_SECRET || "fhish-default-secret";
    console.log(`[KMS] Initialized for gateway: ${gatewayUrl}`);
    console.log(`[KMS] Using secret: ${this.secret === "fhish-default-secret" ? "DEFAULT (⚠️ change in production!)" : "CUSTOM ✓"}`);

    this.http = axios.create({
      baseURL: gatewayUrl,
      timeout: 30000,
    });
  }

  async decrypt(ciphertextHex: string, type = "uint32"): Promise<bigint> {
    console.log(`[KMS] POST /decrypt type=${type}`);
    console.log(`[KMS]   ciphertext: ${ciphertextHex.slice(0, 40)}... (${ciphertextHex.length} chars)`);
    console.log(`[KMS]   x-fhish-relayer-secret: ${this.secret.slice(0, 4)}...`);

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
      console.log(`[KMS] Response data:`, JSON.stringify(response.data));

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
