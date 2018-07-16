"use strict";
import WebRTC from "../lib/WebRTC";
import http from "http";
import socketio from "socket.io";
import client from "socket.io-client";
import Mesh from "../mesh/Mesh";
import sha1 from "sha1";
import publicIp from "public-ip";

const def = {
  OFFER: "OFFER",
  ANSWER: "ANSWER"
};

let peerOffer, peerAnswer;

export default class PortalNode {
  constructor(myPort, targetAddress, targetPort, isLocal) {
    this.myPort = myPort;
    this.myUrl = undefined;
    this.targetUrl = undefined;
    if (targetAddress != undefined && targetAddress.length > 0) {
      this.targetUrl = "http://" + targetAddress + ":" + targetPort;
    }
    this.nodeId = sha1(Math.random().toString());
    this.mesh = new Mesh(this.nodeId);

    //ローカルじゃなければpublicIpを取ってくる
    if (isLocal) {
      this.myUrl = "http://localhost:" + this.myPort;
    } else {
      (async () => {
        const result = await publicIp.v4();
        this.myUrl = `http://${result}:${this.myPort}`;
      })();
    }

    //サーバ側のsocket.ioを起動
    this.srv = http.Server();
    this.io = socketio(this.srv);
    this.srv.listen(this.myPort);

    this.io.on("connection", socket => {
      //クライアント側がofferしてきたらanswerをする
      socket.on(def.OFFER, data => {
        this.answerFirst(data, socket.id);
      });
    });

    if (this.targetUrl !== undefined) {
      const socket = client.connect(this.targetUrl);
      //サーバ側のsocketに接続できたらofferする。
      socket.on("connect", () => {
        this.offerFirst(socket);
      });

      //サーバ側のsocketからanswer sdpが来たら接続完了処理
      socket.on(def.ANSWER, data => {
        peerOffer.rtc.signal(data.sdp);
        peerOffer.connecting(data.nodeId);
      });
    }
  }

  offerFirst(socket) {
    console.log("@cli", "offer first");
    peerOffer = new WebRTC();
    peerOffer.makeOffer("json");

    peerOffer.ev.on("signal", sdpValue => {
      socket.emit(def.OFFER, {
        nodeId: this.nodeId,
        sdp: sdpValue
      });
    });

    peerOffer.ev.on("connect", () => {
      peerOffer.connected();
      setTimeout(() => {
        this.mesh.addPeer(peerOffer);
      }, 1 * 1000);
    });
  }

  //webrtcのanswer側
  answerFirst(data, socketId) {
    return new Promise(resolve => {
      peerAnswer = new WebRTC();
      peerAnswer.makeAnswer(data.sdp);

      peerAnswer.connecting(data.nodeId);

      setTimeout(() => {
        resolve(false);
      }, 3 * 1000);

      //sdpの生成完了時
      peerAnswer.ev.on("signal", sdp => {
        //offerを送ってきたクライアント側にanswer sdpを返す
        console.log("answer signal", socketId);
        this.io.sockets.sockets[socketId].emit(def.ANSWER, {
          sdp: sdp,
          nodeId: this.nodeId
        });
      });

      //接続完了時
      peerAnswer.ev.on("connect", () => {
        peerAnswer.connected();
        //メッシュネットワークに加える
        setTimeout(() => {
          this.mesh.addPeer(peerAnswer);
        }, 1 * 1000);
        resolve(true);
      });
    });
  }
}
