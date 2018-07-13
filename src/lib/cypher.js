import keypair from "keypair";
import crypto from "crypto";

export default class Cypher {
  constructor(secretKey = null, publicKey) {
    this.publicKey = "";
    this.secretKey = "";
    if (secretKey != null) {
      this.publicKey = publicKey;
      this.secretKey = secretKey;
    } else {
      const pair = keypair();
      this.publicKey = pair.public;
      this.secretKey = pair.private;
    }
  }

  encrypt(raw) {
    const encrypted = crypto.privateEncrypt(
      this.secretKey,
      new Buffer.from(raw)
    );
    return encrypted.toString("base64");
  }

  decrypt(encrypted, publicKey) {
    const decrypted = crypto.publicDecrypt(
      publicKey,
      new Buffer.from(encrypted, "base64")
    );
    return decrypted.toString("utf8");
  }
}
