const ODDS_KEY = '53374f8933fdc16b45facdb194c56298';
const CLEAR_KEY = 'sk_live_Bsj-nITf7h_brX-IKkw_9Vk0f9tjtsoDMtul211zzq8';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const MARKETS = ['h2h','spreads','totals'];

// ── MATH HELPERS ──────────────────────────────────────────────────────────────
function americanToDecimal(p) { return p > 0 ? (p/100)+1 : (100/Math.abs(p))+1; }
function decimalToImplied(d) { return (1/d)*100; }
function removeVig(probs) {
  const total = probs.reduce((a,b) => a+b, 0);
  return probs.map(p => p/total*100);
}
function fmt(n) { return n > 0 ? '+'+n : ''+n; }
function cleanBook(k) { return k.replace(/_us$/,'').replace(/_/g,' '); }
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
    +' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

// ── EV SCORE 1-10 ─────────────────────────────────────────────────────────────
// edgePct: how much better this line is vs sharp consensus (0-100 scale)
// bookCount: how many books available (more = more confidence)
// injuryPenalty: 0 (clean) to 3 (key player out)
function calcAutoScore(edgePct, bookCount, injuryPenalty = 0) {
  if (edgePct <= 0) return null;
  // Base score from edge size
  let score = 0;
  if (edgePct >= 8)      score = 10;
  else if (edgePct >= 6) score = 9;
  else if (edgePct >= 5) score = 8;
  else if (edgePct >= 4) score = 7;
  else if (edgePct >= 3) score = 6;
  else if (edgePct >= 2) score = 5;
  else if (edgePct >= 1) score = 4;
  else if (edgePct >= 0.5) score = 3;
  else score = 2;
  // Bonus for more books agreeing on the discrepancy
  if (bookCount >= 5) score = Math.min(10, score + 1);
  // Penalty for injury risk
  score = Math.max(1, score - injuryPenalty);
  return score;
}

// ── SHARP CONSENSUS ──────────────────────────────────────────────────────────
// Returns true probability (vig-removed) for each outcome based on sharp books only
function getSharpConsensus(outcomeBookMap, outcomeNames) {
  const sharpPrices = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    const sharpVals = SHARP_BOOKS.map(b => bookData[b]?.price).filter(Boolean);
    if (sharpVals.length) {
      sharpPrices[name] = sharpVals.reduce((a,b) => a+b,0) / sharpVals.length;
    }
  });

  const names = Object.keys(sharpPrices);
  if (names.length < 2) return null;

  const rawImplied = names.map(n => decimalToImplied(americanToDecimal(sharpPrices[n])));
  const trueProbs = removeVig(rawImplied);
  const result = {};
  names.forEach((n,i) => result[n] = trueProbs[i]);
  return result;
}

// ── DATA FETCHING ─────────────────────────────────────────────────────────────
let scoresCache = {};
let injuryCache = {}; // teamName -> penalty score

async function fetchScores(sport) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_KEY}&daysFrom=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(s => { scoresCache[s.id] = s; });
  } catch(e) {}
}

// Map sport key to ClearSports sport slug
function toClearSport(sport) {
  if (sport.includes('nfl') || sport.includes('ncaaf')) return 'nfl';
  if (sport.includes('nba') || sport.includes('ncaab')) return 'nba';
  if (sport.includes('mlb')) return 'mlb';
  if (sport.includes('nhl')) return 'nhl';
  if (sport.includes('soccer')) return 'soccer';
  return null;
}

async function fetchInjuries(sport) {
  const clearSport = toClearSport(sport);
  if (!clearSport) return;
  try {
    const url = `https://api.clearsportsapi.com/v1/${clearSport}/injuries`;
    const res = await fetch(url, { headers: { 'Authorization': `Bearer ${CLEAR_KEY}` }});
    if (!res.ok) return;
    const data = await res.json();
    // Build team -> penalty map based on how many key players are out/questionable
    const injuries = data.data || data.injuries || data || [];
    injuries.forEach(inj => {
      const team = inj.team?.name || inj.team;
      if (!team) return;
      if (!injuryCache[team]) injuryCache[team] = 0;
      const status = (inj.status || '').toLowerCase();
      if (status.includes('out')) injuryCache[team] = Math.min(3, injuryCache[team] + 1.5);
      else if (status.includes('questionable') || status.includes('doubtful')) {
        injuryCache[team] = Math.min(3, injuryCache[team] + 0.5);
      }
    });
  } catch(e) {}
}

