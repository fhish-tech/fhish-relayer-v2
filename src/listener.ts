import { ethers } from "ethers";
import { RelayerEngine } from "./compute";

export async function startListener(
  gateway: ethers.Contract,
  engine: RelayerEngine,
  responder: (id: bigint, results: bigint[]) => Promise<void>
) {
  console.log("Starting FHISH Relayer Listener (Robust Polling)...");

  let lastBlock = await gateway.runner?.provider?.getBlockNumber();
  if (!lastBlock) lastBlock = 0;

  console.log(`Watching for events from block ${lastBlock}...`);

  setInterval(async () => {
    try {
      const currentBlock = await gateway.runner?.provider?.getBlockNumber();
      if (!currentBlock || currentBlock <= lastBlock!) return;

      console.log(`Checking blocks ${lastBlock! + 1} to ${currentBlock}...`);
      
      const filter = gateway.filters.PublicDecryptionRequest();
      const events = await gateway.queryFilter(filter, lastBlock! + 1, currentBlock);

      for (const event of events) {
        if ("args" in event) {
          const { decryptionId, ctHandles, extraData } = event.args as any;
          console.log(`\n[RelayerListener] MATCH - Decryption ID: ${decryptionId}`);
          console.log(`[RelayerListener] Handles to compute: ${ctHandles}`);

          const decrypted = await engine.compute(ctHandles.map((h: string) => {
            console.log(`[RelayerListener] Preparing handle: ${h}`);
            return ethers.getBytes(h);
          }));
          console.log(`[RelayerListener] Computation result: ${decrypted}`);

          await responder(decryptionId, decrypted);
        }
      }

      lastBlock = currentBlock;
    } catch (err) {
      console.error("Listener Error (retrying...):", err);
    }
  }, 5000); // Poll every 5 seconds
}
