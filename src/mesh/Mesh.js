import WebRTC from "../lib/webrtc";
import Events from "events";
import sha1 from "sha1";

export const def = {
  LISTEN: "LISTEN",
  ON_LISTEN: "ON_LISTEN",
  BROADCAST: "BROADCAST",
  MESH_OFFER: "MESH_OFFER",
  MESH_ANSWER: "MESH_ANSWER",
  MESH_MESSAGE: "MESH_MESSAGE",
  ONCOMMAND: "ONCOMMAND"
};

function packetFormat(type, data) {
  let packet = {
    layer: "networkLayer",
    type: type,
    data: data,
    date: Date.now(),
    hash: ""
  };
  packet.hash = sha1(JSON.stringify(packet));
  return JSON.stringify(packet);
}

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
    peer.rtc.on("data", data => {
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
  }

  getAllPeerId() {
    this.cleanPeers();
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
        for (let target of targetList) {
          if (!this.getAllPeerId().includes(target) && target !== this.nodeId) {
            this.ref.peer = new WebRTC("offer");
            await this.offer(target, this.ref);
          }
        }
        this.state.isConnectPeers = false;
      })();
    }
  }

  offer(target, r) {
    return new Promise(resolve => {      
      r.peer.connecting(target);

      r.peer.rtc.on("error", err => {
        console.log(" offer connect error", target, err);
        resolve(false);
      });

      r.peer.rtc.on("signal", sdp => {
        this.broadCast(def.MESH_OFFER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.rtc.on("connect", () => {        
        r.peer.connected();
        this.addPeer(r.peer);
        resolve(true);
      });

      setTimeout(() => {
        resolve(false);
      }, 3 * 1000);
    });
  }

  answer(target, sdp, r) {
    return new Promise(resolve => {
      r.peer.connecting(target);      
      r.peer.rtc.signal(sdp);

      r.peer.rtc.on("error", err => {
        console.log("error", target, err);
        resolve(false);
      });

      r.peer.rtc.on("signal", sdp => {
        this.broadCast(def.MESH_ANSWER, {
          from: this.nodeId,
          to: target,
          sdp: sdp
        });
      });

      r.peer.rtc.on("connect", () => {        
        r.peer.connected();

        this.addPeer(r.peer);
        resolve(true);
      });

      setTimeout(() => {
        resolve(false);
      }, 4 * 1000);
    });
  }

  cleanPeers() {
    const deleteList = [];
    for (let key in this.peerList) {
      if (this.peerList[key].isDisconnected) deleteList.push(key);
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
        const targetList = json.data;
        this.connectPeers(targetList);
        break;
      case def.BROADCAST:
        if (this.onBroadCast(packet)) {
          const broadcastData = json.data;      

          switch (broadcastData.tag) {
            case def.MESH_OFFER: {
              const to = broadcastData.data.to;
              if (to === this.nodeId) {
                const from = broadcastData.data.from;
                const sdp = broadcastData.data.sdp;
                if (!this.state.isMeshAnswer) {
                  this.state.isMeshAnswer = true;
                  this.ref.peer = new WebRTC("answer");
                  (async () => {
                    const result = await this.answer(from, sdp, this.ref);
                    if (!result) {                      
                      console.log("mesh answer fail");
                    }
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
                this.ref.peer.rtc.signal(sdp);
              }
              break;
            }
            case def.MESH_MESSAGE:
              this.ev.emit(def.ONCOMMAND, broadcastData.data);
              break;
          }
        }
        break;
    }
    this.cleanPeers();
  }
}
