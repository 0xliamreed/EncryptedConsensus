import { FhevmType } from "@fhevm/hardhat-plugin";
import { task } from "hardhat/config";
import type { TaskArguments } from "hardhat/types";

task("task:prediction-address", "Prints the EncryptedPrediction address").setAction(async function (
  _taskArguments: TaskArguments,
  hre,
) {
  const { deployments } = hre;

  const deployment = await deployments.get("EncryptedPrediction");

  console.log("EncryptedPrediction address is " + deployment.address);
});

task("task:create-prediction", "Create a new encrypted prediction")
  .addParam("title", "Title of the prediction")
  .addParam("options", "Comma separated list of options (2 to 4 entries)")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments } = hre;

    const optionList = (taskArguments.options as string)
      .split(",")
      .map((entry: string) => entry.trim())
      .filter((entry: string) => entry.length > 0);

    if (optionList.length < 2 || optionList.length > 4) {
      throw new Error("You must pass between 2 and 4 options");
    }

    const deployment = await deployments.get("EncryptedPrediction");
    console.log(`EncryptedPrediction: ${deployment.address}`);

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("EncryptedPrediction", deployment.address);

    const tx = await contract.connect(signer).createPrediction(taskArguments.title, optionList);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`Created prediction with id ${receipt?.logs[0]?.topics[1] ?? "unknown"} status=${receipt?.status}`);
  });

task("task:vote", "Cast an encrypted vote for a prediction")
  .addParam("id", "Prediction id")
  .addParam("choice", "Option index to vote for")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const predictionId = parseInt(taskArguments.id);
    const choice = parseInt(taskArguments.choice);

    if (!Number.isInteger(predictionId) || !Number.isInteger(choice)) {
      throw new Error("Both id and choice must be integers");
    }

    const deployment = await deployments.get("EncryptedPrediction");
    console.log(`EncryptedPrediction: ${deployment.address}`);

    const [signer] = await ethers.getSigners();
    const contract = await ethers.getContractAt("EncryptedPrediction", deployment.address);

    const encryptedChoice = await fhevm.createEncryptedInput(deployment.address, signer.address).add32(choice).encrypt();

    const tx = await contract
      .connect(signer)
      .submitVote(predictionId, encryptedChoice.handles[0], encryptedChoice.inputProof);
    console.log(`Wait for tx:${tx.hash}...`);
    const receipt = await tx.wait();
    console.log(`Vote submitted status=${receipt?.status}`);
  });

task("task:decrypt-results", "Decrypts the encrypted counts for a prediction")
  .addParam("id", "Prediction id")
  .setAction(async function (taskArguments: TaskArguments, hre) {
    const { ethers, deployments, fhevm } = hre;

    await fhevm.initializeCLIApi();

    const predictionId = parseInt(taskArguments.id);
    if (!Number.isInteger(predictionId)) {
      throw new Error("Argument --id is not an integer");
    }

    const deployment = await deployments.get("EncryptedPrediction");
    console.log(`EncryptedPrediction: ${deployment.address}`);

    const contract = await ethers.getContractAt("EncryptedPrediction", deployment.address);

    const [, options, encryptedCounts] = await contract.getPrediction(predictionId);
    console.log(`Prediction ${predictionId} with ${options.length} options`);

    const clearCounts: number[] = [];
    for (let i = 0; i < encryptedCounts.length; i++) {
      const clearValue = await fhevm.publicDecryptEuint(FhevmType.euint32, encryptedCounts[i]);
      clearCounts.push(clearValue);
    }

    options.forEach((label: string, idx: number) => {
      console.log(`${idx}. ${label} => ${clearCounts[idx] ?? 0}`);
    });
  });
