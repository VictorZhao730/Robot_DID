async function showPermissionMatrix() {
  if (!selectedRobot) {
    throw new Error("Click a robot NFT avatar first");
  }
  if (!selectedRobot.activeDID) {
    throw new Error("Selected robot has no active DID");
  }

  document.getElementById("did").value = selectedRobot.activeDID;
  const record = await getRegistryRecord();
  const rows = record.controllerDetails.map((entry) => {
    const isOwner =
      entry.controller.toLowerCase() === record.owner.toLowerCase();
    const permissions = Number(entry.permissions);
    return [
      entry.controller,
      hasControllerPermission(permissions, controllerPermissions.keyRotation),
      hasControllerPermission(permissions, controllerPermissions.credentialRevocation),
      hasControllerPermission(permissions, controllerPermissions.assertion),
      isOwner,
    ];
  });

  setQueryPanelOutput(
    "matrixPanel",
    {
      matrixType: "permission",
      title: "DID Controller Permission Matrix",
      subtitle: selectedRobot.activeDID,
      headers: [
        "owner address",
        "key rotation",
        "credential revocation",
        "assertion",
        "owner",
      ],
      rows,
    },
    { kind: "matrix" }
  );
}

function roleMatrixAddresses() {
  const addresses = document
    .getElementById("roleMatrixAddresses")
    .value.split(/[\s,]+/)
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => ethers.getAddress(value));
  const issuerRoleAddress = document.getElementById("issuerRoleAddress").value.trim();
  if (issuerRoleAddress) {
    addresses.push(ethers.getAddress(issuerRoleAddress));
  }

  return [...new Set(addresses)];
}

async function showRoleMatrix() {
  const addresses = roleMatrixAddresses();
  if (addresses.length === 0) {
    throw new Error("Enter at least one address for the role matrix");
  }

  const issuerRegistry = await getIssuerRegistryContract();
  const issuerRegistryAddress = await issuerRegistry.getAddress();
  const rows = await Promise.all(
    addresses.map(async (address) => {
      const issuerRecord = await issuerRegistry.getIssuer(address);
      const issuerProfile = formatIssuerProfile(issuerRecord);
      const roleCells = await Promise.all(
        roleMatrixCredentialTypes.map(async ({ credentialType }) =>
          issuerRegistry.isAuthorizedIssuer(credentialType, address)
        )
      );
      return [
        address,
        issuerProfile.name,
        issuerProfile.type,
        issuerProfile.remark || "—",
        issuerProfile.activeStatus,
        ...roleCells,
      ];
    })
  );

  setQueryPanelOutput(
    "matrixPanel",
    {
      matrixType: "role",
      title: "Issuer Role Matrix",
      subtitle: issuerRegistryAddress,
      headers: [
        "address",
        "name",
        "type",
        "remark",
        "status",
        ...roleMatrixCredentialTypes.map(({ label }) => label),
      ],
      rows,
    },
    { kind: "matrix" }
  );
}
