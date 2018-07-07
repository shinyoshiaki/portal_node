import wrtc from "wrtc";
import simplePeer from "simple-peer";

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

export default class webrtc {
  constructor(_type) {
    this.rtc;
    this.nodeId;
    this.isConnected = false;
    this.isDisconnected = false;
    this.type = _type;
    switch (_type) {
      case "offer":
        this.initOffer();
        break;
      case "answer":
        this.initAnswer();
        break;
    }

    this.rtc.on("error", err => {
      console.log("webrtc error", err);
    });
  }

  initOffer() {
    this.rtc = new simplePeer({
      initiator: true,
      config: config,
      trickle: false,
      wrtc: wrtc
    });
  }
  initAnswer() {
    this.rtc = new simplePeer({
      initiator: false,
      config: config,
      trickle: false,
      wrtc: wrtc
    });
  }

  connecting(nodeId) {
    this.nodeId = nodeId;
  }

  connected() {
    this.isConnected = true;
  }

  send(data) {
    try {
      this.rtc.send(data);
      return true;
    } catch (error) {
      console.log("send error");
      this.disconnected();
      return false;
    }
  }

  disconnected() {
    console.log("webrtc", "disconnected", this.targetId);
    this.isConnected = false;
    this.isDisconnected = true;
  }
}
