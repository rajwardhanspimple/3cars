import test from 'node:test';
import assert from 'node:assert/strict';
import { LocalRecords } from '../src/storage.js';

const KEY = '3cars.records';
class MemStorage {
  constructor(seed = {}) { this.m = new Map(Object.entries(seed)); this.sets = 0; this.threw = false; }
  getItem(k) { if (this.throwGet) throw new Error('blocked'); return this.m.has(k) ? this.m.get(k) : null; }
  setItem(k, v) { this.sets += 1; if (this.throwAfterProbe && this.sets > 1) throw new Error('quota'); this.m.set(k, String(v)); }
  removeItem(k) { this.m.delete(k); }
}

const ok = { carId: 'vortex', weather: 'dry', position: 1, time: 61.2, penalty: 0, bestLap: 61.2, finishedAt: '2026-09-21T10:00:00Z' };

test('defaults and settings round-trip', () => {
  const s = new MemStorage();
  const r = new LocalRecords(s);
  assert.deepEqual(r.loadSettings(), { carId: 'vortex', weather: 'dry', muted: false, quality: 'high' });
  assert.equal(r.saveSettings({ carId: 'apex', weather: 'wet', muted: true, quality: 'medium' }), true);
  assert.deepEqual(new LocalRecords(s).loadSettings(), { carId: 'apex', weather: 'wet', muted: true, quality: 'medium' });
});

test('invalid settings are rejected and blocked storage stays false', () => {
  const r = new LocalRecords(new MemStorage());
  assert.equal(r.saveSettings({ carId: 'ghost' }), false);
  const b = new LocalRecords(new MemStorage({})); b._storage.throwGet = true;
  assert.equal(b.available, false);
  assert.equal(b.saveSettings({ carId: 'apex' }), false);
});

test('corruption and unsupported version fall back safely', () => {
  const bad = new LocalRecords(new MemStorage({ [KEY]: '{x' }));
  assert.deepEqual(bad.loadSettings(), { carId: 'vortex', weather: 'dry', muted: false, quality: 'high' });
  assert.equal(bad.results().length, 0);
  const ver = new LocalRecords(new MemStorage({ [KEY]: JSON.stringify({ version: 2, settings: { carId: 'apex' }, results: [ok], bests: { apex: { dry: 61.2 } } }) }));
  assert.equal(ver.results().length, 0);
  assert.equal(ver.bestLap('apex', 'dry'), null);
});

test('quota writes fail after probe and mark unavailable', () => {
  const r = new LocalRecords(new MemStorage()); r._storage.throwAfterProbe = true;
  assert.equal(r.saveSettings({ muted: true }), false);
  assert.equal(r.available, false);
});

test('history is capped at 20 and best laps remain all time by car and weather', () => {
  const r = new LocalRecords(new MemStorage());
  assert.equal(r.recordRace(ok), true);
  assert.equal(r.recordRace({ ...ok, weather: 'wet', bestLap: 58.5, finishedAt: '2026-09-21T10:01:00Z' }), true);
  assert.equal(r.bestLap('vortex', 'dry'), 61.2);
  assert.equal(r.bestLap('vortex', 'wet'), 58.5);
  for (let i = 2; i <= 21; i += 1) assert.equal(r.recordRace({ ...ok, time: 70 + i, bestLap: 70 + i, finishedAt: `2026-09-21T10:${String(i).padStart(2, '0')}:00Z` }), true);
  assert.equal(r.results().length, 20);
  assert.equal(r.bestLap('vortex', 'dry'), 61.2);
});

test('invalid races are rejected and valid rows preserve shape', () => {
  const r = new LocalRecords(new MemStorage());
  assert.equal(r.recordRace({ ...ok, time: NaN }), false);
  assert.equal(r.recordRace({ ...ok, time: -1 }), false);
  assert.equal(r.recordRace({ ...ok, bestLap: null, finishedAt: { self: null } }), false);
  assert.equal(r.recordRace({ ...ok, extra: true }), false);
  assert.equal(r.recordRace(ok), true);
  assert.deepEqual(r.results()[0], ok);
});