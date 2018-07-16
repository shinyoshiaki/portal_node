import SparkMD5 from "spark-md5";

export function getMD5(file) {
  return new Promise(resolve => {
    const r = new FileReader(),
      blobSlice = File.prototype.slice,
      chunkSize = 2097152,
      chunks = Math.ceil(file.size / chunkSize),
      spark = new SparkMD5();
    let currentChunk = 0;

    r.onload = e => {
      spark.appendBinary(e.target.result);
      currentChunk++;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        console.log("file hash", spark.end());
        resolve(spark.end());
      }
    };
    function loadNext() {
      const start = currentChunk * chunkSize;
      const end =
        start + chunkSize >= file.size ? file.size : start + chunkSize;
      r.readAsBinaryString(blobSlice.call(file, start, end));
    }
    loadNext();
  });
}

export function getFile(file) {
  return new Promise(resolve => {
    const r = new FileReader();
    r.onload = e => {
      resolve(e.target.result);
    };
    r.readAsArrayBuffer(file);
  });
}

export function getSliceArrayBuffer(file) {
  console.log("blob file", file);
  return new Promise((resolve, reject) => {
    let arr = [];
    const r = new FileReader(),
      blobSlice = File.prototype.slice,
      chunkSize = 16384,
      chunks = Math.ceil(file.size / chunkSize);
    let currentChunk = 0;
    r.onerror = e => {
      console.log("get slice file error", e);
      reject();
    };
    r.onload = e => {
      arr.push(e.target.result);
      currentChunk++;
      if (currentChunk < chunks) {
        loadNext();
      } else {
        resolve(arr);
      }
    };
    function loadNext() {
      const start = currentChunk * chunkSize;
      const end =
        start + chunkSize >= file.size ? file.size : start + chunkSize;
      r.readAsArrayBuffer(blobSlice.call(file, start, end));
    }
    loadNext();
  });
}
