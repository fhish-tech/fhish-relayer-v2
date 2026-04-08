import { ethers } from "ethers";
import { RelayerEngine } from "./compute";

export async function startListener(
  gateway: ethers.Contract,
  engine: RelayerEngine,
  responder: (id: bigint, results: bigint[]) => Promise<void>
) {
  console.log("[Listener] Starting FHISH Relayer Listener (Robust Polling)...");

  let lastBlock = await gateway.runner?.provider?.getBlockNumber();
  if (!lastBlock) lastBlock = 0;

  console.log(`[Listener] Watching for events from block ${lastBlock}...`);

  setInterval(async () => {
    try {
      const currentBlock = await gateway.runner?.provider?.getBlockNumber();
      if (!currentBlock || currentBlock <= lastBlock!) return;

      console.log(`[Listener] Checking blocks ${lastBlock! + 1} → ${currentBlock}...`);

      const filter = gateway.filters.PublicDecryptionRequest();
      const events = await gateway.queryFilter(filter, lastBlock! + 1, currentBlock);

      if (events.length === 0) {
        console.log(`[Listener] No events in blocks ${lastBlock! + 1}–${currentBlock}`);
      }

      for (const event of events) {
        if (!("args" in event)) {
          console.warn("[Listener] Event has no args, skipping");
          continue;
        }

        const { decryptionId, ctHandles, extraData } = event.args as any;
        const txHash = event.transactionHash;
        const blockNum = event.blockNumber;

        console.log(`╔══════════════════════════════════════════════╗`);
        console.log(`║         NEW DECRYPTION REQUEST ★          ║`);
        console.log(`║  decryptionId: ${String(decryptionId).padEnd(30)}║`);
        console.log(`║  txHash:       ${txHash?.slice(0, 30).padEnd(30)}║`);
        console.log(`║  block:        ${String(blockNum).padEnd(30)}║`);
        console.log(`║  ctHandles:   ${ctHandles?.length ?? 0} handle(s)${" ".repeat(Math.max(0, 30 - String(ctHandles?.length ?? 0).length))}║`);
        console.log(`╚══════════════════════════════════════════════╝`);

        if (ctHandles && ctHandles.length > 0) {
          for (let h = 0; h < ctHandles.length; h++) {
            console.log(`[Listener] Handle[${h}]: ${ctHandles[h]}`);
          }
        }
        if (extraData && extraData !== "0x") {
          console.log(`[Listener] extraData: ${extraData}`);
        }

        console.log("[Listener] Calling engine.compute()...");
        const handlesToDecrypt = (ctHandles || []).map((h: string) => {
          console.log(`[Listener] Converting handle to bytes: ${h.slice(0, 20)}...`);
          return ethers.getBytes(h);
        });

        const decrypted = await engine.compute(handlesToDecrypt);
        console.log(`[Listener] engine.compute() returned: [${decrypted.join(", ")}]`);

        console.log(`[Listener] Calling responder for decryptionId=${decryptionId}...`);
        await responder(decryptionId, decrypted);
        console.log(`[Listener] ★ Responder completed for decryptionId=${decryptionId}`);
      }

      lastBlock = currentBlock;
    } catch (err: any) {
      console.error(`[Listener] ❌ Error: ${err.message}`);
      console.error(`[Listener] Stack:`, err.stack);
      console.error("[Listener] Will retry on next poll...");
    }
  }, 5000);
}
