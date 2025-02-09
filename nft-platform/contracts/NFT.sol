// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721Enumerable.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Counters.sol";

contract NFT is ERC721Enumerable, Ownable {
    using Counters for Counters.Counter;
    Counters.Counter private _tokenIds;

    struct Attribute {
        string traitType;
        string value;
    }

    struct Asset {
        string name;
        string description;
        string metadataURI;
    }

    struct RentalInfo {
        address renter;
        uint256 endTime;
    }

    struct Auction {
        address highestBidder;
        uint256 highestBid;
        uint256 endTime;
        bool isActive;
    }

    mapping(uint256 => Asset) public assets;
    mapping(uint256 => Attribute[]) public attributes;
    mapping(uint256 => RentalInfo) public rentals;
    mapping(uint256 => Auction) public auctions;
    mapping(uint256 => uint256) public salePrices;
    mapping(uint256 => uint256) public rentalPrices;
    mapping(uint256 => uint256) public rentalDurations;

    uint256 public constant MAX_SUPPLY = 10000;

    event AssetCreated(uint256 tokenId, string name, string metadataURI);
    event AttributeUpdated(uint256 tokenId, string traitType, string newValue);
    event AssetRented(uint256 tokenId, address renter, uint256 rentalPeriod);
    event RentalEnded(uint256 tokenId);
    event TokenTransferred(address from, address to, uint256 tokenId);
    event AuctionCreated(uint256 auctionId, uint256 tokenId, uint256 endTime);
    event SalePriceSet(uint256 tokenId, uint256 price);
    event RentalPriceSet(uint256 tokenId, uint256 price);
    event RentalDurationSet(uint256 tokenId, uint256 duration);
    event TokenPurchased(uint256 tokenId, address buyer, uint256 price);
    event TokenRented(uint256 tokenId, address renter, uint256 price, uint256 rentalPeriod);

    constructor() ERC721("NFT", "ETH") {}

    // Модификатор для автоматического завершения аренды
    modifier autoEndRental(uint256 tokenId) {
        if (rentals[tokenId].endTime > 0 && block.timestamp >= rentals[tokenId].endTime) {
            rentals[tokenId] = RentalInfo({
                renter: address(0),
                endTime: 0
            });
            emit RentalEnded(tokenId);
        }
        _;
    }

    // Создание NFT с метаданными
    function createAssetWithMetadata(
        string memory name,
        string memory description,
        string memory metadataURI,
        string[] memory traitTypes,
        string[] memory values
    ) external onlyOwner returns (uint256) {
        require(_tokenIds.current() < MAX_SUPPLY, "Max supply reached");
        require(bytes(name).length > 0, "Name is required");
        require(bytes(metadataURI).length > 0, "Metadata URI is required");
        require(traitTypes.length == values.length, "Mismatched attributes length");

        _tokenIds.increment();
        uint256 newTokenId = _tokenIds.current();
        _mint(msg.sender, newTokenId);

        assets[newTokenId] = Asset(name, description, metadataURI);

        for (uint256 i = 0; i < traitTypes.length; i++) {
            attributes[newTokenId].push(Attribute(traitTypes[i], values[i]));
        }

        emit AssetCreated(newTokenId, name, metadataURI);
        return newTokenId;
    }

    function getAsset(uint256 tokenId)
        external
        view
        returns (
            string memory name,
            string memory description,
            string memory metadataURI
        )
    {
        require(_exists(tokenId), "Asset does not exist");
        Asset storage asset = assets[tokenId];
        return (asset.name, asset.description, asset.metadataURI);
    }

    function getAttributes(uint256 tokenId) external view returns (Attribute[] memory) {
        require(_exists(tokenId), "Token does not exist");
        return attributes[tokenId];
    }

    // Получение токенов владельца
    function getTokensByOwner(address owner) public view returns (uint256[] memory) {
        uint256 tokenCount = balanceOf(owner);
        uint256[] memory tokens = new uint256[](tokenCount);
        for (uint256 i = 0; i < tokenCount; i++) {
            tokens[i] = tokenOfOwnerByIndex(owner, i);
        }
        return tokens;
    }

    // Трансфер токена с проверкой аренды
    function transferFrom(address from, address to, uint256 tokenId) public override(ERC721, IERC721) autoEndRental(tokenId) {
        require(!isRented(tokenId), "Token is currently rented.");
        super.transferFrom(from, to, tokenId);
        emit TokenTransferred(from, to, tokenId);
    }

    // Проверка, арендован ли токен
    function isRented(uint256 tokenId) public view returns (bool) {
        return rentals[tokenId].renter != address(0) && block.timestamp < rentals[tokenId].endTime;
    }

    // Получение арендатора
    function getRenter(uint256 tokenId) public view returns (address) {
        return rentals[tokenId].renter;
    }

    // Получение времени окончания аренды
    function getRentalEndTime(uint256 tokenId) public view returns (uint256) {
        return rentals[tokenId].endTime;
    }

    // Установка цены аренды
    function setRentalPrice(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Only the owner can set rental price");
        rentalPrices[tokenId] = price;
        emit RentalPriceSet(tokenId, price);
    }

    // Установка продолжительности аренды
    function setRentalDuration(uint256 tokenId, uint256 duration) external {
        require(ownerOf(tokenId) == msg.sender, "Only the owner can set rental duration");
        rentalDurations[tokenId] = duration;
        emit RentalDurationSet(tokenId, duration);
    }

    // Подтверждение аренды
    function confirmRent(uint256 tokenId) external payable autoEndRental(tokenId) {
        uint256 price = rentalPrices[tokenId];
        require(price > 0, "Token is not for rent or price not set");
        require(!isRented(tokenId), "Token is already rented");

        uint256 rentalPeriod = rentalDurations[tokenId];
        require(rentalPeriod > 0, "Rental duration not set");
        require(msg.value == price, "Incorrect Ether amount sent");

        address owner = ownerOf(tokenId);
        (bool sent, ) = payable(owner).call{value: msg.value}("");
        require(sent, "Failed to transfer payment to owner");

        rentals[tokenId] = RentalInfo({
            renter: msg.sender,
            endTime: block.timestamp + rentalPeriod
        });

        emit TokenRented(tokenId, msg.sender, price, rentalPeriod);
    }

    // Завершение аренды
    function endRental(uint256 tokenId) external autoEndRental(tokenId) {
        require(rentals[tokenId].renter != address(0), "Token is not rented");
        require(msg.sender == rentals[tokenId].renter || msg.sender == ownerOf(tokenId), "Not authorized");

        rentals[tokenId] = RentalInfo({
            renter: address(0),
            endTime: 0
        });

        emit RentalEnded(tokenId);
    }

    // Установка цены продажи
    function setSalePrice(uint256 tokenId, uint256 price) external {
        require(ownerOf(tokenId) == msg.sender, "Only the owner can set the sale price");
        salePrices[tokenId] = price;
        emit SalePriceSet(tokenId, price);
    }

    // Подтверждение покупки
    function confirmPurchase(uint256 tokenId) external payable {
        uint256 price = salePrices[tokenId];
        require(price > 0, "Token is not for sale");
        require(msg.value == price, "Incorrect Ether amount sent");

        address seller = ownerOf(tokenId); // Получаем владельца токена
        require(seller != address(0), "Invalid seller address");

        // Передаем токен покупателю
        _transfer(seller, msg.sender, tokenId);

        // Сбрасываем цену продажи
        salePrices[tokenId] = 0;

        // Переводим ETH продавцу
        (bool sent, ) = payable(seller).call{value: msg.value}("");
        require(sent, "Failed to send Ether to the seller");

        emit TokenPurchased(tokenId, msg.sender, price);
    }

    // Создание аукциона
    function createAuction(uint256 tokenId, uint256 duration) external {
        require(ownerOf(tokenId) == msg.sender, "You are not the owner of this token");
        require(!isRented(tokenId), "Token is currently rented");

        auctions[tokenId] = Auction({
            highestBidder: address(0),
            highestBid: 0,
            endTime: block.timestamp + duration,
            isActive: true
        });

        emit AuctionCreated(tokenId, tokenId, block.timestamp + duration);
    }

    // Размещение ставки на аукционе
    function placeBid(uint256 tokenId) external payable {
        Auction storage auction = auctions[tokenId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp < auction.endTime, "Auction has ended");
        require(msg.value > auction.highestBid, "Bid must be higher than the current highest bid");

        if (auction.highestBidder != address(0)) {
            (bool sent, ) = payable(auction.highestBidder).call{value: auction.highestBid}("");
            require(sent, "Failed to refund previous bidder");
        }

        auction.highestBidder = msg.sender;
        auction.highestBid = msg.value;
    }

    // Завершение аукциона
    function endAuction(uint256 tokenId) external {
        Auction storage auction = auctions[tokenId];
        require(auction.isActive, "Auction is not active");
        require(block.timestamp >= auction.endTime, "Auction has not ended yet");

        auction.isActive = false;

        if (auction.highestBidder != address(0)) {
            safeTransferFrom(ownerOf(tokenId), auction.highestBidder, tokenId);
        }
    }
}
