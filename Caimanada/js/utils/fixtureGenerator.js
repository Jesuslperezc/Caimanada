// js/utils/fixtureGenerator.js

export function generateLeagueFixture(leagueId, teams, isIdaYVuelta) {
    const matches = [];
    let matchDate = new Date();
    matchDate.setDate(matchDate.getDate() + 1);
    matchDate.setHours(16, 0, 0, 0);

    for (let i = 0; i < teams.length; i++) {
        for (let j = i + 1; j < teams.length; j++) {
            matches.push({
                id: `match_${Date.now()}_${i}_${j}`,
                leagueId,
                homeTeamId: teams[i].id,
                awayTeamId: teams[j].id,
                date: matchDate.toISOString(),
                status: 'pending',
                round: 1
            });

            if (isIdaYVuelta) {
                const returnDate = new Date(matchDate);
                returnDate.setDate(returnDate.getDate() + Math.ceil(teams.length / 2));
                matches.push({
                    id: `match_${Date.now()}_${j}_${i}_v`,
                    leagueId,
                    homeTeamId: teams[j].id,
                    awayTeamId: teams[i].id,
                    date: returnDate.toISOString(),
                    status: 'pending',
                    round: 2
                });
            }
            matchDate.setDate(matchDate.getDate() + 1);
        }
    }
    return matches;
}

export function generateEliminationBracket(leagueId, teams, maxTeams) {
    const matches = [];
    const totalRounds = Math.log2(maxTeams);
    let matchDate = new Date();
    matchDate.setDate(matchDate.getDate() + 1);
    matchDate.setHours(16, 0, 0, 0);

    for (let i = 0; i < teams.length; i += 2) {
        matches.push({
            id: `match_r1_${Date.now()}_${i}`,
            leagueId,
            homeTeamId: teams[i].id,
            awayTeamId: teams[i + 1].id,
            date: matchDate.toISOString(),
            status: 'pending',
            round: 1
        });
        matchDate.setDate(matchDate.getDate() + 1);
    }

    let matchesInCurrentRound = teams.length / 2;
    for (let round = 2; round <= totalRounds; round++) {
        const matchesInThisRound = matchesInCurrentRound / 2;
        for (let i = 0; i < matchesInThisRound; i++) {
            matches.push({
                id: `match_r${round}_${Date.now()}_${i}`,
                leagueId,
                homeTeamId: 'TBD',
                awayTeamId: 'TBD',
                date: matchDate.toISOString(),
                status: 'pending',
                round: round
            });
            matchDate.setDate(matchDate.getDate() + 1);
        }
        matchesInCurrentRound = matchesInThisRound;
    }

    const finalMatches = [];
    for (let r = 1; r < totalRounds; r++) {
        const currentRoundMatches = matches.filter(m => m.round === r);
        const nextRoundMatches = matches.filter(m => m.round === r + 1);
        
        currentRoundMatches.forEach((match, index) => {
            match.winnerGoesToMatchId = nextRoundMatches[Math.floor(index / 2)].id;
            match.slot = index % 2 === 0 ? 'home' : 'away';
            finalMatches.push(match);
        });
    }
    
    const finalMatch = matches.find(m => m.round === totalRounds);
    if(finalMatch) {
        finalMatch.winnerGoesToMatchId = null;
        finalMatch.slot = null;
        finalMatches.push(finalMatch);
    }

    return finalMatches;
}