const ODDS_KEY = '53374f8933fdc16b45facdb194c56298';
const CLEAR_KEY = 'sk_live_Bsj-nITf7h_brX-IKkw_9Vk0f9tjtsoDMtul211zzq8';
const PROPLINE_KEY = '8554d857fc2b136c18a1239835727fa0';

const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const SOCCER_SHARP_BOOKS = ['draftkings','fanduel','betmgm','bovada'];
const MARKETS = ['h2h','spreads','totals'];

// ── BOOK COLORS ───────────────────────────────────────────────────────────────
const BOOK_COLORS = {
  draftkings: '#1a7a43', fanduel: '#1493ff', betmgm: '#c8963e',
  caesars: '#0033a0', bovada: '#e8a020', barstool: '#1a1a1a',
  pointsbet: '#e30613', williamhill_us: '#009f6b'
};

// ── MATH ──────────────────────────────────────────────────────────────────────
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

// ── LOGOS ─────────────────────────────────────────────────────────────────────
function bookBadge(bookKey) {
  const short = cleanBook(bookKey).split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  const bg = BOOK_COLORS[bookKey] || '#64748b';
  return `<div class="book-badge" style="background:${bg}">${short}</div>`;
}

function teamBadge(teamName) {
  const initials = teamName.split(' ').map(w=>w[0]).join('').substring(0,3).toUpperCase();
  const palette = ['#e63946','#2a9d8f','#e9c46a','#264653','#f4a261','#457b9d','#1d3557','#6d4c41','#37474f','#5e35b1','#00897b','#d81b60'];
  const bg = palette[teamName.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % palette.length];
  return `<div class="team-badge" style="background:${bg}">${initials}</div>`;
}

// ── SHARP CONSENSUS ───────────────────────────────────────────────────────────
function getSharpConsensus(outcomeBookMap, outcomeNames, sharpBooks) {
  const sharpPrices = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    const vals = sharpBooks.map(b => bookData[b]?.price).filter(Boolean);
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

function calcEdgeScore(edgePct, bookCount) {
  if (edgePct <= 0) return null;
  let score;
  if (edgePct >= 8) score = 10;
  else if (edgePct >= 6) score = 9;
  else if (edgePct >= 5) score = 8;
  else if (edgePct >= 4) score = 7;
  else if (edgePct >= 3) score = 6;
  else if (edgePct >= 2) score = 5;
  else if (edgePct >= 1) score = 4;
  else if (edgePct >= 0.5) score = 3;
  else score = 2;
  if (bookCount >= 5) score = Math.min(10, score+1);
  return score;
}

// ── DATA CACHES ───────────────────────────────────────────────────────────────
let scoresCache = {};
let injuryCache = {};
let currentSharpBooks = SHARP_BOOKS;

async function fetchScores(sport) {
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_KEY}&daysFrom=1`);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(s => { scoresCache[s.id] = s; });
  } catch(e) {}
}

function toClearSport(sport) {
  if (sport.includes('nfl')||sport.includes('ncaaf')) return 'nfl';
  if (sport.includes('nba')||sport.includes('ncaab')) return 'nba';
  if (sport.includes('mlb')) return 'mlb';
  if (sport.includes('nhl')) return 'nhl';
  if (sport.includes('soccer')) return 'soccer';
  return null;
}

async function fetchInjuries(sport) {
  const clearSport = toClearSport(sport);
  if (!clearSport) return;
  try {
    const res = await fetch(`https://api.clearsportsapi.com/v1/${clearSport}/injuries`,
      { headers: { 'Authorization': `Bearer ${CLEAR_KEY}` }});
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

