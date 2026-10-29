const test = require('node:test');
const assert = require('node:assert/strict');
const { buildArchive } = require('../src/archive');

const elections = [
  { id: 'e1', name: 'Council 2026', opens_at: '2026-09-01T00:00:00Z', closes_at: '2026-09-10T00:00:00Z' },
  { id: 'e2', name: 'Empty election', opens_at: '2026-08-01T00:00:00Z', closes_at: '2026-08-05T00:00:00Z' },
  { id: 'e3', name: 'Tied election', opens_at: '2026-07-01T00:00:00Z', closes_at: '2026-07-05T00:00:00Z' },
];

const candidate = (election_id, id, name, votes) => ({
  election_id, id, name, role: null, color: null, symbol: null, photo_url: null, votes,
});

const candidates = [
  candidate('e1', 'b', 'Bob', 4),
  candidate('e1', 'a', 'Alice', 6),
  candidate('e2', 'c', 'Cara', 0),
  candidate('e3', 'd', 'Dan', 3),
  candidate('e3', 'f', 'Fay', 3),
];

const [council, empty, tied] = buildArchive(elections, candidates);

test('totals votes and picks the winner', () => {
  assert.equal(council.totalVotes, 10);
  assert.deepEqual(council.leaders, ['Alice']);
});

test('computes percentages and orders candidates by votes', () => {
  assert.deepEqual(council.results.map((r) => r.name), ['Alice', 'Bob']);
  assert.deepEqual(council.results.map((r) => r.percentage), [60, 40]);
});

test('an election with no votes has no winner and 0% everywhere', () => {
  assert.deepEqual(empty.leaders, []);
  assert.equal(empty.results[0].percentage, 0);
});

test('a tie reports every leader', () => {
  assert.deepEqual(tied.leaders, ['Dan', 'Fay']);
});

test('never exposes anything about individual voters', () => {
  const serialized = JSON.stringify(buildArchive(elections, candidates));
  assert.ok(!/user|email|receipt/i.test(serialized));
});