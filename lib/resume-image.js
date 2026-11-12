'use strict';
const {ResumeError} = require('./resume-error');

function imageDescriptor(bytes) {
  let mime, width, height;
  if (bytes.length >= 24 && bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) {
    mime = 'image/png';
    if (bytes.toString('ascii',12,16) !== 'IHDR') throw new ResumeError('INVALID_IMAGE','PNG 图片已损坏，请重新截图。');
    width = bytes.readUInt32BE(16); height = bytes.readUInt32BE(20);
    let offset = 8, ended = false;
    while (offset + 12 <= bytes.length) {
      const length = bytes.readUInt32BE(offset), chunk = bytes.toString('ascii',offset+4,offset+8);
      if (length > bytes.length-offset-12) break;
      if (chunk === 'acTL') throw new ResumeError('INVALID_IMAGE','请使用静态截图，不支持动态图片。');
      offset += length+12;
      if (chunk === 'IEND') {ended = true;break;}
    }
    if (!ended) throw new ResumeError('INVALID_IMAGE','PNG 图片不完整，请重新截图。');
  } else if (bytes.length >= 4 && bytes[0] === 255 && bytes[1] === 216) {
    mime = 'image/jpeg';
    let offset = 2;
    while (offset + 3 < bytes.length && bytes[offset] === 255) {
      while (bytes[offset] === 255) offset++;
      const marker = bytes[offset++];
      if (marker === 217 || marker === 218) break;
      if (marker === 1 || marker >= 208 && marker <= 216) continue;
      if (offset + 2 > bytes.length) break;
      const length = bytes.readUInt16BE(offset);
      if (length < 2 || offset + length > bytes.length) break;
      if (marker >= 192 && marker <= 207 && ![196,200,204].includes(marker) && length >= 8) {
        height = bytes.readUInt16BE(offset+3); width = bytes.readUInt16BE(offset+5); break;
      }
      offset += length;
    }
  } else if (bytes.length >= 25 && bytes.toString('ascii',0,4) === 'RIFF' && bytes.toString('ascii',8,12) === 'WEBP') {
    mime = 'image/webp';
    const chunk = bytes.toString('ascii',12,16);
    if (chunk === 'VP8X' && bytes.length >= 30) {
      if (bytes[20] & 2) throw new ResumeError('INVALID_IMAGE','请使用静态截图，不支持动态图片。');
      width = bytes.readUIntLE(24,3)+1; height = bytes.readUIntLE(27,3)+1;
    } else if (chunk === 'VP8 ' && bytes.length >= 30 && bytes.subarray(23,26).equals(Buffer.from([157,1,42]))) {
      width = bytes.readUInt16LE(26)&16383; height = bytes.readUInt16LE(28)&16383;
    } else if (chunk === 'VP8L' && bytes[20] === 47) {
      const size = bytes.readUInt32LE(21);
      width = (size&16383)+1; height = (size>>>14&16383)+1;
    }
  } else return null;
  if (!width || !height) throw new ResumeError('INVALID_IMAGE','图片已损坏或无法读取，请重新截图。');
  if (width > 20000 || height > 20000 || width * height > 40000000) throw new ResumeError('IMAGE_TOO_LARGE','图片尺寸过大，请裁剪到需要识别的区域后重试。');
  return {mime,width,height};
}

module.exports = {imageDescriptor};
