// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

/**
 * @title ChainSync Token (CST)
 * @dev ERC-20 token for the ChainSync platform.
 *      - Owner can mint tokens (for mining rewards).
 *      - Standard transfer/approve/transferFrom for trading.
 */
contract ChainSyncToken {
    string public name = "ChainSync Token";
    string public symbol = "CST";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 value);
    event Approval(address indexed owner, address indexed spender, uint256 value);

    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    constructor(uint256 _initialSupply) {
        owner = msg.sender;
        uint256 supply = _initialSupply * 10 ** decimals;
        totalSupply = supply;
        balanceOf[msg.sender] = supply;
        emit Transfer(address(0), msg.sender, supply);
    }

    function transfer(address _to, uint256 _value) public returns (bool) {
        require(balanceOf[msg.sender] >= _value, "Insufficient balance");
        require(_to != address(0), "Invalid address");
        balanceOf[msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(msg.sender, _to, _value);
        return true;
    }

    function approve(address _spender, uint256 _value) public returns (bool) {
        allowance[msg.sender][_spender] = _value;
        emit Approval(msg.sender, _spender, _value);
        return true;
    }

    function transferFrom(address _from, address _to, uint256 _value) public returns (bool) {
        require(balanceOf[_from] >= _value, "Insufficient balance");
        require(allowance[_from][msg.sender] >= _value, "Allowance exceeded");
        require(_to != address(0), "Invalid address");
        balanceOf[_from] -= _value;
        allowance[_from][msg.sender] -= _value;
        balanceOf[_to] += _value;
        emit Transfer(_from, _to, _value);
        return true;
    }

    /**
     * @dev Mint new tokens — only callable by contract owner (for mining rewards).
     */
    function mint(address _to, uint256 _amount) public onlyOwner returns (bool) {
        require(_to != address(0), "Invalid address");
        uint256 value = _amount * 10 ** decimals;
        totalSupply += value;
        balanceOf[_to] += value;
        emit Transfer(address(0), _to, value);
        return true;
    }
}
