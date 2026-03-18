// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ChainSync NFT (CSNFT)
 * @dev Minimal ERC-721 for the ChainSync NFT Marketplace.
 *      - Owner can mint NFTs with metadata URIs.
 *      - Supports approve + transferFrom for marketplace buying.
 */
contract ChainSyncNFT {
    string public name = "ChainSync NFT";
    string public symbol = "CSNFT";
    address public owner;

    uint256 private _tokenIdCounter;

    mapping(uint256 => address) public ownerOf;
    mapping(uint256 => string) public tokenURI;
    mapping(uint256 => address) public getApproved;
    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => bool)) public isApprovedForAll;

    event Transfer(address indexed from, address indexed to, uint256 indexed tokenId);
    event Approval(address indexed owner, address indexed approved, uint256 indexed tokenId);
    event ApprovalForAll(address indexed owner, address indexed operator, bool approved);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor() {
        owner = msg.sender;
        _tokenIdCounter = 0;
    }

    function mintNFT(address _to, string memory _tokenURI) public onlyOwner returns (uint256) {
        require(_to != address(0), "Invalid address");
        _tokenIdCounter++;
        uint256 newTokenId = _tokenIdCounter;

        ownerOf[newTokenId] = _to;
        tokenURI[newTokenId] = _tokenURI;
        balanceOf[_to]++;

        emit Transfer(address(0), _to, newTokenId);
        return newTokenId;
    }

    function approve(address _approved, uint256 _tokenId) public {
        address tokenOwner = ownerOf[_tokenId];
        require(msg.sender == tokenOwner || isApprovedForAll[tokenOwner][msg.sender], "Not authorized");
        getApproved[_tokenId] = _approved;
        emit Approval(tokenOwner, _approved, _tokenId);
    }

    function setApprovalForAll(address _operator, bool _approved) public {
        isApprovedForAll[msg.sender][_operator] = _approved;
        emit ApprovalForAll(msg.sender, _operator, _approved);
    }

    function transferFrom(address _from, address _to, uint256 _tokenId) public {
        address tokenOwner = ownerOf[_tokenId];
        require(tokenOwner == _from, "Not the owner");
        require(
            msg.sender == _from ||
            getApproved[_tokenId] == msg.sender ||
            isApprovedForAll[_from][msg.sender],
            "Not authorized"
        );
        require(_to != address(0), "Invalid address");

        // Clear approval
        getApproved[_tokenId] = address(0);
        emit Approval(_from, address(0), _tokenId);

        balanceOf[_from]--;
        balanceOf[_to]++;
        ownerOf[_tokenId] = _to;

        emit Transfer(_from, _to, _tokenId);
    }

    function totalMinted() public view returns (uint256) {
        return _tokenIdCounter;
    }

    /**
     * @dev ERC-165 interface support (ERC-721)
     */
    function supportsInterface(bytes4 interfaceId) public pure returns (bool) {
        return interfaceId == 0x80ac58cd || // ERC-721
               interfaceId == 0x01ffc9a7;   // ERC-165
    }
}
