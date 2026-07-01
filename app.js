const ODDS_KEY = '53374f8933fdc16b45facdb194c56298';
const CLEAR_KEY = 'sk_live_Bsj-nITf7h_brX-IKkw_9Vk0f9tjtsoDMtul211zzq8';
const PROPLINE_KEY = '8554d857fc2b136c18a1239835727fa0';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada','pinnacle','betfair_ex_eu'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const SOCCER_SHARP_BOOKS = ['pinnacle','betfair_ex_eu','draftkings','fanduel'];
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
    const activeSharpBooks = window._currentSharpBooks || SHARP_BOOKS;
    const vals = activeSharpBooks.map(b => bookData[b]?.price).filter(Boolean);
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
// If sum of implied probs < 100 AND all outcomes share the same point value, it's arb
function checkArbitrage(outcomeNames, outcomeBookMap) {
  const bestPrices = {};
  const bestBooks = {};
  const bestPoints = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    let best = -Infinity;
    let bestBook = null;
    let bestPoint = null;
    Object.entries(bookData).forEach(([book, d]) => {
      if (d.price > best) { best = d.price; bestBook = book; bestPoint = d.point; }
    });
    bestPrices[name] = best;
    bestBooks[name] = bestBook;
    bestPoints[name] = bestPoint;
  });

  // For totals/spreads: only flag arb if the line numbers match across outcomes
  const points = outcomeNames.map(n => bestPoints[n]).filter(p => p !== undefined && p !== null);
  if (points.length >= 2) {
    const absPoints = points.map(p => Math.abs(p));
    const allMatch = absPoints.every(p => p === absPoints[0]);
    if (!allMatch) return { isArb: false, profit: null, bestPrices, bestBooks };
  }

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
    const isSoccer = sport.includes('soccer') || sport.includes('world_cup');
    window._currentSharpBooks = isSoccer ? SOCCER_SHARP_BOOKS : SHARP_BOOKS;
    const regions = isSoccer ? 'us,uk,eu' : 'us';

    await Promise.all([fetchScores(sport), fetchInjuries(sport)]);

    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_KEY}&regions=${regions}&markets=${MARKETS.join(',')}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
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

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function switchTab(tab) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-lines').style.display = tab === 'lines' ? 'block' : 'none';
  document.getElementById('tab-props').style.display = tab === 'props' ? 'block' : 'none';
  event.target.classList.add('active');
}

// ── PROP LINE SPORT MAP ───────────────────────────────────────────────────────
const PROPLINE_SPORT_MAP = {
  'baseball_mlb': 'baseball_mlb',
  'basketball_nba': 'basketball_nba',
  'basketball_ncaab': 'basketball_ncaab',
  'icehockey_nhl': 'icehockey_nhl',
  'americanfootball_nfl': 'americanfootball_nfl',
  'americanfootball_ncaaf': 'americanfootball_ncaaf',
  'soccer_epl': 'soccer_england_premier_league',
  'soccer_uefa_champs_league': 'soccer_uefa_champs_league',
  'soccer_fifa_world_cup': 'soccer_fifa_world_cup'
};

