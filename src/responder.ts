import { ethers } from "ethers";

export function createResponder(gateway: ethers.Contract, signer: ethers.Signer) {
  return async (decryptionId: bigint, results: bigint[], skipVerify = false) => {
    console.log(`[Responder] fulfillPublicDecryption id=${decryptionId}, results=[${results.join(", ")}]`);

    const abiCoder = new ethers.AbiCoder();
    const types = results.map(() => "uint256");
    const encodedResult = abiCoder.encode(types, results);
    console.log(`[Responder] Encoded result: ${encodedResult.slice(0, 60)}... (${encodedResult.length} chars)`);

    console.log(`[Responder] Signing message for decryptionId=${decryptionId}...`);
    const messageHash = ethers.solidityPackedKeccak256(
      ["uint256", "bytes"],
      [decryptionId, encodedResult]
    );
    console.log(`[Responder] Message hash: ${messageHash}`);
    const signature = await signer.signMessage(ethers.getBytes(messageHash));
    console.log(`[Responder] Signature: ${signature.slice(0, 20)}...`);

    const gasLimit = 500000n + BigInt(results.length) * 50000n;
    console.log(`[Responder] Gas limit: ${gasLimit}`);

    try {
      console.log(`[Responder] Submitting tx to gateway...`);
      const tx = skipVerify
        ? await (gateway as any).fulfillPublicDecryptionNoVerify(decryptionId, encodedResult, { gasLimit })
        : await gateway.fulfillPublicDecryption(decryptionId, encodedResult, [signature], { gasLimit });

      console.log(`[Responder] ★ Tx submitted: ${tx.hash}`);
      console.log(`[Responder] Waiting for confirmation...`);
      const receipt = await tx.wait();
      console.log(`[Responder] ✓ Confirmed in block ${receipt.blockNumber}, status=${receipt.status === 1 ? "SUCCESS" : "FAILED"}`);
      console.log(`[Responder] Gas used: ${receipt.gasUsed}`);

      if (receipt.status !== 1) {
        console.error(`[Responder] ❌ Tx reverted!`);
      }
    } catch (err: any) {
      const reason = err.reason || err.message || "unknown";
      const code = err.code || "";
      console.error(`[Responder] ❌ Fulfillment failed for ID=${decryptionId}:`);
      console.error(`[Responder]   reason: ${reason}`);
      console.error(`[Responder]   code: ${code}`);
      if (err.data) console.error(`[Responder]   data: ${err.data}`);
      throw err;
    }
  };
}
