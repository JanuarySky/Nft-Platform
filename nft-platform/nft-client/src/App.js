import React, { useEffect, useState, useCallback } from "react";
import Web3 from "web3";
import NFT from "./contracts/NFT.json";
import "./App.css";

const App = () => {
  const [account, setAccount] = useState(null);
  const [contract, setContract] = useState(null);
  const [assets, setAssets] = useState([]);
  const [assetName, setAssetName] = useState("");
  const [assetDescription, setAssetDescription] = useState("");
  const [jsonInput, setJsonInput] = useState("");
  const [imageFile, setImageFile] = useState(null);
  const [imageURI, setImageURI] = useState("");
  const [recipient, setRecipient] = useState("");

  // States for direct sale
  const [saleTokenId, setSaleTokenId] = useState("");
  const [salePrice, setSalePrice] = useState("");
  const [purchaseTokenId, setPurchaseTokenId] = useState("");
  const [purchasePrice, setPurchasePrice] = useState("");

  // States for direct rental
  const [rentalTokenId, setRentalTokenId] = useState("");
  const [rentalPrice, setRentalPrice] = useState("");
  const [rentalDuration, setRentalDuration] = useState("");
  const [confirmRentalTokenId, setConfirmRentalTokenId] = useState("");
  const [confirmRentalAmount, setConfirmRentalAmount] = useState("");

  // States for auctions
  const [auctionTokenId, setAuctionTokenId] = useState("");
  const [bidAmount, setBidAmount] = useState("");
  const [auctionDuration, setAuctionDuration] = useState("");

  // Loading state
  const [isLoading, setIsLoading] = useState(false);

  // Interval to update rental time
  useEffect(() => {
    const interval = setInterval(() => {
      setAssets((prevAssets) =>
        prevAssets.map((asset) => {
          if (asset.isRented && asset.timeLeft > 0) {
            return {
              ...asset,
              timeLeft: asset.timeLeft - 1,
            };
          }
          return asset;
        })
      );
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  // Detect account changes in MetaMask
  useEffect(() => {
    if (window.ethereum) {
      window.ethereum.on("accountsChanged", (accounts) => {
        if (accounts.length > 0) {
          setAccount(accounts[0]);
        } else {
          alert("Please connect to MetaMask.");
        }
      });
    }
  }, []);

  // Initialize web3 and contract
  useEffect(() => {
    const initWeb3 = async () => {
      if (window.ethereum) {
        const web3 = new Web3(window.ethereum);
        await window.ethereum.request({ method: "eth_requestAccounts" });
        const accounts = await web3.eth.getAccounts();
        setAccount(accounts[0]);

        const networkId = await web3.eth.net.getId();
        const deployedNetwork = NFT.networks[networkId];
        if (deployedNetwork) {
          const instance = new web3.eth.Contract(
            NFT.abi,
            deployedNetwork.address
          );
          setContract(instance);

          // Listen to transfer event to update UI
          instance.events.TokenTransferred((error, event) => {
            if (!error) {
              console.log("Token Transferred:", event.returnValues);
              fetchAssets();
            } else {
              console.error("Event error:", error);
            }
          });
        } else {
          alert("Contract not deployed on the connected network.");
        }
      } else {
        alert("Please install Metamask.");
      }
    };

    initWeb3();
  }, []);

  // ------------------ IMAGE & METADATA UPLOAD ------------------ //

  const uploadImage = async () => {
    if (!imageFile) {
      alert("Please select an image file.");
      return;
    }

    const formData = new FormData();
    formData.append("image", imageFile);

    try {
      const response = await fetch("http://localhost:3001/uploadImage", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to upload image");
      }

      const data = await response.json();
      setImageURI(data.uri);
      alert("Image uploaded successfully!");
    } catch (error) {
      console.error("Error uploading image:", error);
    }
  };

  const uploadMetadata = async (metadata) => {
    try {
      const response = await fetch("http://localhost:3001/uploadMetadata", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(metadata),
      });

      if (!response.ok) {
        throw new Error("Failed to upload metadata");
      }

      const data = await response.json();
      return data.uri;
    } catch (error) {
      console.error("Error uploading metadata:", error);
      throw error;
    }
  };

  const createAssetWithMetadata = async () => {
    if (contract && account && jsonInput && imageURI) {
      try {
        const parsedJson = JSON.parse(jsonInput);
        const traitTypes = parsedJson.attributes.map((attr) => attr.traitType);
        const values = parsedJson.attributes.map((attr) => attr.value);

        const metadata = {
          name: assetName,
          description: assetDescription,
          image: imageURI,
          attributes: parsedJson.attributes,
        };

        const metadataURI = await uploadMetadata(metadata);

        await contract.methods
          .createAssetWithMetadata(
            assetName,
            assetDescription,
            metadataURI,
            traitTypes,
            values
          )
          .send({ from: account });

        alert("Asset created successfully!");
        fetchAssets();
      } catch (error) {
        console.error("Error creating asset with metadata:", error);
      }
    }
  };

  // ------------------ FETCH ASSETS ------------------ //

  const fetchAssets = useCallback(async () => {
    if (contract && account) {
      try {
        const tokenIds = await contract.methods.getTokensByOwner(account).call();
        const fetchedAssets = [];

        for (const id of tokenIds) {
          const asset = await contract.methods.getAsset(id).call();
          const attributes = await contract.methods.getAttributes(id).call();
          const isRented = await contract.methods.isRented(id).call();
          const salePrice = await contract.methods.salePrices(id).call();
          const rentalPrice = await contract.methods.rentalPrices(id).call();
          const rentalDuration = await contract.methods.rentalDurations(id).call();

          let renter = null;
          let timeLeft = 0;

          if (isRented) {
            renter = await contract.methods.getRenter(id).call();
            const rentalEndTime = await contract.methods
              .getRentalEndTime(id)
              .call();
            const currentTime = Math.floor(Date.now() / 1000);
            timeLeft = Math.max(0, Number(rentalEndTime) - currentTime);

            // Если время аренды истекло, завершаем аренду
            if (timeLeft <= 0) {
              await contract.methods.endRental(id).send({ from: account });
            }
          }

          fetchedAssets.push({
            id: id.toString(),
            ...asset,
            attributes,
            isRented: timeLeft > 0, // Обновляем статус аренды
            renter,
            timeLeft,
            salePrice,
            rentalPrice,
            rentalDuration,
          });
        }

        setAssets(fetchedAssets);
      } catch (error) {
        console.error("Error fetching assets:", error);
      }
    }
  }, [contract, account]);

  useEffect(() => {
    if (contract) {
      fetchAssets();
    }
  }, [contract, fetchAssets]);

  // ------------------ TRANSFER TOKEN ------------------ //

  const transferToken = async (tokenId, recipientAddress) => {
    if (!contract || !account) {
      console.error("Contract or account is not defined");
      return;
    }

    try {
      // Проверяем, арендован ли токен
      const isRented = await contract.methods.isRented(tokenId).call();
      if (isRented) {
        alert("This token is currently rented and cannot be transferred.");
        return;
      }

      // Выполняем трансфер, если токен не арендован
      await contract.methods
        .safeTransferFrom(account, recipientAddress, tokenId)
        .send({ from: account });

      alert(`Token ID ${tokenId} successfully transferred to ${recipientAddress}`);
      fetchAssets();
    } catch (error) {
      console.error("Error transferring token:", error);
      alert("Failed to transfer token. See console for details.");
    }
  };

  // ------------------ DIRECT SALE FUNCTIONS ------------------ //

  const handleSetSalePrice = async () => {
    if (!saleTokenId || !salePrice) {
      alert("Please provide both token ID and sale price in ETH.");
      return;
    }

    setIsLoading(true);
    try {
      const convertedPrice = Web3.utils.toWei(salePrice, "ether");
      await contract.methods
        .setSalePrice(saleTokenId, convertedPrice)
        .send({ from: account });

      alert(`Sale price for Token ID ${saleTokenId} set to ${salePrice} ETH`);
      setSaleTokenId("");
      setSalePrice("");
      fetchAssets();
    } catch (error) {
      console.error("Error setting sale price:", error);
      alert("Failed to set sale price. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleConfirmPurchase = async () => {
    if (!purchaseTokenId || !purchasePrice) {
      alert("Please provide token ID and purchase price in ETH.");
      return;
    }

    setIsLoading(true);
    try {
      const priceInWei = Web3.utils.toWei(purchasePrice, "ether");
      await contract.methods
        .confirmPurchase(purchaseTokenId)
        .send({ from: account, value: priceInWei, gas: 300000 });

      alert(
        `Purchased Token ID ${purchaseTokenId} for ${purchasePrice} ETH successfully!`
      );
      setPurchaseTokenId("");
      setPurchasePrice("");
      fetchAssets();
    } catch (error) {
      console.error("Error confirming purchase:", error);
      alert("Failed to confirm purchase. See console for details.");
    } finally {
      setIsLoading(false);
    }
  };

  // ------------------ DIRECT RENTAL FUNCTIONS ------------------ //

  const handleSetRentalPrice = async () => {
    if (!rentalTokenId || !rentalPrice) {
      alert("Please provide token ID and rental price in ETH.");
      return;
    }

    const priceInWei = Web3.utils.toWei(rentalPrice, "ether");
    try {
      await contract.methods
        .setRentalPrice(rentalTokenId, priceInWei)
        .send({ from: account });

      alert(
        `Rental price for Token ID ${rentalTokenId} set to ${rentalPrice} ETH`
      );
      setRentalTokenId("");
      setRentalPrice("");
      fetchAssets();
    } catch (error) {
      console.error("Error setting rental price:", error);
    }
  };

  const handleSetRentalDuration = async () => {
    if (!rentalTokenId || !rentalDuration) {
      alert("Please provide token ID and rental duration (seconds).");
      return;
    }
    try {
      await contract.methods
        .setRentalDuration(rentalTokenId, rentalDuration)
        .send({ from: account });

      alert(
        `Rental duration for Token ID ${rentalTokenId} set to ${rentalDuration} seconds.`
      );
      setRentalTokenId("");
      setRentalDuration("");
      fetchAssets();
    } catch (error) {
      console.error("Error setting rental duration:", error);
    }
  };

  const handleConfirmRent = async () => {
    if (!confirmRentalTokenId || !confirmRentalAmount) {
      alert("Please provide token ID and rental amount in ETH.");
      return;
    }

    try {
      const amountInWei = Web3.utils.toWei(confirmRentalAmount, "ether");
      await contract.methods
        .confirmRent(confirmRentalTokenId)
        .send({ from: account, value: amountInWei });

      alert(
        `Rented Token ID ${confirmRentalTokenId} for ${confirmRentalAmount} ETH.`
      );

      setConfirmRentalTokenId("");
      setConfirmRentalAmount("");
      fetchAssets();
    } catch (error) {
      console.error("Error confirming rent:", error);
      alert("Failed to confirm rent. See console for details.");
    }
  };

  // ------------------ AUCTION FUNCTIONS ------------------ //

  const createAuction = async () => {
    if (!auctionTokenId || !auctionDuration) {
      alert("Please provide token ID and auction duration.");
      return;
    }
    try {
      await contract.methods
        .createAuction(auctionTokenId, auctionDuration)
        .send({ from: account });

      alert(`Auction for Token ID ${auctionTokenId} created successfully!`);
      setAuctionTokenId("");
      setAuctionDuration("");
      fetchAssets();
    } catch (error) {
      console.error("Error creating auction:", error);
    }
  };

  const placeBid = async () => {
    if (!auctionTokenId || !bidAmount) {
      alert("Please provide token ID and bid amount.");
      return;
    }
    const bidInWei = Web3.utils.toWei(bidAmount, "ether");
    try {
      await contract.methods.placeBid(auctionTokenId).send({
        from: account,
        value: bidInWei,
      });

      alert(`Bid of ${bidAmount} ETH placed for Token ID ${auctionTokenId}!`);
      setBidAmount("");
    } catch (error) {
      console.error("Error placing bid:", error);
    }
  };

  const endAuction = async () => {
    if (!auctionTokenId) {
      alert("Please provide token ID.");
      return;
    }
    try {
      await contract.methods.endAuction(auctionTokenId).send({ from: account });
      alert(`Auction for Token ID ${auctionTokenId} ended.`);
      fetchAssets();
    } catch (error) {
      console.error("Error ending auction:", error);
    }
  };

  // ------------------ RENDER ------------------ //

  return (
    <div className="app">
      <header className="app-header">
        <h1 className="app-title">NFT Platform</h1>
        <p>Connected Account: {account}</p>
      </header>

      {/* Create Asset */}
      <section className="create-section">
        <h2>Create Asset with Attributes</h2>
        <div className="form-group">
          <input
            type="text"
            placeholder="Asset Name"
            value={assetName}
            onChange={(e) => setAssetName(e.target.value)}
          />
          <input
            type="text"
            placeholder="Asset Description"
            value={assetDescription}
            onChange={(e) => setAssetDescription(e.target.value)}
          />
          <textarea
            placeholder='{"attributes": [{"traitType": "Size", "value": "100x100"}]}'
            value={jsonInput}
            onChange={(e) => setJsonInput(e.target.value)}
          />
          <input
            type="file"
            accept="image/*"
            onChange={(e) => setImageFile(e.target.files[0])}
          />
          <button onClick={uploadImage}>Upload Image</button>
        </div>
        <button onClick={createAssetWithMetadata}>Create Asset</button>
      </section>

      {/* Direct Sale / Purchase */}
      <section className="direct-sale-section">
        <h2>Direct Sale Management</h2>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={saleTokenId}
            onChange={(e) => setSaleTokenId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Sale Price (ETH)"
            value={salePrice}
            onChange={(e) => setSalePrice(e.target.value)}
          />
          <button onClick={handleSetSalePrice} disabled={isLoading}>
            {isLoading ? "Processing..." : "Set Sale Price"}
          </button>
        </div>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={purchaseTokenId}
            onChange={(e) => setPurchaseTokenId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Purchase Price (ETH)"
            value={purchasePrice}
            onChange={(e) => setPurchasePrice(e.target.value)}
          />
          <button onClick={handleConfirmPurchase} disabled={isLoading}>
            {isLoading ? "Processing..." : "Buy Token"}
          </button>
        </div>
      </section>

      {/* Direct Rental / Confirm Rental */}
      <section className="direct-rent-section">
        <h2>Direct Rental Management</h2>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={rentalTokenId}
            onChange={(e) => setRentalTokenId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Rental Price (ETH)"
            value={rentalPrice}
            onChange={(e) => setRentalPrice(e.target.value)}
          />
          <button onClick={handleSetRentalPrice}>Set Rental Price</button>
        </div>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={rentalTokenId}
            onChange={(e) => setRentalTokenId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Rental Duration (seconds)"
            value={rentalDuration}
            onChange={(e) => setRentalDuration(e.target.value)}
          />
          <button onClick={handleSetRentalDuration}>Set Rental Duration</button>
        </div>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={confirmRentalTokenId}
            onChange={(e) => setConfirmRentalTokenId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Rental Amount (ETH)"
            value={confirmRentalAmount}
            onChange={(e) => setConfirmRentalAmount(e.target.value)}
          />
          <button onClick={handleConfirmRent}>Confirm & Pay Rent</button>
        </div>
      </section>

      {/* Auction Management */}
      <section className="auction-section">
        <h2>Auction Management</h2>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={auctionTokenId}
            onChange={(e) => setAuctionTokenId(e.target.value)}
          />
          <input
            type="number"
            placeholder="Auction Duration (seconds)"
            value={auctionDuration}
            onChange={(e) => setAuctionDuration(e.target.value)}
          />
          <button onClick={createAuction}>Create Auction</button>
        </div>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={auctionTokenId}
            onChange={(e) => setAuctionTokenId(e.target.value)}
          />
          <input
            type="text"
            placeholder="Bid Amount (ETH)"
            value={bidAmount}
            onChange={(e) => setBidAmount(e.target.value)}
          />
          <button onClick={placeBid}>Place Bid</button>
        </div>
        <div>
          <input
            type="number"
            placeholder="Token ID"
            value={auctionTokenId}
            onChange={(e) => setAuctionTokenId(e.target.value)}
          />
          <button onClick={endAuction}>End Auction</button>
        </div>
      </section>

      {/* Existing assets list */}
      <section className="assets-section">
        <h2>Your Assets</h2>
        <button onClick={fetchAssets} className="refresh-button">
          Refresh
        </button>
        {assets.length === 0 ? (
          <p>No assets found</p>
        ) : (
          <ul className="assets-list">
            {assets.map((asset) => (
              <li key={asset.id} className="asset-card">
                <p>
                  <strong>Token ID:</strong> {asset.id}
                </p>
                <p>
                  <strong>Name:</strong> {asset.name}
                </p>
                <p>
                  <strong>Description:</strong> {asset.description}
                </p>
                <p>
                  <strong>Metadata URI:</strong> {asset.metadataURI}
                </p>
                {asset.image && (
                  <img
                    src={asset.image}
                    alt={asset.name}
                    style={{ width: "100%", height: "auto" }}
                  />
                )}
                <h4>Attributes:</h4>
                <ul>
                  {asset.attributes.map((attr, index) => (
                    <li key={index}>
                      <strong>{attr.traitType}:</strong> {attr.value}
                    </li>
                  ))}
                </ul>

                {/* Rental info */}
                <p>
                  <strong>Renter:</strong>{" "}
                  {asset.isRented ? asset.renter : "Not rented"}
                </p>
                {asset.isRented && (
                  <p>
                    <strong>Time Left:</strong>{" "}
                    {asset.timeLeft > 0 ? `${asset.timeLeft}s` : "Rental ended"}
                  </p>
                )}

                <p>
                  <strong>Sale Price (ETH):</strong>{" "}
                  {asset.salePrice !== "0"
                    ? Web3.utils.fromWei(asset.salePrice, "ether")
                    : "Not for sale"}
                </p>

                <p>
                  <strong>Rental Price (ETH):</strong>{" "}
                  {asset.rentalPrice !== "0"
                    ? Web3.utils.fromWei(asset.rentalPrice, "ether")
                    : "Not for rent"}
                </p>

                <p>
                  <strong>Rental Duration (seconds):</strong>{" "}
                  {asset.rentalDuration > 0
                    ? `${asset.rentalDuration} seconds`
                    : "Not set"}
                </p>

                {/* Transfer token */}
                <div className="transfer-form">
                  <input
                    type="text"
                    placeholder="Recipient Address"
                    value={recipient}
                    onChange={(e) => setRecipient(e.target.value)}
                  />
                  {asset.isRented ? (
                    <p style={{ color: "red" }}>
                      Transfer is blocked: Token is currently rented.
                    </p>
                  ) : (
                    <button onClick={() => transferToken(asset.id, recipient)}>
                      Transfer Token
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};

export default App;
