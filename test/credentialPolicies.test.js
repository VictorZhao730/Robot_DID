const { expect } = require("chai");
const {
  ISSUANCE_MODEL,
  detectIssuanceModel,
  getCredentialPolicy,
  isControllerDelegatedPolicy,
  isExternalIssuerSignedPolicy,
  isRobotSelfSignedPolicy,
  supportsIssuanceModel,
  verifyCredentialTypeAndSchema,
} = require("../lib/credentialPolicies");

describe("credentialPolicies", function () {
  it("treats sensor data as robot self-signed", function () {
    const policy = getCredentialPolicy("RobotSensorDataCredential");
    expect(isRobotSelfSignedPolicy(policy)).to.equal(true);
    expect(isControllerDelegatedPolicy(policy)).to.equal(false);
    expect(policy.description).to.include("sensor data");
  });

  it("treats maintenance as external issuer-signed", function () {
    const policy = getCredentialPolicy("RobotMaintenanceCredential");
    expect(isExternalIssuerSignedPolicy(policy)).to.equal(true);
    expect(policy.description).to.include("maintenance");
  });

  it("allows operational log as robot self-signed or controller-delegated", function () {
    const policy = getCredentialPolicy("RobotOperationalLogCredential");
    expect(supportsIssuanceModel(policy, ISSUANCE_MODEL.ROBOT_SELF_SIGNED)).to.equal(
      true
    );
    expect(supportsIssuanceModel(policy, ISSUANCE_MODEL.CONTROLLER_DELEGATED)).to.equal(
      true
    );
  });

  it("detects controller-delegated issuance when issuer differs from subject", function () {
    const credential = {
      issuer: "did:uzheth:0x0000000000000000000000000000000000000002",
      credentialSubject: {
        id: "did:uzheth:robot:1",
      },
    };
    const policy = getCredentialPolicy("RobotMaintenanceLogCredential");
    expect(detectIssuanceModel(credential, policy)).to.equal(
      ISSUANCE_MODEL.CONTROLLER_DELEGATED
    );
  });

  it("validates heartbeat schema", function () {
    const robotDid = "did:uzheth:robot:1";
    const result = verifyCredentialTypeAndSchema({
      type: ["VerifiableCredential", "RobotHeartbeatCredential"],
      issuer: robotDid,
      credentialSchema: {
        id: "urn:uzheth-schema:RobotHeartbeatCredential",
        type: "JsonSchema2020",
      },
      credentialSubject: {
        id: robotDid,
        onlineStatus: "online",
        lastHeartbeat: "2026-05-26T21:00:00.000Z",
        timestamp: "2026-05-26T21:00:00.000Z",
      },
    });

    expect(result.detectedIssuanceModel).to.equal(ISSUANCE_MODEL.ROBOT_SELF_SIGNED);
    expect(result.credentialSubjectMatchesSchema).to.equal(true);
  });
});
