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
    console.log("my nodeId", this.nodeId);
    this.peerList = {};
    this.packetIdList = [];
    this.ref = {};
    this.state = {
      isConnectPeers: false,
      isMeshAnswer: false
    };
  }

  //メッシュネットワークにピアを加える
  addPeer(peer) {
    //データを受け取ったときの挙動
    peer.rtc.on("data", data => {
      this.onCommand(data);
    });
    //ピアのリストに追加
    this.peerList[peer.nodeId] = peer;
    //メッシュネットワークの情報を聞く
    peer.send(
      JSON.stringify({
        type: def.LISTEN,
        id: this.nodeId
      })
    );
    console.log("peer list", this.getAllPeerId());
  }

  getAllPeerId() {
    this.cleanPeers();
    const idList = [];
    for (let key in this.peerList) {
      idList.push(key);
    }
    return idList;
  }

  broadCast(tag, data) {
    //ブロードキャストする
    this.onBroadCast(packetFormat(def.BROADCAST, { tag: tag, data: data }));
  }

  onBroadCast(packet) {
    const json = JSON.parse(packet);
    //このメッセージがすでに送信済みか調べる
    if (!JSON.stringify(this.packetIdList).includes(json.hash)) {
      this.packetIdList.push(json.hash);
      //知っている全ノードに送信
      for (let key in this.peerList) {
        this.peerList[key].send(packet);
      }
      return true;
    } else {
      return false;
    }
  }

  connectPeers(targetList) {
    if (!this.state.isConnectPeers) {
      (async () => {
        this.state.isConnectPeers = true;
        //targetListすべてに接続を試行
        for (let target of targetList) {
          if (!this.getAllPeerId().includes(target) && target !== this.nodeId) {
            this.ref.peer = new WebRTC("offer");
            //this.offer()が終わるまでawaitで待機
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
        //sdpを相手に確実に届けるためにブロードキャスト
        this.broadCast(def.MESH_OFFER, {
          from: this.nodeId,
          to: target,//宛先
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
          to: target, //offerしてきたノードに返す
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

  //データを受け取ったときの処理
  onCommand(packet) {
    const json = JSON.parse(packet);
    const type = json.type;
    switch (type) {
      case def.LISTEN:
        //ピアのリストを聞かれたとき
        //聞いてきたノードに返信する
        this.peerList[json.id].send(
          JSON.stringify({
            type: def.ON_LISTEN,
            data: this.getAllPeerId() //接続しているすべてのピアの情報を取得
          })
        );
        break;
      case def.ON_LISTEN:
        //ピアのリストの返信を受け取ったとき
        const targetList = json.data;
        //受け取ったリストに接続する
        this.connectPeers(targetList);
        break;
      case def.BROADCAST:
        //ブロードキャスト絡みの処理
        if (this.onBroadCast(packet)) {
          const broadcastData = json.data;

          switch (broadcastData.tag) {
            case def.MESH_OFFER: {
              //webrtcのofferを受け取った際の処理
              const to = broadcastData.data.to;
              //ブロードキャストされたデータが自分宛てであった場合
              if (to === this.nodeId) {
                const from = broadcastData.data.from;
                const sdp = broadcastData.data.sdp;
                if (!this.state.isMeshAnswer) {
                  this.state.isMeshAnswer = true;
                  this.ref.peer = new WebRTC("answer");
                  (async () => {
                    //answerの処理
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
              //webrtcのanswer sdpを受け取った際の処理
              const to = broadcastData.data.to;
              //ブロードキャストのデータがこのノードあてだった場合
              if (to === this.nodeId) {
                const sdp = broadcastData.data.sdp;
                //接続完了処理
                this.ref.peer.rtc.signal(sdp);
              }
              break;
            }
            case def.MESH_MESSAGE:
              //その他のデータを受け取ったときの処理
              //イベントを起こす
              this.ev.emit(def.ONCOMMAND, broadcastData.data);
              break;
          }
        }
        break;
    }
    //切断されたピアを削除
    this.cleanPeers();
  }
}
