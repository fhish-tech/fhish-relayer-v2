import "dotenv/config";
import { ethers } from "ethers";
import express from "express";

const VOTING_ABI = [
  "event VoteCast(address indexed voter, bytes32 handleA, bytes32 handleB, uint256 voteId)",
  "function getVote(uint256 id) external view returns (address voter, bytes32 handleA, bytes32 handleB, uint256 timestamp)",
  "function getVoteCount() external view returns (uint256, uint256)",
  "function setDecryptedResult(uint32 resultA, uint32 resultB) external",
  "function admin() external view returns (address)"
] as const;

async function main() {
  const privateKey = process.env.PRIVATE_KEY!;
  const rpcUrl = process.env.RPC_URL!;
  const gatewayUrl = process.env.GATEWAY_URL || "http://localhost:8080";
  const votingAddress = process.env.VOTING_ADDRESS!;
  const gatewaySecret = process.env.FHISH_RELAYER_SECRET!;

  if (!privateKey || !rpcUrl || !votingAddress) {
    throw new Error("Missing required env vars: PRIVATE_KEY, RPC_URL, VOTING_ADDRESS");
  }

  console.log(`[RELAYER] Starting FHISH Relayer v2...`);
  console.log(`[RELAYER] Voting contract: ${votingAddress}`);
  console.log(`[RELAYER] Gateway URL: ${gatewayUrl}`);

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const voting = new ethers.Contract(votingAddress, VOTING_ABI, signer);

  const admin = await voting.admin();
  console.log(`[RELAYER] Contract admin: ${admin}`);
  console.log(`[RELAYER] Relayer address: ${signer.address}`);
  if (admin.toLowerCase() === signer.address.toLowerCase()) {
    console.log(`[RELAYER] ✓ Relayer is admin — can submit decryption results`);
  } else {
    console.log(`[RELAYER] ⚠ Relayer is NOT admin — cannot call setDecryptedResult`);
  }

  console.log(`[RELAYER] Testing gateway connectivity: ${gatewayUrl}/health...`);
  try {
    const res = await fetch(`${gatewayUrl}/health`);
    const data = await res.json() as { status: string; ready: boolean };
    console.log(`[RELAYER] Gateway health: ${data.status}, ready: ${data.ready}`);
    if (!data.ready) {
      console.warn(`[RELAYER] ⚠ Gateway not ready — decryption will fail`);
    }
  } catch (err: any) {
    console.error(`[RELAYER] ❌ Gateway unreachable: ${err.message}`);
  }

  const DECRYPTION_TYPES: Record<string, string> = {
    bool: "bool",
    uint8: "uint8", 
    uint16: "uint16",
    uint32: "uint32"
  };

  async function decryptHandle(handle: string): Promise<number> {
    console.log(`[RELAYER] Decrypting handle: ${handle}...`);
    
    const cleanHandle = handle.startsWith("0x") ? handle : `0x${handle}`;
    const handleHex = cleanHandle.toLowerCase();
    console.log(`[RELAYER] Fetching ciphertext for handle: ${handleHex}...`);

    const ctRes = await fetch(`${gatewayUrl}/ciphertext/${handleHex.slice(2)}`, {
      headers: { "x-fhish-relayer-secret": gatewaySecret }
    });

    if (!ctRes.ok) {
      const text = await ctRes.text();
      throw new Error(`Failed to fetch ciphertext: ${ctRes.status} ${text}`);
    }

    const ctData = await ctRes.json() as { ciphertext: string; length: number };
    console.log(`[RELAYER] Got ciphertext: ${ctData.length} bytes`);

    const decryptRes = await fetch(`${gatewayUrl}/decrypt`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-fhish-relayer-secret": gatewaySecret
      },
      body: JSON.stringify({ 
        ciphertext: ctData.ciphertext, 
        type: "uint32" 
      })
    });

    if (!decryptRes.ok) {
      const text = await decryptRes.text();
      throw new Error(`Decryption failed: ${decryptRes.status} ${text}`);
    }

    const result = await decryptRes.json() as { plaintext: string; type: string };
    console.log(`[RELAYER] Decrypted: ${result.plaintext} (${result.type})`);
    return parseInt(result.plaintext, 10);
  }

  let lastBlock = await provider.getBlockNumber();
  console.log(`[RELAYER] Watching VoteCast events from block ${lastBlock}...`);

  const app = express();
  app.get("/health", (_req, res) => {
    res.json({ status: "ok", relayer: signer.address, uptime: process.uptime() });
  });

  const healthPort = parseInt(process.env.HEALTH_PORT || "3001", 10);
  app.listen(healthPort, () => {
    console.log(`[RELAYER] Health server on port ${healthPort}`);
  });

  setInterval(async () => {
    try {
      const currentBlock = await provider.getBlockNumber();
      if (currentBlock <= lastBlock) return;

      console.log(`[RELAYER] Scanning blocks ${lastBlock + 1} → ${currentBlock}...`);

      const filter = voting.filters.VoteCast();
      const events = await voting.queryFilter(filter, lastBlock + 1, currentBlock);

      if (events.length === 0) {
        console.log(`[RELAYER] No new VoteCast events in this range`);
        lastBlock = currentBlock;
        return;
      }

      const pendingVotes: Array<{voter: string; handleA: string; handleB: string; voteId: bigint}> = [];

      for (const event of events) {
        if (!("args" in event)) continue;
        const { voter, handleA, handleB, voteId } = event.args as any;
        const txHash = event.transactionHash;
        console.log(`╔══════════════════════════════════════════════╗`);
        console.log(`║         NEW VOTE CAST ★                   ║`);
        console.log(`║  voter:    ${voter.slice(0, 26).padEnd(30)}║`);
        console.log(`║  handleA:  ${handleA.slice(0, 26).padEnd(30)}║`);
        console.log(`║  handleB:  ${handleB.slice(0, 26).padEnd(30)}║`);
        console.log(`║  voteId:   ${String(voteId).padEnd(30)}║`);
        console.log(`║  txHash:   ${txHash?.slice(0, 26).padEnd(30)}║`);
        console.log(`╚══════════════════════════════════════════════╝`);
        pendingVotes.push({ voter, handleA, handleB, voteId });
      }

      for (const vote of pendingVotes) {
        try {
          const values: number[] = [];
          
          if (vote.handleA !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            try {
              const valA = await decryptHandle(vote.handleA);
              values.push(valA);
              console.log(`[RELAYER] Vote[${vote.voteId}] handleA=${vote.handleA.slice(0,20)}... → ${valA} (→ counts as YES)`);
            } catch (err: any) {
              console.error(`[RELAYER] Failed to decrypt handleA: ${err.message}`);
            }
          }
          
          if (vote.handleB !== "0x0000000000000000000000000000000000000000000000000000000000000000") {
            try {
              const valB = await decryptHandle(vote.handleB);
              values.push(valB);
              console.log(`[RELAYER] Vote[${vote.voteId}] handleB=${vote.handleB.slice(0,20)}... → ${valB} (→ counts as NO)`);
            } catch (err: any) {
              console.error(`[RELAYER] Failed to decrypt handleB: ${err.message}`);
            }
          }

          if (values.length > 0) {
            console.log(`[RELAYER] Vote[${vote.voteId}] decrypted: [${values.join(", ")}]`);
          }
        } catch (err: any) {
          console.error(`[RELAYER] Error processing vote ${vote.voteId}: ${err.message}`);
        }
      }

      const totalVotes = pendingVotes.length;
      let yesVotes = 0;
      let noVotes = 0;
      for (const vote of pendingVotes) {
        if (vote.handleA !== "0x0000000000000000000000000000000000000000000000000000000000000000") yesVotes++;
        if (vote.handleB !== "0x0000000000000000000000000000000000000000000000000000000000000000") noVotes++;
      }
      console.log(`[RELAYER] Tally so far — YES: ${yesVotes}, NO: ${noVotes}, Total processed: ${totalVotes}`);

      const [currentCountA, currentCountB] = await voting.getVoteCount();
      console.log(`[RELAYER] On-chain counts — YES: ${currentCountA}, NO: ${currentCountB}`);

      const isAdmin = admin.toLowerCase() === signer.address.toLowerCase();
      if (isAdmin && totalVotes > 0) {
        console.log(`[RELAYER] Attempting to update on-chain results...`);
        try {
          const tx = await (voting.setDecryptedResult as any)(yesVotes, noVotes, { gasLimit: 500000 });
          await tx.wait();
          console.log(`[RELAYER] ★ setDecryptedResult(${yesVotes}, ${noVotes}) confirmed`);
        } catch (err: any) {
          console.error(`[RELAYER] setDecryptedResult failed: ${err.message}`);
        }
      }

      lastBlock = currentBlock;
    } catch (err: any) {
      console.error(`[RELAYER] Listener error: ${err.message}`);
    }
  }, 10000);

  console.log(`[RELAYER] ★ Relayer running — polling every 10s`);
}

main().catch((err) => {
  console.error("[RELAYER] FATAL:", err.message);
  process.exit(1);
});