// ── ODDS MAP ──────────────────────────────────────────────────────────────────
function buildOddsMap(game) {
  const raw = { h2h:{}, spreads:{}, totals:{} };
  game.bookmakers.forEach(bm => {
    bm.markets.forEach(mk => {
      if (!raw[mk.key]) return;
      mk.outcomes.forEach(o => {
        if (!raw[mk.key][o.name]) raw[mk.key][o.name] = {};
        raw[mk.key][o.name][bm.key] = { price: o.price, point: o.point };
      });
    });
  });
  // Normalize spreads/totals to consensus line number
  ['spreads','totals'].forEach(mkt => {
    Object.keys(raw[mkt]).forEach(outcomeName => {
      const bookData = raw[mkt][outcomeName];
      const pointCounts = {};
      Object.values(bookData).forEach(d => {
        if (d.point === undefined || d.point === null) return;
        pointCounts[d.point] = (pointCounts[d.point]||0)+1;
      });
      if (!Object.keys(pointCounts).length) return;
      const consensusPoint = Object.entries(pointCounts).sort((a,b)=>b[1]-a[1])[0][0];
      Object.keys(bookData).forEach(book => {
        const pt = bookData[book].point;
        if (pt === undefined || pt === null || String(pt) !== String(consensusPoint))
          delete bookData[book];
      });
    });
  });
  return raw;
}

// ── ARB CHECK ─────────────────────────────────────────────────────────────────
function checkArbitrage(outcomeNames, outcomeBookMap) {
  const bestPrices = {}, bestBooks = {}, bestPoints = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name] || {};
    let best = -Infinity, bestBook = null, bestPoint = null;
    Object.entries(bookData).forEach(([book, d]) => {
      if (d.price > best) { best = d.price; bestBook = book; bestPoint = d.point; }
    });
    bestPrices[name] = best; bestBooks[name] = bestBook; bestPoints[name] = bestPoint;
  });
  const points = outcomeNames.map(n => bestPoints[n]).filter(p => p !== undefined && p !== null);
  if (points.length >= 2) {
    const absPoints = points.map(p => Math.abs(p));
    if (!absPoints.every(p => p === absPoints[0]))
      return { isArb: false, profit: null, bestPrices, bestBooks };
  }
  const impliedSum = outcomeNames.reduce((sum,name) => {
    return sum + (bestPrices[name] > -Infinity ? decimalToImplied(americanToDecimal(bestPrices[name])) : 100);
  }, 0);
  const isArb = impliedSum < 100;
  const profit = isArb ? (100-impliedSum).toFixed(2) : null;
  return { isArb, profit, bestPrices, bestBooks };
}

function calcArbStakes(outcomeNames, bestPrices, totalStake=100) {
  const decimals = {};
  outcomeNames.forEach(n => decimals[n] = americanToDecimal(bestPrices[n]));
  const impliedSum = outcomeNames.reduce((s,n)=>s+decimalToImplied(decimals[n]),0);
  const stakes = {};
  outcomeNames.forEach(n => {
    stakes[n] = ((decimalToImplied(decimals[n])/impliedSum)*totalStake).toFixed(2);
  });
  const worstReturn = Math.min(...outcomeNames.map(n => stakes[n]*decimals[n]));
  const guaranteedProfit = (worstReturn-totalStake).toFixed(2);
  return { stakes, guaranteedProfit };
}

