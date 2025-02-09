import Web3 from "web3";
import NFT from "./contracts/NFT.json"; // Убедитесь, что путь к ABI корректный

const getContract = async () => {
  try {
    // Подключение к провайдеру (например, MetaMask или локальной сети Ganache)
    const web3 = new Web3(window.ethereum || "http://127.0.0.1:8545");

    // Запрос доступа к аккаунтам (если используется MetaMask)
    if (window.ethereum) {
      await window.ethereum.request({ method: "eth_requestAccounts" });
    }

    // Получение текущего networkId
    const networkId = await web3.eth.net.getId();

    // Проверка, развернут ли контракт на текущей сети
    const deployedNetwork = NFT.networks[networkId];
    if (!deployedNetwork) {
      throw new Error("Contract is not deployed on the current network.");
    }

    // Создание экземпляра контракта
    const contractInstance = new web3.eth.Contract(
      NFT.abi, // ABI контракта
      deployedNetwork.address // Адрес контракта
    );

    console.log("Connected to Contract:", deployedNetwork.address);
    return { web3, contractInstance };
  } catch (error) {
    console.error("Failed to connect to the contract:", error);
    throw error;
  }
};

export default getContract;
