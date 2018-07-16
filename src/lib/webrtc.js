import wrtc from "wrtc";
import simplePeer from "simple-peer";
import * as fileHelper from "./fileHelper";
import Events from "events";
import * as format from "../constants/format";

const config = {
  iceServers: [
    {
      urls: "stun:stun.l.google.com:19302"
    }
  ]
};

export default class webrtc {
  constructor(_type) {
    this.rtc = undefined;
    this.nodeId = undefined;
    this.isConnected = false;
    this.isDisconnected = false;
    this.type = _type;
    this.ref = {};
    this.ev = new Events.EventEmitter();
    switch (_type) {
      case "offer":
        //console.log("webrtc", "offer");
        this.initOffer();
        break;
      case "answer":
        //console.log("webrtc", "answer");
        this.initAnswer();
        break;
      default:
        console.log("no type error");
        break;
    }
  }

  initOffer() {
    this.rtc = new simplePeer({
      initiator: true,
      config: config,
      trickle: false,
      wrtc: wrtc
    });
    this.init();
  }
  initAnswer() {
    this.rtc = new simplePeer({
      initiator: false,
      config: config,
      trickle: false,
      wrtc: wrtc
    });
    this.init();
  }

  init() {
    this.rtc.on("data", data => {
      const network = JSON.parse(data);
      console.log("webrtc received", network);
      if (network.type === "FILE") {
        this.ref.answer = new simplePeer({
          initiator: false,
          config: config,
          trickle: false,
          wrtc: wrtc
        });
        this.ref.answer.signal(network.data);
        this.ref.answer.on("signal", sdp => {
          this.send(format.packetFormat("FILE_R", sdp));
        });
        const buffer = [];
        this.ref.answer.on("data", ab => {
          const blob = new Blob([ab]);
          const reader = new FileReader();
          reader.onload = e => {
            if (e.target.result === "end") {
              this.ev.emit("receive", buffer);
            } else {
              buffer.push(ab);
            }
          };
          reader.readAsText(blob);
        });
      } else if (network.type === "FILE_R") {
        this.ref.offer.signal(network.data);
      }
    });

    this.rtc.on("error", err => {
      console.log("error:" + this.nodeId, err);
    });

    this.rtc.on("close", () => {
      this.isDisconnected = true;
      console.log("webrtc closed", this.nodeId);
    });
  }

  connecting(targetId) {
    //console.log("webrtc_connecting", targetId);
    this.nodeId = targetId;
    this.isConnected = false;
  }

  connected() {
    //console.log("webrtc", "connected", this.targetId);
    this.isConnected = true;
  }

  disconnected() {
    //console.log("webrtc", "disconnected", this.targetId);
    this.isConnected = false;
    this.isDisconnected = true;
  }

  send(data) {
    try {
      this.rtc.send(data);
      return true;
    } catch (error) {
      this.disconnected();
      return false;
    }
  }

  async sendFile(blob) {
    const arr = await fileHelper.getSliceArrayBuffer(blob);
    this.ref.offer = new simplePeer({
      initiator: true,
      config: config,
      trickle: false,
      wrtc: wrtc
    });
    this.ref.offer.on("signal", sdp => {
      this.send(format.packetFormat("FILE", sdp));
    });
    this.ref.offer.on("connect", () => {
      arr.forEach(ab => this.ref.offer.send(ab));
      this.ref.offer.send("end");
    });
  }
}
