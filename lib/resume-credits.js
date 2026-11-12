'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const {ResumeError} = require('./resume-error');

const CREDIT_SCALE = 100000000n;
const TOKENS_PER_UNIT = 10000;

function validateCreditRate(value = 1) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < .0001 || value > 1000000
      || Number(value.toFixed(4)) !== value) {
    throw new ResumeError('INVALID_INPUT','每万 Token 积分须为 0.0001–1000000 之间的数字，最多 4 位小数。');
  }
  return value;
}

function normalizeUsage(value) {
  if (!value || typeof value !== 'object') return null;
  const token = x => Number.isSafeInteger(x) && x >= 0 && x <= 1000000000;
  const input = value.prompt_tokens ?? value.input_tokens;
  const output = value.completion_tokens ?? value.output_tokens;
  const total = value.total_tokens ?? (token(input) && token(output) ? input + output : undefined);
  if (!token(total) || (input !== undefined && !token(input)) || (output !== undefined && !token(output))
      || (token(input) && token(output) && input + output !== total)) return null;
  return {inputTokens:input ?? null,outputTokens:output ?? null,totalTokens:total};
}

function creditAmount(totalTokens, rate = 1) {
  if (!Number.isSafeInteger(totalTokens) || totalTokens < 0) throw new ResumeError('INVALID_INPUT','Token 用量无效。');
  validateCreditRate(rate);
  // Four rate decimals and 10,000 tokens per unit give eight exact credit decimals.
  const units = BigInt(totalTokens) * BigInt(Math.round(rate * 10000));
  return {creditUnits:units.toString(),credits:Number(units) / Number(CREDIT_SCALE)};
}

function usageFile() {
  return process.env.RESUME_USAGE_FILE || path.join(process.env.RESUME_SETTINGS_FILE
    ? path.dirname(process.env.RESUME_SETTINGS_FILE) : path.join(__dirname,'../.local/resume-expert'),'usage.jsonl');
}

function createUsageStore({file = usageFile} = {}) {
  let queue = Promise.resolve();
  let recordingError = false;
  const filename = () => typeof file === 'function' ? file() : file;
  async function readRecords(target) {
    let content;
    try { content = await fs.readFile(target,'utf8'); }
    catch (error) { if (error.code === 'ENOENT') return []; throw error; }
    return content.split('\n').filter(Boolean).map(line => {
      const record = JSON.parse(line);
      if (record.version !== 1 || typeof record.id !== 'string'
          || (record.creditUnits !== null && !/^\d+$/.test(record.creditUnits))) throw new Error('Invalid usage ledger');
      return record;
    });
  }
  function record({id,operation,model,outcome,usage,creditsPer10kTokens = 1,actorId = null}) {
    const target = filename();
    const task = queue.then(async () => {
      const records = await readRecords(target);
      const existing = records.find(item => item.id === id);
      if (existing) return existing;
      const amount = usage ? creditAmount(usage.totalTokens,creditsPer10kTokens) : {creditUnits:null,credits:null};
      const entry = {version:1,id,createdAt:new Date().toISOString(),actorId,operation,model,outcome,
        usage,creditsPer10kTokens,...amount};
      await fs.mkdir(path.dirname(target),{recursive:true,mode:0o700});
      await fs.appendFile(target,JSON.stringify(entry)+'\n',{mode:0o600});
      return entry;
    });
    queue = task.catch(() => { recordingError = true; });
    return task;
  }
  async function summary() {
    await queue;
    try {
      const records = await readRecords(filename());
      let units = 0n, totalTokens = 0, inputTokens = 0, outputTokens = 0, reportedRequests = 0;
      let inputKnown = true, outputKnown = true;
      for (const entry of records) {
        if (!entry.usage) continue;
        reportedRequests++;
        units += BigInt(entry.creditUnits);
        totalTokens += entry.usage.totalTokens;
        inputTokens += entry.usage.inputTokens || 0;
        outputTokens += entry.usage.outputTokens || 0;
        if (entry.usage.inputTokens === null) inputKnown = false;
        if (entry.usage.outputTokens === null) outputKnown = false;
      }
      return {requests:records.length,reportedRequests,unreportedRequests:records.length-reportedRequests,
        totalTokens,inputTokens:inputKnown?inputTokens:null,outputTokens:outputKnown?outputTokens:null,
        recordingError,creditUnits:units.toString(),credits:Number(units)/Number(CREDIT_SCALE),
        records:records.slice(-20).reverse()};
    } catch { throw new ResumeError('USAGE_UNAVAILABLE','积分消耗记录暂时无法读取，请检查本机存储。',503); }
  }
  return {record,summary};
}

module.exports = {TOKENS_PER_UNIT,validateCreditRate,normalizeUsage,creditAmount,createUsageStore};
