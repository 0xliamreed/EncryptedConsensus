import { FhevmType } from "@fhevm/hardhat-plugin";
import { HardhatEthersSigner } from "@nomicfoundation/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, fhevm } from "hardhat";
import { EncryptedPrediction, EncryptedPrediction__factory } from "../types";

type Signers = {
  deployer: HardhatEthersSigner;
  alice: HardhatEthersSigner;
  bob: HardhatEthersSigner;
};

async function deployFixture() {
  const factory = (await ethers.getContractFactory("EncryptedPrediction")) as EncryptedPrediction__factory;
  const contract = (await factory.deploy()) as EncryptedPrediction;
  const contractAddress = await contract.getAddress();

  return { contract, contractAddress };
}

describe("EncryptedPrediction", function () {
  let signers: Signers;
  let contract: EncryptedPrediction;
  let contractAddress: string;

  before(async function () {
    const ethSigners: HardhatEthersSigner[] = await ethers.getSigners();
    signers = { deployer: ethSigners[0], alice: ethSigners[1], bob: ethSigners[2] };
  });

  beforeEach(async function () {
    if (!fhevm.isMock) {
      console.warn(`This hardhat test suite cannot run on Sepolia Testnet`);
      this.skip();
    }

    ({ contract, contractAddress } = await deployFixture());
  });

  it("requires between 2 and 4 options", async function () {
    await expect(contract.createPrediction("Invalid", ["OnlyOne"])).to.be.revertedWithCustomError(
      contract,
      "InvalidOptionCount",
    );

    await expect(contract.createPrediction("Too many", ["a", "b", "c", "d", "e"])).to.be.revertedWithCustomError(
      contract,
      "InvalidOptionCount",
    );
  });

  it("allows encrypted voting and exposes public results after closing", async function () {
    await contract.createPrediction("Match winner", ["Team A", "Team B"]);

    const voteAlice = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add32(0).encrypt();
    await contract.connect(signers.alice).submitVote(0, voteAlice.handles[0], voteAlice.inputProof);
    expect(await contract.hasUserVoted(0, signers.alice.address)).to.eq(true);

    const voteBob = await fhevm.createEncryptedInput(contractAddress, signers.bob.address).add32(1).encrypt();
    await contract.connect(signers.bob).submitVote(0, voteBob.handles[0], voteBob.inputProof);

    await expect(
      contract.connect(signers.alice).submitVote(0, voteAlice.handles[0], voteAlice.inputProof),
    ).to.be.revertedWithCustomError(contract, "AlreadyVoted");

    await contract.closePrediction(0);

    const prediction = await contract.getPrediction(0);
    expect(prediction.isActive).to.eq(false);
    expect(prediction.resultsArePublic).to.eq(true);

    const decryptedA = await fhevm.publicDecryptEuint(FhevmType.euint32, prediction.encryptedCounts[0]);
    const decryptedB = await fhevm.publicDecryptEuint(FhevmType.euint32, prediction.encryptedCounts[1]);

    expect(decryptedA).to.eq(1);
    expect(decryptedB).to.eq(1);
  });

  it("blocks voting once a prediction is closed", async function () {
    await contract.createPrediction("Rain tomorrow", ["Yes", "No"]);
    await contract.closePrediction(0);

    const encryptedVote = await fhevm.createEncryptedInput(contractAddress, signers.alice.address).add32(0).encrypt();
    await expect(
      contract.connect(signers.alice).submitVote(0, encryptedVote.handles[0], encryptedVote.inputProof),
    ).to.be.revertedWithCustomError(contract, "PredictionAlreadyClosed");
  });
});