// ── MAIN FETCH ────────────────────────────────────────────────────────────────
async function fetchOdds() {
  const sport = document.getElementById('sport-sel').value;
  const minBooks = parseInt(document.getElementById('min-books').value);
  const container = document.getElementById('games-container');
  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');

  btn.disabled = true;
  btn.textContent = 'Fetching...';
  container.innerHTML = '<p class="status-msg">Loading live odds and injury data...</p>';
  scoresCache = {};
  injuryCache = {};

  try {
    await Promise.all([fetchScores(sport), fetchInjuries(sport)]);

    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_KEY}&regions=us&markets=${MARKETS.join(',')}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
    const res = await fetch(url);

    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) {
      apiNote.style.display = 'block';
      apiNote.textContent = `${used} requests used · ${remaining} remaining this month`;
    }

    if (!res.ok) throw new Error('API error ' + res.status);
    const data = await res.json();
    const filtered = data.filter(g => g.bookmakers.length >= minBooks);

    if (!filtered.length) {
      container.innerHTML = '<p class="status-msg">No games found with that many books. Try lowering the min books filter.</p>';
      return;
    }
    renderGames(filtered);
  } catch(e) {
    container.innerHTML = `<p class="status-msg">Could not load odds: ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch odds';
  }
}

// ── ODDS MAP ──────────────────────────────────────────────────────────────────
function buildOddsMap(game) {
  const map = { h2h:{}, spreads:{}, totals:{} };
  game.bookmakers.forEach(bm => {
    bm.markets.forEach(mk => {
      if (!map[mk.key]) return;
      mk.outcomes.forEach(o => {
        if (!map[mk.key][o.name]) map[mk.key][o.name] = {};
        map[mk.key][o.name][bm.key] = { price: o.price, point: o.point };
      });
    });
  });
  return map;
}

// ── RENDER ────────────────────────────────────────────────────────────────────
function renderGames(games) {
  const container = document.getElementById('games-container');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'games-list';

  games.slice(0, 15).forEach((game, gi) => {
    const oddsMap = buildOddsMap(game);
    const booksPresent = [...new Set(game.bookmakers.map(b => b.key))];
    const scoreData = scoresCache[game.id] || null;
    const isLive = scoreData && !scoreData.completed && scoreData.scores;

    // Injury penalties for each team
    const awayPenalty = Math.round(injuryCache[game.away_team] || 0);
    const homePenalty = Math.round(injuryCache[game.home_team] || 0);

    const card = document.createElement('div');
    card.className = 'game-card';

    // Scores
    const awayScore = scoreData?.scores?.find(s => s.name === game.away_team)?.score;
    const homeScore = scoreData?.scores?.find(s => s.name === game.home_team)?.score;
    const awayLeading = awayScore !== undefined && parseInt(awayScore) > parseInt(homeScore);
    const homeLeading = homeScore !== undefined && parseInt(homeScore) > parseInt(awayScore);

    // Injury badge helper
    const injBadge = (penalty) => {
      if (penalty <= 0) return '';
      const label = penalty >= 2 ? 'INJ' : 'Q';
      const cls = penalty >= 2 ? 'inj-out' : 'inj-q';
      return `<span class="inj-badge ${cls}">${label}</span>`;
    };

    card.innerHTML = `
      <div class="game-header">
        <div class="game-matchup">
          <div class="team-line">
            <span class="team-name${awayLeading?' leading':''}">${game.away_team}</span>
            ${injBadge(awayPenalty)}
            ${awayScore !== undefined ? `<span class="team-score${awayLeading?' leading':''}">${awayScore}</span>` : ''}
          </div>
          <div class="team-line">
            <span class="team-name${homeLeading?' leading':''}">${game.home_team}</span>
            ${injBadge(homePenalty)}
            ${homeScore !== undefined ? `<span class="team-score${homeLeading?' leading':''}">${homeScore}</span>` : ''}
          </div>
          <div class="game-sport">${game.sport_title}</div>
        </div>
        <div class="game-status-block">
          ${isLive ? '<div class="live-badge">LIVE</div>' : ''}
          <div class="game-time">${formatTime(game.commence_time)}</div>
        </div>
      </div>
    `;

    // Table
    const table = document.createElement('table');
    table.className = 'odds-table';

    // Column headers
    table.innerHTML = `<thead><tr>
      <th class="market-th">Market / Side</th>
      ${booksPresent.map(b => `<th class="book-th">${cleanBook(b)}</th>`).join('')}
      <th class="score-th">EV Score</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');

    const marketGroups = [
      { key: 'h2h', label: 'Moneyline' },
      { key: 'spreads', label: 'Spread' },
      { key: 'totals', label: 'Total' }
    ];

    marketGroups.forEach((mkt, mktIdx) => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;

      // Get sharp consensus true probabilities for this market
      const consensus = getSharpConsensus(oddsMap[mkt.key], outcomes);

      // Section divider
      if (mktIdx > 0) {
        const div = document.createElement('tr');
        div.className = 'section-divider';
        div.innerHTML = `<td colspan="${booksPresent.length + 2}"><span class="section-divider-label">${mkt.label}</span></td>`;
        tbody.appendChild(div);
      }

      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName];
        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;
        const sideLabel = outcomeName === game.home_team ? 'Home' :
                          outcomeName === game.away_team ? 'Away' : outcomeName;

        // Consensus true prob for this outcome
        const trueProb = consensus ? consensus[outcomeName] : null;

        // Best book edge vs consensus
        let bestEdge = 0;
        let bestBookScore = null;
        if (trueProb !== null && bestPrice !== null) {
          const bestImplied = decimalToImplied(americanToDecimal(bestPrice));
          bestEdge = trueProb - bestImplied; // positive = we're getting better than true price
          // Injury penalty: use the team losing a player (hurts their opponent's odds)
          const penalty = outcomeName === game.away_team ? homePenalty : awayPenalty;
          bestBookScore = calcAutoScore(bestEdge, booksPresent.length, penalty);
        }

        // Odds row
        const oddsRow = document.createElement('tr');
        oddsRow.innerHTML = `
          <td class="market-td">
            <div class="market-name">${oi === 0 ? `<strong>${mkt.label}</strong>` : ''}</div>
            <div class="market-side">${sideLabel}</div>
            ${trueProb ? `<div class="true-prob">True: ${trueProb.toFixed(1)}%</div>` : ''}
          </td>
          ${booksPresent.map(bookKey => {
            const d = bookData[bookKey];
            if (!d) return `<td class="odds-td empty">—</td>`;
            const isBest = d.price === bestPrice;
            const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
            const edgeVsConsensus = trueProb ? (trueProb - parseFloat(implied)).toFixed(1) : null;
            const isGoodEdge = edgeVsConsensus && parseFloat(edgeVsConsensus) > 0;
            return `
              <td class="odds-td${isBest ? ' best' : ''}${isGoodEdge ? ' edge' : ''}">
                ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.point>0?'+':''}${d.point}</div>` : ''}
                <div class="odds-val">${fmt(d.price)}</div>
                <div class="odds-implied">${implied}%</div>
                ${edgeVsConsensus ? `<div class="odds-edge ${isGoodEdge?'pos':'neg'}">${isGoodEdge?'+':''}${edgeVsConsensus}%</div>` : ''}
              </td>`;
          }).join('')}
          <td class="score-td">
            ${bestBookScore ? `<div class="ev-score s${bestBookScore}">${bestBookScore}</div>` : '<div class="ev-score-empty">—</div>'}
          </td>
        `;
        tbody.appendChild(oddsRow);
      });
    });

    table.appendChild(tbody);
    card.appendChild(table);
    list.appendChild(card);
  });

  container.appendChild(list);
}
