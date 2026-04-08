import axios, { AxiosInstance } from "axios";

export class KMSClient {
  private readonly http: AxiosInstance;
  private readonly secret: string;

  constructor(gatewayUrl: string) {
    this.secret = process.env.FHISH_RELAYER_SECRET || "fhish-default-secret";
    this.http = axios.create({
      baseURL: gatewayUrl,
      timeout: 30000,
    });
  }

  async decrypt(ciphertextHex: string, type = "uint32"): Promise<bigint> {
    const response = await this.http.post("/decrypt", { ciphertext: ciphertextHex, type }, {
      headers: {
        "Content-Type": "application/json",
        "x-fhish-relayer-secret": this.secret,
      },
    });

    if (!response.data?.plaintext) {
      throw new Error(`KMS response missing plaintext: ${JSON.stringify(response.data)}`);
    }

    return BigInt(response.data.plaintext);
  }
}
