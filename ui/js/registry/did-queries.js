async function getRegistryRecord() {
  const registry = getRegistryContract();
  const did = document.getElementById("did").value;
  const exists = await registry.didExists(did);
  const active = await registry.isActive(did);

  if (!exists) {
    throw new Error("DID does not exist");
  }

  const [record, controllers] = await Promise.all([
    registry.getDID(did),
    registry.getControllers(did),
  ]);
  const robotNftAddress = await registry.robotIdentityNFT();
  const controllerDetails = await Promise.all(
    controllers.map(async (controller) => ({
      controller,
      did: didFromAddress(controller),
      permissions: (
        await registry.getControllerPermissions(did, controller)
      ).toString(),
    }))
  );
  return {
    did,
    owner: record.owner,
    controllers,
    controllerDetails,
    publicKey: record.publicKey,
    metadataURI: record.metadataURI,
    robotTokenId: record.robotTokenId,
    robotNftAddress,
    active,
    suspended: record.suspended,
    suspendedAt: record.suspendedAt.toString(),
    revoked: !active,
    createdAt: record.createdAt.toString(),
    updatedAt: record.updatedAt.toString(),
  };
}

async function lookupAndRenderDid(did) {
  document.getElementById("did").value = did;
  const record = await getRegistryRecord();
  const didDocument = buildDidDocument(record.did, record);
  const didResolution = buildDidResolution(record.did, record);

  lastRecord = record;
  lastDidDocument = didDocument;
  setPanelOutput("registryPanel", "registryOutput", record);
  setPanelOutput(
    "didDocumentPanel",
    "didDocumentOutput",
    didResolution
  );

  return { record, didDocument, didResolution };
}

async function listRobots() {
  const registry = getRegistryContract();
  const nftAddress = await registry.robotIdentityNFT();
  const robotNFT = new ethers.Contract(nftAddress, robotNftAbi, registry.runner);
  const latestBlock = await registry.runner.provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 99999);
  const events = await robotNFT.queryFilter(
    robotNFT.filters.RobotMinted(),
    fromBlock,
    latestBlock
  );

  const robots = await Promise.all(
    events.map(async (event) => {
      const tokenId = event.args.tokenId;
      const [owner, tokenURI, activeDID] = await Promise.all([
        robotNFT.ownerOf(tokenId),
        robotNFT.tokenURI(tokenId),
        registry.activeDIDForRobotToken(tokenId),
      ]);

      let metadata = tokenURI;
      try {
        metadata = JSON.parse(tokenURI);
      } catch (_error) {
        // Keep non-JSON metadata as a plain string.
      }

      return {
        tokenId: tokenId.toString(),
        owner,
        activeDID: activeDID || null,
        robotNftAddress: nftAddress,
        metadata,
        mintTransaction: event.transactionHash,
      };
    })
  );

  return {
    robotNFTAddress: nftAddress,
    searchedBlocks: {
      fromBlock,
      toBlock: latestBlock,
    },
    totalRobots: robots.length,
    robots,
  };
}

async function getBlockTimestamp(provider, blockNumber, cache) {
  if (!cache.has(blockNumber)) {
    const block = await provider.getBlock(blockNumber);
    cache.set(blockNumber, new Date(Number(block.timestamp) * 1000).toISOString());
  }

  return cache.get(blockNumber);
}

