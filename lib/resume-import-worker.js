'use strict';
const { parentPort, workerData } = require('node:worker_threads');
(async () => {
  try {
    const bytes = Buffer.from(workerData.bytes);
    let text;
    if (workerData.type === 'pdf') {
      const parse = require('pdf-parse/lib/pdf-parse.js');
      text = (await parse(bytes, { max: 40 })).text;
    } else {
      const mammoth = require('mammoth');
      text = (await mammoth.extractRawText({ buffer: bytes })).value;
    }
    parentPort.postMessage({ text: text.slice(0, 50001) });
  } catch { parentPort.postMessage({ error: true }); }
})();
