import Blockchain from "./BlockChain";
import type from "../constants/type";
import * as format from "../constants/format";
import Events from "events";

let nodeId;
let node;

export default class BlockchainApp {
  constructor(id, _node) {
    nodeId = id;
    this.blockchain = new Blockchain();
    this.ev = new Events.EventEmitter();

    let local = localStorage.getItem(type.BLOCKCHAIN);
    if (local !== null && local.length > 0) {
      this.blockchain.chain = JSON.parse(local);
      console.log("load blockchain", this.blockchain.chain);
    }

    node = _node;

    node.ev.on("p2ch", networkLayer => {
      const transportLayer = JSON.parse(networkLayer);
      console.log("blockchainApp", "p2ch", transportLayer);

      this.ev.emit(transportLayer.session, transportLayer.body);
      const body = transportLayer.body;

      switch (transportLayer.session) {
        case type.NEWBLOCK:
          console.log("blockchainApp", "new block", body);
          if (
            body.index > this.blockchain.chain.length + 1 ||
            this.blockchain.chain.length === 1
          ) {
            (async () => {
              await this.checkConflicts();
            })();
          } else {
            this.blockchain.addBlock(body);
          }
          break;
        case type.TRANSACRION:
          console.log("blockchainApp transaction", body);
          if (
            !JSON.stringify(this.blockchain.currentTransactions).includes(
              JSON.stringify(body)
            )
          ) {            
            this.blockchain.addTransaction(body);
          }
          break;
        case type.CONFLICT:
          console.log("blockchain app check conflict");
          if (this.blockchain.chain.length > body.size) {
            console.log("blockchain app check is conflict");
            node.send(
              body.nodeId,
              format.sendFormat(type.RESOLVE_CONFLICT, this.blockchain.chain)
            );
          }
          break;
        default:
          break;
      }
    });
  }

  checkConflicts() {
    return new Promise(resolve => {
      setTimeout(() => {
        resolve(false);
      }, 4 * 1000);
      console.log("this.checkConflicts");
      node.broadCast(
        format.sendFormat(type.CONFLICT, {
          nodeId: nodeId,
          size: this.blockchain.chain.length
        })
      );
      this.ev.on(type.RESOLVE_CONFLICT, body => {
        console.log("resolve conflict");
        if (this.blockchain.chain.length < body.length) {
          console.log("conflict my chain short");
          if (this.blockchain.validChain(body)) {
            console.log("conflict swap chain");
            this.blockchain.chain = body;
          } else {
            console.log("conflict wrong chain");
          }
        }
        resolve(true);
      });
    });
  }

  mine() {
    return new Promise(resolve => {
      const proof = this.blockchain.proofOfWork();

      const lastBlock = this.blockchain.lastBlock();
      const previousHash = this.blockchain.hash(lastBlock);
      const block = this.blockchain.newBlock(proof, previousHash);

      console.log("new block forged", JSON.stringify(block));

      this.saveChain();

      node.broadCast(format.sendFormat(type.NEWBLOCK, block));

      resolve(block);
    });
  }

  makeTransaction(recipient, amount, data) {
    const tran = this.blockchain.newTransaction(
      this.blockchain.address,
      recipient,
      amount,
      data
    );
    console.log("makeTransaction", tran);

    node.broadCast(format.sendFormat(type.TRANSACRION, tran));
  }

  getChain() {
    this.saveChain();
    return this.blockchain.chain;
  }

  saveChain() {
    localStorage.setItem(
      type.BLOCKCHAIN,
      JSON.stringify(this.blockchain.chain)
    );
  }
}