// ── MAIN FETCH ────────────────────────────────────────────────────────────────
async function fetchAll() {
  const sport = document.getElementById('sport-sel').value;
  const isSoccer = sport.includes('soccer') || sport.includes('world_cup');
  currentSharpBooks = isSoccer ? SOCCER_SHARP_BOOKS : SHARP_BOOKS;

  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');
  btn.disabled = true;
  btn.textContent = 'Fetching...';
  document.getElementById('games-container').innerHTML = '<p class="status-msg">Loading games...</p>';
  document.getElementById('props-container').innerHTML = '<p class="status-msg">Loading props...</p>';
  scoresCache = {}; injuryCache = {};

  try {
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

    if (!data.length) {
      document.getElementById('games-container').innerHTML = '<p class="status-msg">No upcoming games found. Try another sport.</p>';
    } else {
      renderGames(data, sport);
    }

    fetchProps(sport);
  } catch(e) {
    document.getElementById('games-container').innerHTML = `<p class="status-msg">Could not load odds: ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch odds';
  }
}

// ── RENDER GAMES ──────────────────────────────────────────────────────────────
function renderGames(games, sport) {
  const container = document.getElementById('games-container');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'games-list';

  games.forEach((game, gi) => {
    const oddsMap = buildOddsMap(game);
    const booksPresent = [...new Set(game.bookmakers.map(b => b.key))];
    const scoreData = scoresCache[game.id] || null;
    const isLive = scoreData && !scoreData.completed && scoreData.scores;
    const awayPenalty = Math.round(injuryCache[game.away_team]||0);
    const homePenalty = Math.round(injuryCache[game.home_team]||0);

    const awayScore = scoreData?.scores?.find(s=>s.name===game.away_team)?.score;
    const homeScore = scoreData?.scores?.find(s=>s.name===game.home_team)?.score;
    const awayLeading = awayScore !== undefined && parseInt(awayScore) > parseInt(homeScore);
    const homeLeading = homeScore !== undefined && parseInt(homeScore) > parseInt(awayScore);

    const injBadge = p => p >= 2
      ? `<span class="inj-badge inj-out">INJ</span>`
      : p >= 1 ? `<span class="inj-badge inj-q">Q</span>` : '';

    const card = document.createElement('div');
    card.className = 'game-card';

    // Header
    card.innerHTML = `
      <div class="game-header">
        <div class="teams-col">
          <div class="team-row">
            ${teamBadge(game.away_team)}
            <span class="team-name${awayLeading?' leading':''}">${game.away_team}</span>
            ${injBadge(awayPenalty)}
            ${awayScore !== undefined ? `<span class="team-score${awayLeading?' leading':''}">${awayScore}</span>` : ''}
          </div>
          <div class="team-row" style="margin-top:6px">
            ${teamBadge(game.home_team)}
            <span class="team-name${homeLeading?' leading':''}">${game.home_team}</span>
            ${injBadge(homePenalty)}
            ${homeScore !== undefined ? `<span class="team-score${homeLeading?' leading':''}">${homeScore}</span>` : ''}
          </div>
        </div>
        <div class="game-right">
          ${isLive ? '<div class="live-badge">● LIVE</div>' : ''}
          <div class="game-time">${formatTime(game.commence_time)}</div>
          <div class="game-sport">${game.sport_title}</div>
        </div>
      </div>
    `;

    // Table
    const table = document.createElement('table');
    table.className = 'odds-table';

    // Column headers with book badges
    table.innerHTML = `<thead><tr>
      <th class="market-th">Market</th>
      ${booksPresent.map(b => `
        <th class="book-th">
          ${bookBadge(b)}
          <span class="book-label">${cleanBook(b)}</span>
        </th>`).join('')}
    </tr></thead>`;

    const tbody = document.createElement('tbody');

    const marketGroups = [
      { key:'h2h', label:'Moneyline' },
      { key:'spreads', label:'Spread' },
      { key:'totals', label:'Total' }
    ];

    marketGroups.forEach((mkt, mktIdx) => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;

      const consensus = getSharpConsensus(oddsMap[mkt.key], outcomes, currentSharpBooks);
      const arbResult = checkArbitrage(outcomes, oddsMap[mkt.key]);
      const arbStakes = arbResult.isArb ? calcArbStakes(outcomes, arbResult.bestPrices) : null;

      // Section label row
      if (mktIdx > 0) {
        const divRow = document.createElement('tr');
        divRow.className = 'section-divider';
        divRow.innerHTML = `<td colspan="${booksPresent.length+1}"><span class="section-divider-label">${mkt.label}</span></td>`;
        tbody.appendChild(divRow);
      }

      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName];
        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;
        const trueProb = consensus ? consensus[outcomeName] : null;
        const sideLabel = outcomeName === game.home_team ? 'Home' :
                          outcomeName === game.away_team ? 'Away' : outcomeName;

        const row = document.createElement('tr');
        if (arbResult.isArb) row.className = 'arb-row';

        // Determine if any cell has a good edge
        let rowHasEdge = false;

        const cells = booksPresent.map(bookKey => {
          const d = bookData[bookKey];
          if (!d) return `<td class="odds-td empty">—</td>`;

          const isBest = d.price === bestPrice;
          const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
          const edgeVs = trueProb ? (trueProb - parseFloat(implied)) : null;
          const isGoodEdge = edgeVs !== null && edgeVs > 1;
          const isArb = arbResult.isArb && d.price === arbResult.bestPrices[outcomeName];
          const score = isGoodEdge ? calcEdgeScore(edgeVs, booksPresent.length) : null;

          if (isGoodEdge) rowHasEdge = true;

          let cellClass = 'odds-td';
          if (isArb) cellClass += ' arb-cell';
          else if (isBest) cellClass += ' best-cell';

          return `<td class="${cellClass}">
            ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.point>0?'+':''}${d.point}</div>` : ''}
            <div class="odds-val">${fmt(d.price)}</div>
            <div class="odds-implied">${implied}%</div>
            ${score ? `<div class="ev-score-inline s${score}">${score}</div>` : (edgeVs !== null && edgeVs < 0 ? `<div class="odds-edge neg">${edgeVs.toFixed(1)}%</div>` : '')}
          </td>`;
        }).join('');

        row.innerHTML = `
          <td class="market-td${arbResult.isArb?' arb-market':''}">
            <div class="market-name">${oi===0?`<strong>${mkt.label}</strong>`:''}</div>
            <div class="market-side">${sideLabel}</div>
            ${trueProb ? `<div class="true-prob">True: ${trueProb.toFixed(1)}%</div>` : ''}
            ${arbResult.isArb && oi===0 ? `<div class="arb-label">⬡ ARB +$${arbStakes.guaranteedProfit} on $100</div>` : ''}
          </td>
          ${cells}
        `;
        tbody.appendChild(row);
      });
    });

    table.appendChild(tbody);
    card.appendChild(table);
    list.appendChild(card);
  });

  container.appendChild(list);
}

