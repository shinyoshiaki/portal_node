import wrtc from "wrtc";
import Events from "events";

export default class WebRTC {
  constructor() {
    this.rtc = null;
    this.dataChannel = null;
    this.type = "";
    this.ev = new Events.EventEmitter();
    this.nodeId = null;
    this.isConnected = false;
    this.onicecandidate = false;
    this.isDisconnected = false;
  }

  createDatachannel(peerConnection, label) {
    try {
      const dataChannel = peerConnection.createDataChannel(label, {
        reliable: true
      });
      return dataChannel;
    } catch (dce) {
      console.log("dc established error: " + dce.message);
    }
  }

  dataChannelEvents(channel) {
    channel.onopen = () => {
      //console.log(channel);
      console.log("dc opened");
      this.ev.emit("connect");
    };
    channel.onmessage = event => {
      //console.log("Received message:" + event.data);
      this.ev.emit("data", event.data);
    };
    channel.onerror = err => {
      console.log("Datachannel Error: " + err);
    };
    channel.onclose = () => {
      console.log("DataChannel is closed");
      this.isDisconnected = true;
    };
  }

  prepareNewConnection() {
    const pc_config = {
      iceServers: [{ urls: "stun:stun.webrtc.ecl.ntt.com:3478" }]
    };
    const peer = new wrtc.RTCPeerConnection(pc_config);

    peer.onicecandidate = evt => {
      if (!evt.candidate) {
        console.log("empty ice event");
        if (!this.onicecandidate) {
          this.onicecandidate = true;
          this.ev.emit("signal", peer.localDescription);
        }
      }
    };

    peer.ondatachannel = evt => {
      if (this.dataChannel === null) {
        this.dataChannel = evt.channel;
        this.dataChannelEvents(evt.channel);
      }
    };
    return peer;
  }

  makeOffer(label) {
    this.type = "offer";
    const peer = this.prepareNewConnection();
    // Offer側でネゴシエーションが必要になったときの処理
    peer.onnegotiationneeded = async () => {
      try {
        let offer = await peer.createOffer();
        await peer.setLocalDescription(offer);
      } catch (err) {
        console.error("setLocalDescription(offer) ERROR: ", err);
      }
    };
    this.dataChannel = this.createDatachannel(peer, label);
    this.dataChannelEvents(this.dataChannel, this.ev);
    this.rtc = peer;
  }

  setAnswer(sdp) {
    console.log("setAnswer", sdp);
    try {
      this.rtc.setRemoteDescription(sdp);
    } catch (err) {
      console.error("setRemoteDescription(answer) ERROR: ", err);
    }
  }

  // Answer SDPを生成する
  async makeAnswer(sdp) {
    this.type = "answer";
    const peerConnection = this.prepareNewConnection();
    try {
      //console.log("make answer", sdp);
      await peerConnection.setRemoteDescription(sdp);
      console.log("sending Answer. Creating remote session description...");
      try {
        const answer = await peerConnection.createAnswer();
        console.log("createAnswer() succsess in promise");
        await peerConnection.setLocalDescription(answer);
        console.log("setLocalDescription() succsess in promise");
      } catch (err) {
        console.error(err);
      }
    } catch (err) {
      console.error("setRemoteDescription(offer) ERROR: ", err);
    }
    this.rtc = peerConnection;
  }

  send(data) {
    try {
      this.dataChannel.send(data);
    } catch (error) {
      this.isDisconnected = true;
    }
  }

  connected() {
    this.isConnected = true;
  }

  connecting(nodeId) {
    this.nodeId = nodeId;
  }
}
