require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const UZHETH_POS_RPC_URL =
  process.env.UZHETH_POS_RPC_URL || "http://130.60.144.77:8554/";

/** @type import("hardhat/config").HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    uzhethpos: {
      url: UZHETH_POS_RPC_URL,
      chainId: 70207,
      accounts: process.env.PRIVATE_KEY ? [process.env.PRIVATE_KEY] : [],
    },
  },
};
