// SPDX-License-Identifier: MIT
// One ERC-721 token per robot; NFT holder is the management owner (not the device signing key).
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

contract RobotIdentityNFT is ERC721, AccessControl {
    bytes32 public constant MINTER_ROLE = keccak256("MINTER_ROLE");

    uint256 private nextTokenId = 1;

    mapping(uint256 => string) private robotMetadataURIs;

    event RobotMinted(
        uint256 indexed tokenId,
        address indexed owner,
        string metadataURI
    );

    constructor() ERC721("Robot Identity", "ROBOTID") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _grantRole(MINTER_ROLE, msg.sender);
    }

    function mintRobot(
        address to,
        string memory metadataURI
    ) external onlyRole(MINTER_ROLE) returns (uint256) {
        require(to != address(0), "Robot owner must not be zero address");

        uint256 tokenId = nextTokenId;
        nextTokenId += 1;

        _safeMint(to, tokenId);
        robotMetadataURIs[tokenId] = metadataURI;

        emit RobotMinted(tokenId, to, metadataURI);
        return tokenId;
    }

    function tokenURI(
        uint256 tokenId
    ) public view override returns (string memory) {
        require(_exists(tokenId), "ERC721: invalid token ID");
        return robotMetadataURIs[tokenId];
    }

    function supportsInterface(
        bytes4 interfaceId
    ) public view override(ERC721, AccessControl) returns (bool) {
        return super.supportsInterface(interfaceId);
    }
}