// ── TAB SWITCHING ─────────────────────────────────────────────────────────────
function switchTab(tab, btn) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-lines').style.display = tab === 'lines' ? 'block' : 'none';
  document.getElementById('tab-props').style.display = tab === 'props' ? 'block' : 'none';
  if (btn) btn.classList.add('active');
}

// ── PROPS ─────────────────────────────────────────────────────────────────────
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
  'baseball_mlb': ['pitcher_strikeouts','batter_hits','batter_home_runs','batter_rbis'],
  'basketball_nba': ['player_points','player_rebounds','player_assists','player_threes'],
  'basketball_ncaab': ['player_points','player_rebounds','player_assists'],
  'icehockey_nhl': ['player_points','player_goals','player_assists','player_shots_on_goal'],
  'americanfootball_nfl': ['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions'],
  'americanfootball_ncaaf': ['player_pass_yds','player_rush_yds'],
  'soccer_epl': ['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_uefa_champs_league': ['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_fifa_world_cup': ['player_goal_scorer_anytime','player_shots_on_target']
};

function cleanPropName(key) {
  return key.replace(/^(player_|pitcher_|batter_)/,'').replace(/_/g,' ')
    .replace(/\b\w/g,c=>c.toUpperCase());
}

async function fetchProps(sport) {
  const container = document.getElementById('props-container');
  const propSport = PROPLINE_SPORT_MAP[sport];
  if (!propSport) {
    container.innerHTML = '<p class="status-msg">Player props not available for this sport.</p>';
    return;
  }
  const markets = PROP_MARKETS[sport] || ['player_points'];


  try {
    const evRes = await fetch(`https://api.prop-line.com/v1/sports/${propSport}/events?apiKey=${PROPLINE_KEY}`);
    if (!evRes.ok) {
      const errText = await evRes.text().catch(()=>'');
      throw new Error(`Events ${evRes.status}: ${errText.substring(0,120)}`);
    }
    const evData = await evRes.json();
    const events = Array.isArray(evData) ? evData : (evData.data || evData.events || []);

    if (!events.length) {
      container.innerHTML = '<p class="status-msg">No upcoming games with player props right now.</p>';
      return;
    }

    const propsData = [];
    for (const event of events.slice(0,6)) {
      try {
        const eventId = event.id || event.event_id;
        const oddsRes = await fetch(`https://api.prop-line.com/v1/sports/${propSport}/events/${eventId}/odds?markets=${markets.join(',')}&apiKey=${PROPLINE_KEY}`);
        if (!oddsRes.ok) continue;
        const d = await oddsRes.json();
        const normalized = Array.isArray(d) ? d[0] : (d.bookmakers ? d : (d.data || d));
        if (normalized && (normalized.bookmakers || normalized.id)) propsData.push(normalized);
      } catch(e) { console.log('prop fetch err', e); }
    }

    if (!propsData.length) {
      container.innerHTML = '<p class="status-msg">No player props posted yet for today.</p>';
      return;
    }
    renderProps(propsData);
  } catch(e) {
    container.innerHTML = `<p class="status-msg">Props error: ${e.message}</p>`;
  }

}

function renderProps(games) {
  const container = document.getElementById('props-container');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'games-list';

  games.forEach(game => {
    const propMap = {};
    (game.bookmakers||[]).forEach(bm => {
      (bm.markets||[]).forEach(mk => {
        if (!propMap[mk.key]) propMap[mk.key] = {};
        (mk.outcomes||[]).forEach(o => {
          const key = (o.description||o.name) + '||' + (o.name||'');
          if (!propMap[mk.key][key]) propMap[mk.key][key] = { label: o.description||o.name, side: o.name, books: {} };
          propMap[mk.key][key].books[bm.key] = { price: o.price, point: o.point };
        });
      });
    });

    const propKeys = Object.keys(propMap);
    if (!propKeys.length) return;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.innerHTML = `
      <div class="game-header">
        <div class="teams-col">
          <div class="team-row">${teamBadge(game.away_team||'Away')}<span class="team-name">${game.away_team||'Away'}</span></div>
          <div class="team-row" style="margin-top:6px">${teamBadge(game.home_team||'Home')}<span class="team-name">${game.home_team||'Home'}</span></div>
        </div>
        <div class="game-right">
          <div class="game-time">${game.commence_time ? formatTime(game.commence_time) : ''}</div>
          <div class="game-sport">${game.sport_title||''}</div>
        </div>
      </div>
    `;

    propKeys.forEach(mktKey => {
      const players = propMap[mktKey];
      const playerNames = [...new Set(Object.values(players).map(p=>p.label))];
      const allBooks = [...new Set(Object.values(players).flatMap(p=>Object.keys(p.books)))];

      if (!allBooks.length) return;

      // Section header
      const secDiv = document.createElement('div');
      secDiv.className = 'prop-section-header';
      secDiv.textContent = cleanPropName(mktKey);
      card.appendChild(secDiv);

      const table = document.createElement('table');
      table.className = 'odds-table';
      table.innerHTML = `<thead><tr>
        <th class="market-th">Player</th>
        ${allBooks.map(b=>`<th class="book-th">${bookBadge(b)}<span class="book-label">${cleanBook(b)}</span></th>`).join('')}
      </tr></thead>`;

      const tbody = document.createElement('tbody');

      playerNames.forEach(playerName => {
        const entries = Object.values(players).filter(p=>p.label===playerName);
        const sides = [...new Set(entries.map(e=>e.side))];

        sides.forEach((side, si) => {
          const entry = entries.find(e=>e.side===side);
          if (!entry) return;
          const prices = Object.values(entry.books).map(d=>d.price);
          const bestPrice = prices.length ? Math.max(...prices) : null;

          const row = document.createElement('tr');
          row.innerHTML = `
            <td class="market-td">
              ${si===0?`<div class="market-name"><strong>${playerName}</strong></div>`:''}
              <div class="market-side">${side}${entry.books[Object.keys(entry.books)[0]]?.point !== undefined ? ' '+entry.books[Object.keys(entry.books)[0]]?.point : ''}</div>
            </td>
            ${allBooks.map(bookKey => {
              const d = entry.books[bookKey];
              if (!d) return `<td class="odds-td empty">—</td>`;
              const isBest = d.price === bestPrice;
              const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
              return `<td class="odds-td${isBest?' best-cell':''}">
                <div class="odds-val">${fmt(d.price)}</div>
                <div class="odds-implied">${implied}%</div>
              </td>`;
            }).join('')}
          `;
          tbody.appendChild(row);
        });
      });

      table.appendChild(tbody);
      card.appendChild(table);
    });

    list.appendChild(card);
  });

  container.appendChild(list);
}
