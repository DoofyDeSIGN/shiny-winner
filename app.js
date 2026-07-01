const ODDS_KEY = '53374f8933fdc16b45facdb194c56298';
const CLEAR_KEY = 'sk_live_Bsj-nITf7h_brX-IKkw_9Vk0f9tjtsoDMtul211zzq8';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const MARKETS = ['h2h','spreads','totals'];

function americanToDecimal(p) { return p > 0 ? (p/100)+1 : (100/Math.abs(p))+1; }
function decimalToImplied(d) { return (1/d)*100; }
function removeVig(probs) {
  const total = probs.reduce((a,b)=>a+b,0);
  return probs.map(p => p/total*100);
}
function fmt(n) { return n > 0 ? '+'+n : ''+n; }
function cleanBook(k) { return k.replace(/_us$/,'').replace(/_/g,' '); }
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
    +' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

function calcAutoScore(edgePct, bookCount, injuryPenalty=0) {
  if (edgePct <= 0) return null;
  let score;
  if (edgePct >= 8)       score = 10;
  else if (edgePct >= 6)  score = 9;
  else if (edgePct >= 5)  score = 8;
  else if (edgePct >= 4)  score = 7;
  else if (edgePct >= 3)  score = 6;
  else if (edgePct >= 2)  score = 5;
  else if (edgePct >= 1)  score = 4;
  else if (edgePct >= 0.5) score = 3;
  else score = 2;
  if (bookCount >= 5) score = Math.min(10, score+1);
  score = Math.max(1, score - injuryPenalty);
  return score;
}

function getSharpConsensus(outcomeBookMap, outcomeNames) {
  const sharpPrices = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    const vals = SHARP_BOOKS.map(b => bookData[b]?.price).filter(Boolean);
    if (vals.length) sharpPrices[name] = vals.reduce((a,b)=>a+b,0)/vals.length;
  });
  const names = Object.keys(sharpPrices);
  if (names.length < 2) return null;
  const rawImplied = names.map(n => decimalToImplied(americanToDecimal(sharpPrices[n])));
  const trueProbs = removeVig(rawImplied);
  const result = {};
  names.forEach((n,i) => result[n] = trueProbs[i]);
  return result;
}

// Check arbitrage: for each outcome, find its best price across all books
// If sum of implied probs < 100, it's arb
function checkArbitrage(outcomeNames, outcomeBookMap) {
  const bestPrices = {};
  const bestBooks = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    let best = -Infinity;
    let bestBook = null;
    Object.entries(bookData).forEach(([book, d]) => {
      if (d.price > best) { best = d.price; bestBook = book; }
    });
    bestPrices[name] = best;
    bestBooks[name] = bestBook;
  });

  const impliedSum = outcomeNames.reduce((sum, name) => {
    return sum + (bestPrices[name] > -Infinity ? decimalToImplied(americanToDecimal(bestPrices[name])) : 100);
  }, 0);

  const isArb = impliedSum < 100;
  const profit = isArb ? ((100 - impliedSum)).toFixed(2) : null;
  return { isArb, profit, bestPrices, bestBooks };
}

// Calculate arb stakes for guaranteed profit on a given total stake
function calcArbStakes(outcomeNames, bestPrices, totalStake=100) {
  const decimals = {};
  outcomeNames.forEach(n => decimals[n] = americanToDecimal(bestPrices[n]));
  const impliedSum = outcomeNames.reduce((s,n) => s + decimalToImplied(decimals[n]), 0);
  const stakes = {};
  outcomeNames.forEach(n => {
    stakes[n] = ((decimalToImplied(decimals[n]) / impliedSum) * totalStake).toFixed(2);
  });
  const worstReturn = Math.min(...outcomeNames.map(n => stakes[n] * decimals[n]));
  const guaranteedProfit = (worstReturn - totalStake).toFixed(2);
  return { stakes, guaranteedProfit };
}

let scoresCache = {};
let injuryCache = {};