const PROP_MARKETS = {
  'baseball_mlb': ['pitcher_strikeouts','batter_hits','batter_home_runs','batter_rbis','batter_runs_scored'],
  'basketball_nba': ['player_points','player_rebounds','player_assists','player_threes','player_steals'],
  'basketball_ncaab': ['player_points','player_rebounds','player_assists'],
  'icehockey_nhl': ['player_points','player_goals','player_assists','player_shots_on_goal'],
  'americanfootball_nfl': ['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions','player_pass_tds'],
  'americanfootball_ncaaf': ['player_pass_yds','player_rush_yds','player_reception_yds'],
  'soccer_epl': ['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_uefa_champs_league': ['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_fifa_world_cup': ['player_goal_scorer_anytime','player_shots_on_target','player_assists']
};

function cleanPropName(key) {
  return key.replace(/^player_/,'').replace(/_/g,' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

async function fetchAll() {
  const sport = document.getElementById('sport-sel').value;
  // Fetch game lines
  fetchOdds();
  // Fetch props
  fetchProps(sport);
}

async function fetchProps(sport) {
  const container = document.getElementById('props-container');
  container.innerHTML = '<p class="status-msg">Loading player props...</p>';

  const propSport = PROPLINE_SPORT_MAP[sport];
  if (!propSport) {
    container.innerHTML = '<p class="status-msg">Player props not available for this sport yet.</p>';
    return;
  }

  const markets = PROP_MARKETS[sport] || ['player_points'];

  try {
    // First get events for this sport
    const eventsUrl = `https://api.prop-line.com/v1/sports/${propSport}/events?apiKey=${PROPLINE_KEY}`;
    const evRes = await fetch(eventsUrl);
    if (!evRes.ok) throw new Error('Props API error ' + evRes.status);
    const events = await evRes.json();

    if (!events.length) {
      container.innerHTML = '<p class="status-msg">No upcoming games with player props right now.</p>';
      return;
    }

    // Fetch props for first 5 games to save API calls
    const propsData = [];
    for (const event of events.slice(0, 5)) {
      try {
        const oddsUrl = `https://api.prop-line.com/v1/sports/${propSport}/events/${event.id}/odds?markets=${markets.join(',')}&apiKey=${PROPLINE_KEY}`;
        const oddsRes = await fetch(oddsUrl);
        if (!oddsRes.ok) continue;
        const data = await oddsRes.json();
        propsData.push(data);
      } catch(e) {}
    }

    if (!propsData.length) {
      container.innerHTML = '<p class="status-msg">No player props found for upcoming games.</p>';
      return;
    }

    renderProps(propsData);
  } catch(e) {
    container.innerHTML = `<p class="status-msg">Could not load player props: ${e.message}</p>`;
  }
}

function renderProps(games) {
  const container = document.getElementById('props-container');
  container.innerHTML = '';

  let totalEdges = 0;
  let totalArbs = 0;
  const list = document.createElement('div');
  list.className = 'games-list';

  games.forEach((game, gi) => {
    // Build prop map: marketKey -> playerName -> { bookKey: {price, point} }
    const propMap = {};
    (game.bookmakers || []).forEach(bm => {
      (bm.markets || []).forEach(mk => {
        if (!propMap[mk.key]) propMap[mk.key] = {};
        (mk.outcomes || []).forEach(o => {
          const playerKey = o.description || o.name;
          if (!propMap[mk.key][playerKey]) propMap[mk.key][playerKey] = {};
          propMap[mk.key][playerKey][bm.key] = { price: o.price, point: o.point, name: o.name };
        });
      });
    });

    const propKeys = Object.keys(propMap);
    if (!propKeys.length) return;

    // Find actionable props
    const actionable = [];

    propKeys.forEach(mktKey => {
      const players = propMap[mktKey];
      Object.entries(players).forEach(([playerName, bookData]) => {
        const books = Object.keys(bookData);
        if (books.length < 2) return;

        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = Math.max(...prices);
        const worstPrice = Math.min(...prices);

        // Sharp consensus from all available books (no dedicated sharp for props)
        const rawImplied = prices.map(p => decimalToImplied(americanToDecimal(p)));
        const avgImplied = rawImplied.reduce((a,b)=>a+b,0)/rawImplied.length;
        const bestImplied = decimalToImplied(americanToDecimal(bestPrice));
        const edgePct = avgImplied - bestImplied;

        // Check arb: over + under must be on the SAME point value
        const overBooks = Object.entries(bookData).filter(([,d]) => d.name === 'Over');
        const underBooks = Object.entries(bookData).filter(([,d]) => d.name === 'Under');
        let isArb = false;
        let arbProfit = null;

        if (overBooks.length && underBooks.length) {
          // Find best over and best under ON THE SAME LINE
          let bestOver = -Infinity, bestUnder = -Infinity;
          overBooks.forEach(([,od]) => {
            underBooks.forEach(([,ud]) => {
              // Same point = true arb candidate
              if (od.point !== undefined && ud.point !== undefined && od.point === ud.point) {
                if (od.price > bestOver) bestOver = od.price;
                if (ud.price > bestUnder) bestUnder = ud.price;
              }
            });
          });
          if (bestOver > -Infinity && bestUnder > -Infinity) {
            const impliedSum = decimalToImplied(americanToDecimal(bestOver)) + decimalToImplied(americanToDecimal(bestUnder));
            if (impliedSum < 100) {
              isArb = true;
              arbProfit = (100 - impliedSum).toFixed(2);
              totalArbs++;
            }
          }
        }

        if (!isArb && edgePct <= 0.5) return;

        const score = isArb ? 10 : calcAutoScore(edgePct, books.length);
        if (!isArb && (!score || score < 3)) return;

        totalEdges++;
        actionable.push({ mktKey, playerName, bookData, bestPrice, edgePct, isArb, arbProfit, score });
      });
    });

    if (!actionable.length) return;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="game-header">
        <div class="game-matchup">
          <div class="team-line"><span class="team-name">${game.away_team || 'Away'}</span></div>
          <div class="team-line"><span class="team-name">${game.home_team || 'Home'}</span></div>
          <div class="game-sport">${game.sport_title || ''}</div>
        </div>
        <div class="game-status-block">
          <div class="game-time">${game.commence_time ? formatTime(game.commence_time) : ''}</div>
        </div>
      </div>
    `;

    const table = document.createElement('table');
    table.className = 'odds-table';
    const allBooks = [...new Set(actionable.flatMap(r => Object.keys(r.bookData)))];

    table.innerHTML = `<thead><tr>
      <th class="market-th">Player / Prop</th>
      ${allBooks.map(b=>`<th class="book-th">${cleanBook(b)}</th>`).join('')}
      <th class="score-th">Score</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');

    actionable.forEach(row => {
      const { mktKey, playerName, bookData, bestPrice, isArb, arbProfit, score } = row;
      const tr = document.createElement('tr');
      if (isArb) tr.className = 'arb-row';

      tr.innerHTML = `
        <td class="market-td">
          <div class="market-name"><strong>${playerName}</strong></div>
          <div class="market-side">${cleanPropName(mktKey)}</div>
          ${isArb ? `<div class="arb-label">ARB · +$${arbProfit} per $100</div>` : ''}
        </td>
        ${allBooks.map(bookKey => {
          const d = bookData[bookKey];
          if (!d) return `<td class="odds-td empty">—</td>`;
          const isBest = d.price === bestPrice;
          const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
          return `
            <td class="odds-td${isBest?' best':''}${isArb&&isBest?' arb-best':''}">
              ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.name} ${d.point}</div>` : `<div class="odds-point">${d.name||''}</div>`}
              <div class="odds-val">${fmt(d.price)}</div>
              <div class="odds-implied">${implied}%</div>
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

  const summary = document.createElement('div');
  summary.className = 'summary-banner';
  if (totalEdges === 0 && totalArbs === 0) {
    summary.innerHTML = `<span class="summary-none">No significant prop edges found right now.</span>`;
  } else {
    summary.innerHTML = `
      ${totalArbs > 0 ? `<span class="summary-arb">${totalArbs} prop arb${totalArbs>1?'s':''} found</span>` : ''}
      ${totalEdges > 0 ? `<span class="summary-edge">${totalEdges} prop edge${totalEdges>1?'s':''} found</span>` : ''}
    `;
  }

  container.appendChild(summary);
  container.appendChild(list);
}
