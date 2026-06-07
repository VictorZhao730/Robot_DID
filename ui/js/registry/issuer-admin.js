function getSelectedIssuerRoleCredentialTypes() {
  return [...document.querySelectorAll('input[name="issuerRoleCredentialTypes"]:checked')].map(
    (input) => input.value
  );
}

function buildIssuerProfileMetadata() {
  const name = document.getElementById("issuerProfileName").value.trim();
  if (!name) {
    throw new Error("Issuer name is required");
  }
  const type = document.getElementById("issuerProfileType").value.trim();
  const remark = document.getElementById("issuerProfileRemark").value.trim();
  return JSON.stringify({
    name,
    ...(type ? { type } : {}),
    ...(remark ? { remark } : {}),
  });
}

async function checkIssuerRole() {
  const account = ethers.getAddress(
    document.getElementById("issuerRoleAddress").value.trim()
  );
  const credentialTypes = getSelectedIssuerRoleCredentialTypes();
  if (credentialTypes.length === 0) {
    throw new Error("Select at least one credential type");
  }
  const issuerRegistry = await getIssuerRegistryContract();
  const issuerRecord = await issuerRegistry.getIssuer(account);
  const issuerProfile = formatIssuerProfile(issuerRecord);
  const roleChecks = await Promise.all(
    credentialTypes.map(async (credentialType) => ({
      credentialType,
      role: await issuerRegistry.roleForCredentialType(credentialType),
      hasIssuerRole: await issuerRegistry.isAuthorizedIssuer(credentialType, account),
    }))
  );

  return {
    account,
    issuerDID: didFromAddress(account),
    credentialTypes,
    roleChecks,
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    issuerDIDActive: issuerProfile.active,
    issuerProfile,
    issuerMetadataURI: issuerRecord.metadataURI,
  };
}

async function grantIssuerRole() {
  const account = ethers.getAddress(
    document.getElementById("issuerRoleAddress").value.trim()
  );
  const credentialTypes = getSelectedIssuerRoleCredentialTypes();
  if (credentialTypes.length === 0) {
    throw new Error("Select at least one credential type");
  }
  const signer = await connectAdminWallet();
  await assertIssuerRegistryAdmin(signer);
  const issuerRegistry = await getIssuerRegistryContract(signer);
  const grants = [];

  for (const credentialType of credentialTypes) {
    const role = await issuerRegistry.roleForCredentialType(credentialType);
    const tx = await issuerRegistry.grantRole(role, account);
    const receipt = await tx.wait();
    grants.push({
      credentialType,
      role,
      transactionHash: receipt.hash,
    });
  }

  return {
    result: grants.length === 1 ? "Issuer role granted" : "Issuer roles granted",
    account,
    grants,
    issuerRegistryAddress: await issuerRegistry.getAddress(),
  };
}

async function registerIssuerDid() {
  const account = ethers.getAddress(
    document.getElementById("issuerRoleAddress").value.trim()
  );
  const issuerMetadata = buildIssuerProfileMetadata();
  const signer = await connectAdminWallet();
  await assertIssuerRegistryAdmin(signer);
  const issuerRegistry = await getIssuerRegistryContract(signer);
  const tx = await issuerRegistry.registerIssuer(account, issuerMetadata);
  const receipt = await tx.wait();

  return {
    result: "Issuer DID registered as active",
    account,
    issuerDID: didFromAddress(account),
    issuerProfile: formatIssuerProfile({
      active: true,
      metadataURI: issuerMetadata,
      updatedAt: receipt.blockNumber,
    }),
    issuerMetadataURI: issuerMetadata,
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    transactionHash: receipt.hash,
  };
}

async function revokeIssuerDid() {
  const account = ethers.getAddress(
    document.getElementById("issuerRoleAddress").value.trim()
  );
  const signer = await connectAdminWallet();
  await assertIssuerRegistryAdmin(signer);
  const issuerRegistry = await getIssuerRegistryContract(signer);
  const tx = await issuerRegistry.revokeIssuer(account);
  const receipt = await tx.wait();

  return {
    result: "Issuer DID revoked",
    account,
    issuerDID: didFromAddress(account),
    issuerRegistryAddress: await issuerRegistry.getAddress(),
    transactionHash: receipt.hash,
  };
}
