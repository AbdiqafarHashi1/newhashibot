import assert from 'node:assert/strict';
import { parseBrokerOhlcv } from '../../src/lib/backtest/brokerCsv.ts';

const mt5Tsv = `<DATE>\t<TIME>\t<OPEN>\t<HIGH>\t<LOW>\t<CLOSE>\t<TICKVOL>\t<VOL>\t<SPREAD>
2026.08.07\t00:15:00\t1.15228\t1.15229\t1.15211\t1.15217\t99\t0\t0
2026.08.07\t00:00:00\t1.15237\t1.15259\t1.15214\t1.15228\t104\t0\t0`;
const mt5 = parseBrokerOhlcv(mt5Tsv);
assert.equal(mt5.length, 2);
assert.equal(mt5[0].time, '2026-08-07T00:00:00.000Z');
assert.equal(mt5[0].volume, 104);
assert.equal(mt5[1].close, 1.15217);

const quotedSemicolon = `timestamp;open;high;low;close;volume
"2026-08-07 00:00:00";"2,3500";"2,3600";"2,3400";"2,3550";42`;
const semicolon = parseBrokerOhlcv(quotedSemicolon);
assert.deepEqual(semicolon[0], { time: '2026-08-07T00:00:00.000Z', open: 2.35, high: 2.36, low: 2.34, close: 2.355, volume: 42 });

assert.throws(() => parseBrokerOhlcv('date,time,open,high\n2026-08-07,00:00,1,2'), /low, and close/);
console.log('brokerCsv tests passed');
