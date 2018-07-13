import BlockChain from "../blockchain/BlockChain";
import inquire from "inquirer";

const menuBlockchain = {
  type: "list",
  name: "bchainMenu",
  message: "select action",
  choices: ["mining", "transaction", "blockchain"]
};

function mining(blockchain) {
  return new Promise(resolve => {
    const proof = blockchain.proofOfWork();

    const lastBlock = blockchain.lastBlock();
    const previousHash = blockchain.hash(lastBlock);
    const block = blockchain.newBlock(proof, previousHash);

    console.log("new block forged", JSON.stringify(block));

    resolve(block);
  });
}

function makeTransaction(blockchain, recipient, amount, data) {
  const tran = blockchain.newTransaction(
    blockchain.address,
    recipient,
    amount,
    data
  );
  console.log("makeTransaction", tran);
}

const blockchain = new BlockChain();

function quetion() {
  inquire.prompt([menuBlockchain]).then(answer => {
    console.log(answer.bchainMenu);
    switch (answer.bchainMenu) {
      case "mining":
        mining(blockchain);
        break;
      case "transaction":
        makeTransaction(blockchain, blockchain.address, 0.1, "");
        break;
      case "blockchain":
        console.log("now blockchain", blockchain.chain);
        break;
    }
    quetion();
  });
}

quetion();
