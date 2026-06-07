function getCreateRobotWallet() {
  const privateKey = document.getElementById("generatedRobotPrivateKey").value.trim();
  if (!privateKey) {
    throw new Error("Enter robot private key or click Generate Robot Wallet first");
  }

  const wallet = new ethers.Wallet(privateKey);
  const address = ethers.getAddress(wallet.address);
  const inputAddress = document.getElementById("generatedRobotAddress").value.trim();
  const inputDid = document.getElementById("generatedRobotDid").value.trim();
  const did =
    selectedRobot?.activeDID ||
    (selectedRobot?.tokenId ? didFromRobotTokenId(selectedRobot.tokenId) : "");

  if (inputAddress && ethers.getAddress(inputAddress) !== address) {
    throw new Error("Generated robot address does not match private key");
  }

  if (inputDid && did && inputDid.toLowerCase() !== did.toLowerCase()) {
    throw new Error("Generated robot DID does not match selected robot");
  }

  document.getElementById("generatedRobotAddress").value = address;
  document.getElementById("generatedRobotDid").value =
    did || "Assigned after NFT registration (did:uzheth:robot:<tokenId>)";
  if (did) {
    document.getElementById("did").value = did;
  }
  generatedRobotWallet = wallet;

  return { wallet, address, did: did || null, robotKeyAddress: address };
}

function getRegistryContract() {
  const registryAddress = document.getElementById("registryAddress").value.trim();
  if (!registryAddress) {
    throw new Error("RobotDIDRegistry address is required");
  }

  const provider = new ethers.JsonRpcProvider(document.getElementById("rpcUrl").value);
  return new ethers.Contract(registryAddress, registryAbi, provider);
}

async function getIssuerRegistryContract(signerOrProvider) {
  const registry = getRegistryContract();
  const issuerRegistryAddress = await registry.credentialIssuerRegistry();
  const runner = signerOrProvider || registry.runner;

  return new ethers.Contract(issuerRegistryAddress, issuerRegistryAbi, runner);
}

async function getIssuerRegistryAdminRole(issuerRegistry) {
  try {
    return await issuerRegistry.DEFAULT_ADMIN_ROLE();
  } catch (_error) {
    return ethers.ZeroHash;
  }
}

async function assertIssuerRegistryAdmin(signer) {
  const connectedAddress = await signer.getAddress();
  const issuerRegistry = await getIssuerRegistryContract(signer);
  const adminRole = await getIssuerRegistryAdminRole(issuerRegistry);
  const hasAdmin = await issuerRegistry.hasRole(adminRole, connectedAddress);
  if (!hasAdmin) {
    throw new Error(
      `MetaMask account ${connectedAddress} lacks DEFAULT_ADMIN_ROLE on CredentialIssuerRegistry (${await issuerRegistry.getAddress()}). ` +
        "Switch to the contract deployer, or ask the deployer to grant DEFAULT_ADMIN_ROLE in Setup → Issuer Registry Admin."
    );
  }
}

async function checkIssuerRegistryAdmin() {
  const account = ethers.getAddress(
    document.getElementById("issuerRegistryAdminAddress").value.trim()
  );
  const issuerRegistry = await getIssuerRegistryContract();
  const adminRole = await getIssuerRegistryAdminRole(issuerRegistry);

  return {
    account,
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    adminRole,
    hasIssuerRegistryAdmin: await issuerRegistry.hasRole(adminRole, account),
  };
}

async function grantIssuerRegistryAdmin() {
  const account = ethers.getAddress(
    document.getElementById("issuerRegistryAdminAddress").value.trim()
  );
  const signer = await connectAdminWallet();
  await assertIssuerRegistryAdmin(signer);
  const issuerRegistry = await getIssuerRegistryContract(signer);
  const adminRole = await getIssuerRegistryAdminRole(issuerRegistry);
  const tx = await issuerRegistry.grantRole(adminRole, account);
  const receipt = await tx.wait();

  return {
    result: "DEFAULT_ADMIN_ROLE granted on CredentialIssuerRegistry",
    account,
    adminRole,
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    transactionHash: receipt.hash,
  };
}

async function connectPrivateKeyWallet(privateKey) {
  if (!window.ethereum) {
    throw new Error("MetaMask is required for private-key gas payment");
  }

  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const network = await provider.getNetwork();

  if (Number(network.chainId) !== UZHETH_CHAIN_ID) {
    throw new Error(
      `Please switch MetaMask to UZHETH PoS chain ID ${UZHETH_CHAIN_ID}`
    );
  }

  return new ethers.Wallet(privateKey, provider);
}

async function connectAdminWallet() {
  if (!window.ethereum) {
    throw new Error("MetaMask is required for on-chain registration");
  }

  const browserProvider = new ethers.BrowserProvider(window.ethereum);
  await browserProvider.send("eth_requestAccounts", []);
  const network = await browserProvider.getNetwork();

  if (Number(network.chainId) !== UZHETH_CHAIN_ID) {
    throw new Error(
      `Please switch MetaMask to UZHETH PoS chain ID ${UZHETH_CHAIN_ID}`
    );
  }

  return browserProvider.getSigner();
}
