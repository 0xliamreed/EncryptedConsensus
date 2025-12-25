import { DeployFunction } from "hardhat-deploy/types";
import { HardhatRuntimeEnvironment } from "hardhat/types";

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { deployer } = await hre.getNamedAccounts();
  const { deploy } = hre.deployments;

  const deployedContract = await deploy("EncryptedPrediction", {
    from: deployer,
    log: true,
  });

  console.log(`EncryptedPrediction contract: `, deployedContract.address);
};
export default func;
func.id = "deploy_encrypted_prediction"; // id required to prevent reexecution
func.tags = ["EncryptedPrediction"];
