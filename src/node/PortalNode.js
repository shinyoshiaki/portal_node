"use strict";
import WebRTC from "../lib/webrtc";
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

    if (this.targetUrl !== undefined) {
      const socket = client.connect(this.targetUrl);
      socket.on("connect", () => {
        this.offerFirst(socket);
      });

      socket.on(def.ANSWER, data => {
        peerOffer.rtc.signal(data.sdp);
        peerOffer.connecting(data.nodeId);
      });
    }

    this.srv = http.Server();
    this.io = socketio(this.srv);
    this.srv.listen(this.myPort);

    this.io.on("connection", socket => {
      socket.on(def.OFFER, data => {
        this.answerFirst(data, socket.id);
      });
    });
  }

  answerFirst(data, socketId) {
    return new Promise(resolve => {
      peerAnswer = new WebRTC("answer");

      peerAnswer.connecting(data.nodeId);
      peerAnswer.rtc.signal(data.sdp);

      setTimeout(() => {
        resolve(false);
      }, 4 * 1000);

      peerAnswer.rtc.on("signal", sdp => {
        this.io.sockets.sockets[socketId].emit(def.ANSWER, {
          sdp: sdp,
          nodeId: this.nodeId
        });
      });

      peerAnswer.rtc.on("error", err => {
        console.log("error", err);
        resolve(false);
      });

      peerAnswer.rtc.on("connect", () => {
        peerAnswer.connected();
        this.mesh.addPeer(peerAnswer);
        resolve(true);
      });
    });
  }

  offerFirst(socket) {
    peerOffer = new WebRTC("offer");

    peerOffer.rtc.on("signal", sdp => {
      socket.emit(def.OFFER, {
        type: def.OFFER,
        nodeId: this.nodeId,
        sdp: sdp
      });
    });

    peerOffer.rtc.on("connect", () => {
      peerOffer.connected();
      this.mesh.addPeer(peerOffer);
    });
  }
}
