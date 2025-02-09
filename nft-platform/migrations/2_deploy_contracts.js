const NFT = artifacts.require("NFT");
//const AuctionManager = artifacts.require("AuctionManager");

//module.exports = async function (deployer) {
  // Развернуть AuctionManager
  //await deployer.deploy(AuctionManager);
  //const auctionManager = await AuctionManager.deployed();

  // Развернуть NFT с адресом AuctionManager
  //await deployer.deploy(NFT, auctionManager.address);
//};




module.exports = function (deployer) {
  deployer.deploy(NFT);
};