async function getSelectedRobotTimeline() {
  if (!selectedRobot) {
    throw new Error("Click a robot NFT avatar first");
  }

  const registry = getRegistryContract();
  const nftAddress = await registry.robotIdentityNFT();
  const robotNFT = new ethers.Contract(nftAddress, robotNftAbi, registry.runner);
  const provider = registry.runner.provider;
  const latestBlock = await provider.getBlockNumber();
  const fromBlock = Math.max(0, latestBlock - 99999);
  const tokenId = BigInt(selectedRobot.tokenId);
  const events = [];

  const pushEvent = (event, type, details) => {
    events.push({
      type,
      blockNumber: event.blockNumber,
      transactionHash: event.transactionHash,
      logIndex: event.index ?? event.logIndex ?? 0,
      ...details,
    });
  };

  const mintedEvents = await robotNFT.queryFilter(
    robotNFT.filters.RobotMinted(tokenId),
    fromBlock,
    latestBlock
  );
  for (const event of mintedEvents) {
    pushEvent(event, "RobotMinted", {
      tokenId: event.args.tokenId.toString(),
      owner: event.args.owner,
    });
  }

  const transferEvents = await robotNFT.queryFilter(
    robotNFT.filters.Transfer(null, null, tokenId),
    fromBlock,
    latestBlock
  );
  for (const event of transferEvents) {
    if (event.args.from === ethers.ZeroAddress) {
      continue;
    }
    pushEvent(event, "NFTTransferred", {
      tokenId: event.args.tokenId.toString(),
      from: event.args.from,
      to: event.args.to,
    });
  }

  const dids = new Set();
  const activeDidOnChain = await registry.activeDIDForRobotToken(tokenId);
  if (typeof activeDidOnChain === "string" && activeDidOnChain.length > 0) {
    dids.add(activeDidOnChain);
  }
  if (selectedRobot.activeDID) {
    dids.add(selectedRobot.activeDID);
  }

  const registeredEvents = await registry.queryFilter(
    registry.filters.DIDRegistered(null, null, tokenId),
    fromBlock,
    latestBlock
  );
  for (const event of registeredEvents) {
    const did = await registry.robotDidForToken(event.args.robotTokenId);
    if (did) {
      dids.add(did);
    }
    pushEvent(event, "DIDRegistered", {
      did: did || selectedRobot.activeDID || "(unknown DID)",
      owner: event.args.owner,
      tokenId: event.args.robotTokenId.toString(),
    });
  }

  for (const did of dids) {
    const [
      keyEvents,
      didSuspendedEvents,
      didUnsuspendedEvents,
      didRevokedEvents,
      credentialRevokedEvents,
      controllerAddedEvents,
      controllerPermissionsUpdatedEvents,
      controllerRemovedEvents,
    ] = await Promise.all([
      registry.queryFilter(registry.filters.RobotKeyRotated(did), fromBlock, latestBlock),
      registry.queryFilter(registry.filters.DIDSuspended(did), fromBlock, latestBlock),
      registry.queryFilter(registry.filters.DIDUnsuspended(did), fromBlock, latestBlock),
      registry.queryFilter(registry.filters.DIDRevoked(did), fromBlock, latestBlock),
      registry.queryFilter(registry.filters.CredentialRevoked(did), fromBlock, latestBlock),
      registry.queryFilter(registry.filters.ControllerAdded(did), fromBlock, latestBlock),
      registry.queryFilter(
        registry.filters.ControllerPermissionsUpdated(did),
        fromBlock,
        latestBlock
      ),
      registry.queryFilter(registry.filters.ControllerRemoved(did), fromBlock, latestBlock),
    ]);

    for (const event of keyEvents) {
      pushEvent(event, "RobotKeyRotated", {
        did,
        oldKeyAddress: event.args.oldKeyAddress,
        newKeyAddress: event.args.newKeyAddress,
        newPublicKey: event.args.newPublicKey,
      });
    }
    for (const event of didSuspendedEvents) {
      pushEvent(event, "DIDSuspended", { did });
    }
    for (const event of didUnsuspendedEvents) {
      pushEvent(event, "DIDUnsuspended", { did });
    }
    for (const event of didRevokedEvents) {
      pushEvent(event, "DIDRevoked", { did });
    }
    for (const event of credentialRevokedEvents) {
      pushEvent(event, "CredentialRevoked", {
        did,
        credentialHash: event.args.credentialHash,
      });
    }
    for (const event of controllerAddedEvents) {
      pushEvent(event, "ControllerAdded", {
        did,
        controller: event.args.controller,
        permissions: event.args.permissions.toString(),
      });
    }
    for (const event of controllerPermissionsUpdatedEvents) {
      pushEvent(event, "ControllerPermissionsUpdated", {
        did,
        controller: event.args.controller,
        permissions: event.args.permissions.toString(),
      });
    }
    for (const event of controllerRemovedEvents) {
      pushEvent(event, "ControllerRemoved", {
        did,
        controller: event.args.controller,
      });
    }
  }

  events.sort(
    (a, b) => a.blockNumber - b.blockNumber || Number(a.logIndex) - Number(b.logIndex)
  );

  const blockTimestampCache = new Map();
  const timeline = await Promise.all(
    events.map(async (event) => ({
      ...event,
      timestamp: await getBlockTimestamp(provider, event.blockNumber, blockTimestampCache),
    }))
  );

  return {
    robotTokenId: selectedRobot.tokenId,
    activeDID: selectedRobot.activeDID,
    searchedBlocks: {
      fromBlock,
      toBlock: latestBlock,
    },
    eventCount: timeline.length,
    timeline,
  };
}

