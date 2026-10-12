// Pure helper that shapes raw database rows into the public archive
// response. Kept separate from the route so it can be tested without a
// database. Only aggregate results are ever returned — never anything that
// could link a voter to a choice.
function buildArchive(electionRows, candidateRows) {
  return electionRows.map((e) => {
    const rows = candidateRows.filter((c) => c.election_id === e.id);
    const totalVotes = rows.reduce((sum, c) => sum + c.votes, 0);
    const topVotes = rows.reduce((max, c) => Math.max(max, c.votes), 0);

    return {
      id: e.id,
      name: e.name,
      opensAt: e.opens_at,
      closesAt: e.closes_at,
      totalVotes,
      leaders: topVotes > 0 ? rows.filter((c) => c.votes === topVotes).map((c) => c.name) : [],
      results: [...rows]
        .sort((a, b) => b.votes - a.votes || a.name.localeCompare(b.name))
        .map((c) => ({
          candidateId: c.id,
          name: c.name,
          role: c.role,
          color: c.color,
          symbol: c.symbol,
          photoUrl: c.photo_url,
          votes: c.votes,
          percentage: totalVotes > 0 ? Number(((c.votes / totalVotes) * 100).toFixed(1)) : 0,
        })),
    };
  });
}

module.exports = { buildArchive };