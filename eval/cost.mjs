#!/usr/bin/env node
// Usage: node eval/cost.mjs <pi|dsh> <log.jsonl>
// Sums token usage from a harness JSON log and prints one JSON line:
//   {"input":N,"output":N,"cacheRead":N,"cacheWrite":N,"usd":X,"unreported":N}
//
// Prices are USD per 1M tokens. Defaults are Claude Sonnet ($3 in / $15 out).
// Cache prices follow Anthropic's multipliers: write 1.25x input, read 0.1x input.
// Override with PRICE_IN, PRICE_OUT, PRICE_CACHE_WRITE, PRICE_CACHE_READ.
//
// pi  (--mode json): each {"type":"message_end"} with an assistant message carries
//                    message.usage {input, output, cacheRead, cacheWrite}.
// dsh (--json):      each {"type":"status","phase":"step_end"} carries
//                    usage {inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens}.
//                    DSH omits usage on a step it cannot total (a retried attempt).
//                    Those steps are counted in "unreported".
import { readFileSync, existsSync } from 'node:fs';

const [harness, file] = process.argv.slice(2);
if (!harness || !file) {
  console.error('usage: cost.mjs <pi|dsh> <log.jsonl>');
  process.exit(2);
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);
const price = {
  in: num(process.env.PRICE_IN ?? 3.0),
  out: num(process.env.PRICE_OUT ?? 15.0),
  cacheWrite: num(process.env.PRICE_CACHE_WRITE ?? 3.75),
  cacheRead: num(process.env.PRICE_CACHE_READ ?? 0.3),
};

const t = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, unreported: 0 };
const text = existsSync(file) ? readFileSync(file, 'utf8') : '';

for (const line of text.split('\n')) {
  if (!line.startsWith('{')) continue;
  let e;
  try { e = JSON.parse(line); } catch { continue; } // a line still being written
  if (harness === 'pi') {
    if (e.type !== 'message_end' || e.message?.role !== 'assistant') continue;
    const u = e.message.usage;
    if (!u) { t.unreported++; continue; }
    t.input += num(u.input); t.output += num(u.output);
    t.cacheRead += num(u.cacheRead); t.cacheWrite += num(u.cacheWrite);
  } else if (harness === 'dsh') {
    if (e.type !== 'status' || e.phase !== 'step_end') continue;
    const u = e.usage;
    if (!u) { t.unreported++; continue; }
    t.input += num(u.inputTokens); t.output += num(u.outputTokens);
    t.cacheRead += num(u.cacheReadTokens); t.cacheWrite += num(u.cacheWriteTokens);
  }
}

const usd = (t.input * price.in + t.output * price.out
  + t.cacheWrite * price.cacheWrite + t.cacheRead * price.cacheRead) / 1e6;
console.log(JSON.stringify({ ...t, usd: Number(usd.toFixed(4)) }));
