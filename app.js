const API_KEY = '53374f8933fdc16b45facdb194c56298';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const MARKETS = ['h2h','spreads','totals'];

function americanToDecimal(p) { return p > 0 ? (p/100)+1 : (100/Math.abs(p))+1; }
function decimalToImplied(d) { return (1/d)*100; }
function calcEV(prob, decimal, stake) {
  return ((prob/100)*(decimal-1)*stake) - ((1-prob/100)*stake);
}
function fmt(n) { return n > 0 ? '+'+n : ''+n; }
function cleanBook(k) { return k.replace(/_us$/,'').replace(/_/g,' '); }
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
    +' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

// Convert raw EV to 1-10 score
function evToScore(ev, stake) {
  const roi = (ev / stake) * 100;
  if (roi <= 0) return null;
  // ROI bands: 0-1%=1, 1-2%=2, ..., capped at 10
  const score = Math.min(10, Math.max(1, Math.ceil(roi / 1.5)));
  return score;
}

let scoresCache = {};

async function fetchScores(sport) {
  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${API_KEY}&daysFrom=1`;
    const res = await fetch(url);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(s => { scoresCache[s.id] = s; });
  } catch(e) { /* scores optional */ }
}

async function fetchOdds() {
  const sport = document.getElementById('sport-sel').value;
  const minBooks = parseInt(document.getElementById('min-books').value);
  const container = document.getElementById('games-container');
  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');

  btn.disabled = true;
  btn.textContent = 'Fetching...';
  container.innerHTML = '<p class="status-msg">Loading live odds...</p>';
  scoresCache = {};

  try {
    await fetchScores(sport);

    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=${MARKETS.join(',')}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
    const res = await fetch(url);

    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) {
      apiNote.style.display = 'block';
      apiNote.textContent = `${used} requests used · ${remaining} remaining this month (free tier: 500/month)`;
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
  const list = document.createElement('div');
  list.className = 'games-list';

  games.slice(0, 15).forEach((game, gi) => {
    const oddsMap = buildOddsMap(game);
    const booksPresent = [...new Set(game.bookmakers.map(b => b.key))];
    const scoreData = scoresCache[game.id] || null;
    const isLive = scoreData && scoreData.completed === false && scoreData.scores;

    const card = document.createElement('div');
    card.className = 'game-card';

    // --- HEADER ---
    const awayScore = scoreData?.scores?.find(s => s.name === game.away_team)?.score;
    const homeScore = scoreData?.scores?.find(s => s.name === game.home_team)?.score;
    const awayLeading = awayScore !== undefined && homeScore !== undefined && parseInt(awayScore) > parseInt(homeScore);
    const homeLeading = awayScore !== undefined && homeScore !== undefined && parseInt(homeScore) > parseInt(awayScore);

    const period = scoreData?.last_update ? (isLive ? `In progress` : 'Final') : '';

    card.innerHTML = `
      <div class="game-header">
        <div class="game-matchup">
          <div class="team-line">
            <div class="team-name">${game.away_team}</div>
            ${awayScore !== undefined ? `<div class="team-score${awayLeading?' leading':''}">${awayScore}</div>` : ''}
          </div>
          <div class="team-line">
            <div class="team-name">${game.home_team}</div>
            ${homeScore !== undefined ? `<div class="team-score${homeLeading?' leading':''}">${homeScore}</div>` : ''}
          </div>
          <div class="game-sport">${game.sport_title}</div>
        </div>
        <div class="game-status-block">
          ${isLive ? '<div class="live-badge">LIVE</div>' : ''}
          <div class="game-time">${formatTime(game.commence_time)}</div>
          ${period ? `<div class="game-period">${period}</div>` : ''}
        </div>
      </div>
    `;

    // --- ODDS TABLE ---
    const table = document.createElement('table');
    table.className = 'odds-table';

    // Column headers
    const thead = document.createElement('thead');
    thead.innerHTML = `<tr>
      <th class="market-th">Market</th>
      ${booksPresent.map(b => `<th>${cleanBook(b)}</th>`).join('')}
    </tr>`;
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const marketGroups = [
      { key: 'h2h', label: 'Moneyline' },
      { key: 'spreads', label: 'Spread' },
      { key: 'totals', label: 'Total' }
    ];

    marketGroups.forEach((mkt, mktIdx) => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;

      // Section divider
      if (mktIdx > 0) {
        const divRow = document.createElement('tr');
        divRow.className = 'section-divider';
        divRow.innerHTML = `<td colspan="${booksPresent.length + 1}"><div class="section-divider-label">${mkt.label}</div></td>`;
        tbody.appendChild(divRow);
      }

      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName];
        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;
        const sideLabel = outcomeName === game.home_team ? 'Home' :
                          outcomeName === game.away_team ? 'Away' : outcomeName;

        // Odds row
        const oddsRow = document.createElement('tr');
        oddsRow.innerHTML = `
          <td class="market-td">
            <div class="market-name">${oi === 0 ? mkt.label : ''}</div>
            <div class="market-side">${sideLabel}</div>
          </td>
          ${booksPresent.map(bookKey => {
            const d = bookData[bookKey];
            if (!d) return `<td class="odds-td empty">—</td>`;
            const isBest = d.price === bestPrice;
            const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
            return `
              <td class="odds-td${isBest?' best':''}">
                ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.point>0?'+':''}${d.point}</div>` : ''}
                <div class="odds-val">${fmt(d.price)}</div>
                <div class="odds-implied">${implied}%</div>
              </td>`;
          }).join('')}
        `;
        tbody.appendChild(oddsRow);

        // EV input row
        const evRow = document.createElement('tr');
        evRow.className = 'ev-row';
        const uid = `g${gi}-${mkt.key}-${oi}`;
        evRow.innerHTML = `
          <td class="market-td"><div class="ev-label">My prob %</div></td>
          ${booksPresent.map(bookKey => {
            const d = bookData[bookKey];
            if (!d) return `<td><div class="ev-cell"></div></td>`;
            const inputId = `prob-${uid}-${bookKey}`;
            const scoreId = `score-${uid}-${bookKey}`;
            return `
              <td>
                <div class="ev-cell">
                  <input type="number" id="${inputId}" min="1" max="99" step="0.5" placeholder="%"
                    data-price="${d.price}" data-scoreid="${scoreId}"
                    oninput="recalc(this)">
                  <div class="ev-score" id="${scoreId}" style="display:none"></div>
                </div>
              </td>`;
          }).join('')}
        `;
        tbody.appendChild(evRow);
      });
    });

    table.appendChild(tbody);
    card.appendChild(table);
    list.appendChild(card);
  });

  container.appendChild(list);
}

function recalc(input) {
  const myProb = parseFloat(input.value);
  const price = parseFloat(input.dataset.price);
  const stake = parseFloat(document.getElementById('stake-global').value) || 100;
  const scoreEl = document.getElementById(input.dataset.scoreid);

  if (!myProb || myProb < 1 || myProb > 99) {
    scoreEl.style.display = 'none';
    return;
  }

  const decimal = americanToDecimal(price);
  const ev = calcEV(myProb, decimal, stake);
  const score = evToScore(ev, stake);

  scoreEl.style.display = 'flex';

  if (!score) {
    scoreEl.className = 'ev-score s1';
    scoreEl.textContent = '—';
    return;
  }

  scoreEl.className = `ev-score s${score}`;
  scoreEl.textContent = score;
}
