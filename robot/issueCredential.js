require("dotenv").config();

console.warn("Use robot/issueSelfSignedCredential.js for robot self-signed VCs.");
console.warn("Use issuer/issueCredentialForRobot.js for external issuer-signed VCs.");
require("../issuer/issueCredentialForRobot");
