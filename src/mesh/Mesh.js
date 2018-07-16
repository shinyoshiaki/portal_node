import WebRTC from "../lib/WebRTC";
import Events from "events";
import { packetFormat } from "../constants/format";

export const def = {
  LISTEN: "LISTEN",
  ON_LISTEN: "ON_LISTEN",
  BROADCAST: "BROADCAST",
  MESH_OFFER: "MESH_OFFER",
  MESH_ANSWER: "MESH_ANSWER",
  MESH_MESSAGE: "MESH_MESSAGE",
  ONCOMMAND: "ONCOMMAND"
};

export const action = {
  PEER: "PEER"
};

export default class Mesh {
  constructor(nodeId) {
    this.ev = new Events.EventEmitter();
    this.nodeId = nodeId;
    this.peerList = {};
    this.packetIdList = [];
    this.ref = {};
    this.state = {
      isConnectPeers: false,
      isMeshAnswer: false
    };
  }

  addPeer(peer) {
    peer.ev.on("data", data => {
      this.onCommand(data);
    });
    peer.send(
      JSON.stringify({
        type: def.LISTEN,
        id: this.nodeId
      })
    );
    this.peerList[peer.nodeId] = peer;
    console.log("added peer", this.getAllPeerId());
    this.ev.emit(action.PEER);
  }

  getAllPeerId() {
    const idList = [];
    for (let key in this.peerList) {
      idList.push(key);
    }
    return idList;
  }

  onBroadCast(packet) {
    const json = JSON.parse(packet);
    if (!JSON.stringify(this.packetIdList).includes(json.hash)) {
      this.packetIdList.push(json.hash);
      for (let key in this.peerList) {
        this.peerList[key].send(packet);
      }
      return true;
    } else {
      return false;
    }
  }

  broadCast(tag, data) {
    this.onBroadCast(packetFormat(def.BROADCAST, { tag: tag, data: data }));
  }

  connectPeers(targetList) {
    if (!this.state.isConnectPeers) {
      (async () => {
        this.state.isConnectPeers = true;
        //console.log("connect peers", targetList);
        for (let target of targetList) {
          if (!this.getAllPeerId().includes(target) && target !== this.nodeId) {
            try {
              this.ref.peer = new WebRTC();
              const result = await this.offer(target, this.ref);
              this.addPeer(result);
            } catch (error) {
              console.log(error);
            }
          }
        }
        this.state.isConnectPeers = false;
      })();
    } else {
      console.log("is connecting peers");
    }
  }

  offer(target, r) {
    r.peer.makeOffer("json");
    r.peer.connecting(target);
    return new Promise((resolve, reject) => {
      r.peer.ev.once("signal", sdp => {
        console.log(" offer store", target);

        this.broadCast(def.MESH_OFFER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.ev.once("connect", () => {
        console.log(" offer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject();
      }, 3 * 1000);
    });
  }

  answer(target, sdp, r) {
    r.peer.makeAnswer(sdp);
    r.peer.connecting(target);
    return new Promise((resolve, reject) => {
      console.log(" answer", target);

      r.peer.ev.once("signal", sdp => {
        this.broadCast(def.MESH_ANSWER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.ev.once("connect", () => {
        console.log(" answer connected", target);
        r.peer.connected();
        resolve(r.peer);
      });

      setTimeout(() => {
        reject();
      }, 3 * 1000);
    });
  }

  cleanPeers() {
    const deleteList = [];
    for (let key in this.peerList) {
      if (this.peerList[key].isDisconnected) deleteList.push(key);
    }
    if (deleteList.length > 0) {
      console.log("delete list", deleteList);
    }
    deleteList.forEach(v => {
      delete this.peerList[v];
    });
  }

  onCommand(packet) {
    const json = JSON.parse(packet);
    const type = json.type;
    switch (type) {
      case def.LISTEN:
        console.log("on listen", json.id);
        this.peerList[json.id].send(
          JSON.stringify({
            type: def.ON_LISTEN,
            data: this.getAllPeerId()
          })
        );
        break;
      case def.ON_LISTEN:
        console.log("listen done");
        const targetList = json.data;
        this.connectPeers(targetList);
        break;
      case def.MESH_MESSAGE:
        console.log("mesh message", json);
        this.ev.emit(def.ONCOMMAND, json);
        break;
      case def.BROADCAST:
        if (this.onBroadCast(packet)) {
          const broadcastData = json.data;
          console.log("oncommand tag", broadcastData.tag);
          switch (broadcastData.tag) {
            case def.MESH_OFFER: {
              const to = broadcastData.data.to;
              if (to === this.nodeId) {
                const from = broadcastData.data.from;
                const sdp = broadcastData.data.sdp;
                if (!this.state.isMeshAnswer) {
                  this.state.isMeshAnswer = true;
                  this.ref.peer = new WebRTC();
                  (async () => {
                    await this.answer(from, sdp, this.ref).then(peer => {
                      console.log("answer success");
                      this.addPeer(peer);
                    }, console.log("answer fail"));
                    this.state.isMeshAnswer = false;
                  })();
                }
              }
              break;
            }
            case def.MESH_ANSWER: {
              const to = broadcastData.data.to;
              if (to === this.nodeId) {
                const sdp = broadcastData.data.sdp;
                console.log("on mesh answer to me");
                this.ref.peer.setAnswer(sdp);
              }
              break;
            }
            case def.MESH_MESSAGE:
              this.ev.emit(def.ONCOMMAND, broadcastData);
              break;
            default:
              break;
          }
        }
        break;
      default:
        break;
    }
    this.cleanPeers();
  }
}