async function fetchScores(sport) {
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_KEY}&daysFrom=1`);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(s => { scoresCache[s.id] = s; });
  } catch(e) {}
}

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
    const res = await fetch(`https://api.clearsportsapi.com/v1/${clearSport}/injuries`, {
      headers: { 'Authorization': `Bearer ${CLEAR_KEY}` }
    });
    if (!res.ok) return;
    const data = await res.json();
    const injuries = data.data || data.injuries || data || [];
    injuries.forEach(inj => {
      const team = inj.team?.name || inj.team;
      if (!team) return;
      if (!injuryCache[team]) injuryCache[team] = 0;
      const status = (inj.status||'').toLowerCase();
      if (status.includes('out')) injuryCache[team] = Math.min(3, injuryCache[team]+1.5);
      else if (status.includes('questionable')||status.includes('doubtful'))
        injuryCache[team] = Math.min(3, injuryCache[team]+0.5);
    });
  } catch(e) {}
}

async function fetchOdds() {
  const sport = document.getElementById('sport-sel').value;
  const minBooks = parseInt(document.getElementById('min-books').value);
  const container = document.getElementById('games-container');
  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');

  btn.disabled = true;
  btn.textContent = 'Fetching...';
  container.innerHTML = '<p class="status-msg">Scanning for edges and arbitrage...</p>';
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
      container.innerHTML = '<p class="status-msg">No games found. Try lowering the min books filter.</p>';
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

function renderGames(games) {
  const container = document.getElementById('games-container');
  container.innerHTML = '';

  let totalEdges = 0;
  let totalArbs = 0;
  const list = document.createElement('div');
  list.className = 'games-list';

  games.slice(0, 15).forEach((game, gi) => {
    const oddsMap = buildOddsMap(game);
    const booksPresent = [...new Set(game.bookmakers.map(b => b.key))];
    const scoreData = scoresCache[game.id] || null;
    const isLive = scoreData && !scoreData.completed && scoreData.scores;
    const awayPenalty = Math.round(injuryCache[game.away_team]||0);
    const homePenalty = Math.round(injuryCache[game.home_team]||0);

    // Build actionable rows first — only include rows with positive edge OR arb
    const actionableRows = [];

    const marketGroups = [
      { key:'h2h', label:'Moneyline' },
      { key:'spreads', label:'Spread' },
      { key:'totals', label:'Total' }
    ];

    marketGroups.forEach(mkt => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;

      const consensus = getSharpConsensus(oddsMap[mkt.key], outcomes);
      const arbResult = checkArbitrage(outcomes, oddsMap[mkt.key]);

      // If arb exists, mark all outcomes in this market
      if (arbResult.isArb) {
        totalArbs++;
        const arbStakes = calcArbStakes(outcomes, arbResult.bestPrices, 100);
        outcomes.forEach((outcomeName, oi) => {
          const bookData = oddsMap[mkt.key][outcomeName];
          const bestPrice = arbResult.bestPrices[outcomeName];
          const bestBook = arbResult.bestBooks[outcomeName];
          const trueProb = consensus ? consensus[outcomeName] : null;
          const sideLabel = outcomeName === game.home_team ? 'Home' :
                            outcomeName === game.away_team ? 'Away' : outcomeName;
          actionableRows.push({
            mkt, outcomeName, oi, bookData, bestPrice, trueProb, sideLabel,
            isArb: true, arbProfit: arbResult.profit, arbStakes, bestBook,
            booksPresent, score: 10
          });
        });
        return;
      }

      // Otherwise check each outcome for positive edge
      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName];
        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;
        const trueProb = consensus ? consensus[outcomeName] : null;
        const sideLabel = outcomeName === game.home_team ? 'Home' :
                          outcomeName === game.away_team ? 'Away' : outcomeName;

        if (!trueProb || !bestPrice) return;
        const bestImplied = decimalToImplied(americanToDecimal(bestPrice));
        const edgePct = trueProb - bestImplied;
        if (edgePct <= 0.5) return; // Only show meaningful edges

        const penalty = outcomeName === game.away_team ? homePenalty : awayPenalty;
        const score = calcAutoScore(edgePct, booksPresent.length, penalty);
        if (!score || score < 3) return; // Only show score 3+

        totalEdges++;
        actionableRows.push({
          mkt, outcomeName, oi, bookData, bestPrice, trueProb, sideLabel,
          isArb: false, edgePct, booksPresent, score
        });
      });
    });

    if (!actionableRows.length) return; // Skip games with no actionable bets

    const card = document.createElement('div');
    card.className = 'game-card';

    // Scores
    const awayScore = scoreData?.scores?.find(s=>s.name===game.away_team)?.score;
    const homeScore = scoreData?.scores?.find(s=>s.name===game.home_team)?.score;
    const awayLeading = awayScore !== undefined && parseInt(awayScore) > parseInt(homeScore);
    const homeLeading = homeScore !== undefined && parseInt(homeScore) > parseInt(awayScore);

    const injBadge = (p) => {
      if (p <= 0) return '';
      return p >= 2
        ? `<span class="inj-badge inj-out">INJ</span>`
        : `<span class="inj-badge inj-q">Q</span>`;
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

    // Rows
    const table = document.createElement('table');
    table.className = 'odds-table';

    const allBooks = [...new Set(actionableRows.flatMap(r => Object.keys(r.bookData)))];

    table.innerHTML = `<thead><tr>
      <th class="market-th">Bet</th>
      ${allBooks.map(b=>`<th class="book-th">${cleanBook(b)}</th>`).join('')}
      <th class="score-th">Score</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');

    actionableRows.forEach(row => {
      const { mkt, outcomeName, bookData, bestPrice, trueProb, sideLabel, isArb, arbProfit, arbStakes, bestBook, score, edgePct } = row;

      const tr = document.createElement('tr');
      if (isArb) tr.className = 'arb-row';

      tr.innerHTML = `
        <td class="market-td">
          <div class="market-name"><strong>${mkt.label}</strong> · ${sideLabel}</div>
          ${trueProb ? `<div class="true-prob">Sharp true: ${trueProb.toFixed(1)}%</div>` : ''}
          ${isArb ? `<div class="arb-label">ARB · Guaranteed profit on $100 total: +$${arbStakes.guaranteedProfit}</div>` : ''}
          ${isArb && arbStakes ? `<div class="arb-stakes">${Object.entries(arbStakes.stakes).map(([n,s])=>`${n.split(' ').pop()}: $${s}`).join(' · ')}</div>` : ''}
        </td>
        ${allBooks.map(bookKey => {
          const d = bookData[bookKey];
          if (!d) return `<td class="odds-td empty">—</td>`;
          const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
          const isBest = d.price === bestPrice;
          const isArbBest = isArb && bookKey === bestBook;
          const edgeVs = trueProb ? (trueProb - parseFloat(implied)).toFixed(1) : null;
          const isGoodEdge = edgeVs && parseFloat(edgeVs) > 0;
          return `
            <td class="odds-td${isBest?' best':''}${isArbBest?' arb-best':''}">
              ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.point>0?'+':''}${d.point}</div>` : ''}
              <div class="odds-val">${fmt(d.price)}</div>
              <div class="odds-implied">${implied}%</div>
              ${edgeVs ? `<div class="odds-edge ${isGoodEdge?'pos':'neg'}">${isGoodEdge?'+':''}${edgeVs}%</div>` : ''}
            </td>`;
        }).join('')}
        <td class="score-td">
          <div class="ev-score s${score}">${score}</div>
        </td>
      `;
      tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    card.appendChild(table);
    list.appendChild(card);
  });

  // Summary banner
  const summary = document.createElement('div');
  summary.className = 'summary-banner';
  if (totalEdges === 0 && totalArbs === 0) {
    summary.innerHTML = `<span class="summary-none">No significant edges found right now. Lines are tight — check back closer to game time or try another sport.</span>`;
  } else {
    summary.innerHTML = `
      ${totalArbs > 0 ? `<span class="summary-arb">${totalArbs} arbitrage opportunit${totalArbs>1?'ies':'y'} found — guaranteed profit</span>` : ''}
      ${totalEdges > 0 ? `<span class="summary-edge">${totalEdges} positive EV edge${totalEdges>1?'s':''} found</span>` : ''}
    `;
  }
  container.appendChild(summary);
  container.appendChild(list);
}
