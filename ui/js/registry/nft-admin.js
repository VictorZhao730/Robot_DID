async function getRobotNftWithSigner() {
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  const signer = await connectAdminWallet();
  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const robotNFTAddress = await registry.robotIdentityNFT();

  return new ethers.Contract(robotNFTAddress, robotNftAbi, signer);
}

async function checkMinterRole() {
  const account = ethers.getAddress(
    document.getElementById("minterRoleAddress").value.trim()
  );
  const robotNFT = await getRobotNftWithSigner();
  const minterRole = await robotNFT.MINTER_ROLE();

  return {
    account,
    robotNFTAddress: await robotNFT.getAddress(),
    minterRole,
    hasMinterRole: await robotNFT.hasRole(minterRole, account),
  };
}

async function grantMinterRole() {
  const account = ethers.getAddress(
    document.getElementById("minterRoleAddress").value.trim()
  );
  const robotNFT = await getRobotNftWithSigner();
  const minterRole = await robotNFT.MINTER_ROLE();
  const tx = await robotNFT.grantRole(minterRole, account);
  const receipt = await tx.wait();

  return {
    result: "MINTER_ROLE granted",
    account,
    robotNFTAddress: await robotNFT.getAddress(),
    transactionHash: receipt.hash,
  };
}

async function revokeMinterRole() {
  const account = ethers.getAddress(
    document.getElementById("minterRoleAddress").value.trim()
  );
  const robotNFT = await getRobotNftWithSigner();
  const minterRole = await robotNFT.MINTER_ROLE();

  if (!(await robotNFT.hasRole(minterRole, account))) {
    throw new Error("Address does not have MINTER_ROLE");
  }

  const tx = await robotNFT.revokeRole(minterRole, account);
  const receipt = await tx.wait();

  return {
    result: "MINTER_ROLE revoked",
    account,
    robotNFTAddress: await robotNFT.getAddress(),
    hasMinterRole: await robotNFT.hasRole(minterRole, account),
    transactionHash: receipt.hash,
    note: "Existing robot NFTs and DID management are unchanged; address can no longer mint new NFTs.",
  };
}

async function getRobotNftContract(signer) {
  const registryAddress =
    document.getElementById("registryAddress").value || demoValues.registryAddress;
  if (!registryAddress) {
    throw new Error("Registry address is required");
  }

  const registry = new ethers.Contract(registryAddress, registryAbi, signer);
  const robotNFTAddress = await registry.robotIdentityNFT();
  return new ethers.Contract(robotNFTAddress, robotNftAbi, signer);
}

async function accountHasMinterRole(signer) {
  const robotNFT = await getRobotNftContract(signer);
  const minterRole = await robotNFT.MINTER_ROLE();
  const address = await signer.getAddress();
  return robotNFT.hasRole(minterRole, address);
}
