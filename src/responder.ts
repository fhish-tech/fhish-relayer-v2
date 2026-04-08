import { ethers } from "ethers";

export function createResponder(gateway: ethers.Contract, signer: ethers.Signer) {
  return async (decryptionId: bigint, results: bigint[], skipVerify = false) => {
    const abiCoder = new ethers.AbiCoder();
    const types = results.map(() => "uint256");
    const encodedResult = abiCoder.encode(types, results);

    const messageHash = ethers.solidityPackedKeccak256(
      ["uint256", "bytes"],
      [decryptionId, encodedResult]
    );
    const signature = await signer.signMessage(ethers.getBytes(messageHash));

    const gasLimit = 500000n + BigInt(results.length) * 50000n;

    try {
      const tx = skipVerify
        ? await (gateway as any).fulfillPublicDecryptionNoVerify(decryptionId, encodedResult, { gasLimit })
        : await gateway.fulfillPublicDecryption(decryptionId, encodedResult, [signature], { gasLimit });

      console.log(`[Responder] Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      console.log(`[Responder] Confirmed in block ${receipt.blockNumber}, status=${receipt.status}`);
    } catch (err: any) {
      const reason = err.reason || err.message || "unknown";
      console.error(`[Responder] Fulfillment failed for ID=${decryptionId}: ${reason}`);
      throw err;
    }
  };
}
