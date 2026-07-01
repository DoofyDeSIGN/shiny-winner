const API_KEY = '53374f8933fdc16b45facdb194c56298';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const MARKETS = ['h2h','spreads','totals'];

function americanToDecimal(american) {
  if (american > 0) return (american / 100) + 1;
  return (100 / Math.abs(american)) + 1;
}
function decimalToImplied(decimal) { return (1 / decimal) * 100; }
function calcEV(myProb, decimal, stake) {
  return ((myProb / 100) * (decimal - 1) * stake) - ((1 - myProb / 100) * stake);
}
function fmt(n) { return n > 0 ? '+' + n : '' + n; }
function cleanBook(k) { return k.replace(/_us$/, '').replace(/_/g, ' '); }
function formatTime(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
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

  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=${MARKETS.join(',')}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
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
    btn.textContent = 'Fetch live odds';
  }
}

function buildOddsMap(game) {
  // Returns { h2h: { 'TeamA': [{book, price}], 'TeamB': [...] }, spreads: {...}, totals: {...} }
  const map = { h2h: {}, spreads: {}, totals: {} };
  game.bookmakers.forEach(bm => {
    bm.markets.forEach(mk => {
      if (!map[mk.key]) return;
      mk.outcomes.forEach(o => {
        const key = o.name;
        if (!map[mk.key][key]) map[mk.key][key] = {};
        map[mk.key][key][bm.key] = { price: o.price, point: o.point };
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

    // Collect which books actually have data for this game
    const booksPresent = [...new Set(game.bookmakers.map(b => b.key))];
    const bookCount = booksPresent.length;

    const card = document.createElement('div');
    card.className = 'game-card';
    card.style.setProperty('--book-count', bookCount);

    // --- HEADER ---
    const header = document.createElement('div');
    header.className = 'game-header';
    header.innerHTML = `
      <div class="game-teams-block">
        <div class="team-row">${game.away_team}</div>
        <div class="team-row">${game.home_team}</div>
        <div class="game-meta">${game.sport_title}</div>
      </div>
      <div class="game-time">${formatTime(game.commence_time)}</div>
    `;
    card.appendChild(header);

    // --- COLUMN HEADERS (book names) ---
    const colHeaders = document.createElement('div');
    colHeaders.className = 'col-headers';
    colHeaders.style.setProperty('--book-count', bookCount);
    colHeaders.innerHTML = `<div class="col-header-market">Market</div>`;
    booksPresent.forEach(b => {
      colHeaders.innerHTML += `<div class="col-header-book">${cleanBook(b)}</div>`;
    });
    card.appendChild(colHeaders);

    // --- MARKET ROWS ---
    // For each market, for each outcome (team/side), one row
    const marketDefs = [
      { key: 'h2h', label: 'Moneyline' },
      { key: 'spreads', label: 'Spread' },
      { key: 'totals', label: 'Total' }
    ];

    let rowIndex = 0;

    marketDefs.forEach(mkt => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;

      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName]; // { bookKey: {price, point} }
        const prices = Object.values(bookData).map(d => d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;

        const row = document.createElement('div');
        row.className = 'market-row';
        row.style.setProperty('--book-count', bookCount);

        const isFirst = oi === 0;
        const sublabel = outcomeName === game.home_team ? 'Home' : outcomeName === game.away_team ? 'Away' : outcomeName;

        row.innerHTML = `
          <div class="market-label-cell">
            ${isFirst ? `<strong>${mkt.label}</strong>` : ''}
            <span class="market-sublabel">${sublabel}</span>
          </div>
        `;

        booksPresent.forEach(bookKey => {
          const d = bookData[bookKey];
          if (!d) {
            row.innerHTML += `<div class="odds-cell empty border-l">—</div>`;
            return;
          }
          const isBest = d.price === bestPrice;
          const implied = decimalToImplied(americanToDecimal(d.price)).toFixed(1);
          const cellId = `cell-g${gi}-${mkt.key}-${oi}-${bookKey}`;
          row.innerHTML += `
            <div class="odds-cell${isBest ? ' best-odds' : ''}" id="${cellId}">
              ${d.point !== undefined && d.point !== null ? `<div class="odds-point">${d.point > 0 ? '+' : ''}${d.point}</div>` : ''}
              <div class="odds-value">${fmt(d.price)}</div>
              <div class="odds-implied">${implied}%</div>
              <span class="ev-dot" id="dot-${cellId}" style="display:none"></span>
            </div>
          `;
        });

        card.appendChild(row);
        rowIndex++;

        // EV input row for this outcome
        const evRow = document.createElement('div');
        evRow.className = 'ev-input-row';
        evRow.style.setProperty('--book-count', bookCount);
        const evRowId = `ev-g${gi}-${mkt.key}-${oi}`;
        evRow.innerHTML = `<div class="ev-input-label">My prob %</div>`;

        booksPresent.forEach(bookKey => {
          const d = bookData[bookKey];
          if (!d) {
            evRow.innerHTML += `<div class="ev-prob-cell"></div>`;
            return;
          }
          const inputId = `prob-g${gi}-${mkt.key}-${oi}-${bookKey}`;
          const badgeId = `badge-g${gi}-${mkt.key}-${oi}-${bookKey}`;
          const cellId = `cell-g${gi}-${mkt.key}-${oi}-${bookKey}`;
          evRow.innerHTML += `
            <div class="ev-prob-cell">
              <input type="number" id="${inputId}" min="1" max="99" step="0.5" placeholder="%" 
                data-price="${d.price}" data-cell="${cellId}" data-badge="${badgeId}" data-dot="dot-${cellId}"
                oninput="recalcCell(this)">
              <span class="ev-result-badge" id="${badgeId}" style="display:none"></span>
            </div>
          `;
        });

        card.appendChild(evRow);
      });
    });

    list.appendChild(card);
  });

  container.appendChild(list);
}

function recalcCell(input) {
  const myProb = parseFloat(input.value);
  const price = parseFloat(input.dataset.price);
  const stake = parseFloat(document.getElementById('stake-global').value) || 100;
  const badge = document.getElementById(input.dataset.badge);
  const dot = document.getElementById(input.dataset.dot);

  if (!myProb || myProb < 1 || myProb > 99) {
    badge.style.display = 'none';
    dot.style.display = 'none';
    return;
  }

  const decimal = americanToDecimal(price);
  const ev = calcEV(myProb, decimal, stake);
  const isPos = ev > 0;

  badge.style.display = 'inline-block';
  badge.className = 'ev-result-badge ' + (isPos ? 'pos' : 'neg');
  badge.textContent = (isPos ? '+' : '') + '$' + ev.toFixed(2);

  dot.style.display = 'block';
  dot.className = 'ev-dot ' + (isPos ? 'pos' : 'neg');
}
