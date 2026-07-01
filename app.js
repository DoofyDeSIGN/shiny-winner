const API_KEY = '53374f8933fdc16b45facdb194c56298';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];

function americanToDecimal(american) {
  if (american > 0) return (american / 100) + 1;
  return (100 / Math.abs(american)) + 1;
}

function decimalToImplied(decimal) {
  return (1 / decimal) * 100;
}

function calcEV(myProb, decimal, stake) {
  const win = (decimal - 1) * stake;
  const lose = stake;
  return ((myProb / 100) * win) - ((1 - myProb / 100) * lose);
}

function formatAmerican(n) {
  return n > 0 ? '+' + n : '' + n;
}

function formatTime(isoStr) {
  const d = new Date(isoStr);
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })
    + ' · ' + d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

async function fetchOdds() {
  const sport = document.getElementById('sport-sel').value;
  const market = document.getElementById('market-sel').value;
  const container = document.getElementById('games-container');
  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');

  btn.disabled = true;
  btn.textContent = 'Fetching...';
  container.innerHTML = '<p class="status-msg">Loading live odds...</p>';

  try {
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${API_KEY}&regions=us&markets=${market}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
    const res = await fetch(url);

    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) {
      apiNote.style.display = 'block';
      apiNote.textContent = `API usage: ${used} requests used · ${remaining} remaining this month (free tier: 500/month)`;
    }

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'API error ' + res.status);
    }

    const data = await res.json();

    if (!data.length) {
      container.innerHTML = '<p class="status-msg">No upcoming games found for this sport and market right now. Try another sport or check back closer to game time.</p>';
      return;
    }

    renderGames(data, market);

  } catch(e) {
    container.innerHTML = `<p class="status-msg">Could not load odds: ${e.message}<br><br>Check that your API key is correct in app.js and try again.</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch live odds';
  }
}

function renderGames(games, market) {
  const container = document.getElementById('games-container');
  container.innerHTML = '';
  const list = document.createElement('div');
  list.className = 'games-list';

  games.slice(0, 15).forEach((game, gi) => {
    const card = document.createElement('div');
    card.className = 'game-card';

    // Build outcome map: outcome name -> array of {book, price, point}
    const outcomeMap = {};
    game.bookmakers.forEach(bm => {
      const mk = bm.markets.find(m => m.key === market);
      if (!mk) return;
      mk.outcomes.forEach(o => {
        const key = o.name + (o.point !== undefined ? '_' + o.point : '');
        if (!outcomeMap[key]) outcomeMap[key] = { name: o.name, point: o.point, books: [] };
        outcomeMap[key].books.push({ book: bm.key, price: o.price });
      });
    });

    const outcomes = Object.values(outcomeMap);
    if (!outcomes.length) return;

    // Header
    const header = document.createElement('div');
    header.className = 'game-header';
    header.innerHTML = `
      <div>
        <div class="game-teams">${game.away_team} @ ${game.home_team}</div>
        <div class="game-sport">${game.sport_title}</div>
      </div>
      <div class="game-time">${formatTime(game.commence_time)}</div>
    `;
    card.appendChild(header);

    outcomes.forEach((outcome, oi) => {
      const uid = `g${gi}o${oi}`;
      const bestPrice = Math.max(...outcome.books.map(b => b.price));

      const section = document.createElement('div');
      section.className = 'outcome-section';

      const label = document.createElement('div');
      label.className = 'outcome-label';
      label.textContent = outcome.name + (outcome.point !== undefined ? ' (' + (outcome.point > 0 ? '+' : '') + outcome.point + ')' : '');
      section.appendChild(label);

      // Books grid
      const grid = document.createElement('div');
      grid.className = 'books-grid';
      outcome.books.forEach(b => {
        const isBest = b.price === bestPrice;
        const implied = decimalToImplied(americanToDecimal(b.price)).toFixed(1);
        const div = document.createElement('div');
        div.className = 'book-row' + (isBest ? ' best-line' : '');
        div.innerHTML = `
          ${isBest ? '<div class="best-tag">best line</div>' : ''}
          <div class="book-name">${b.book.replace(/_us$/,'').replace(/_/g,' ')}</div>
          <div class="book-odds">
            <span class="odd-chip">${formatAmerican(b.price)}</span>
            <span class="odd-chip muted">${implied}%</span>
          </div>
        `;
        grid.appendChild(div);
      });
      section.appendChild(grid);

      // EV calculator
      const evDiv = document.createElement('div');
      evDiv.className = 'ev-calc';
      evDiv.innerHTML = `
        <div class="ev-calc-title">Your probability model</div>
        <div class="ev-inputs">
          <div>
            <label for="prob-${uid}">My win probability %</label>
            <input type="number" id="prob-${uid}" min="1" max="99" step="0.5" placeholder="e.g. 58">
          </div>
          <div>
            <label for="stake-${uid}">Stake ($)</label>
            <input type="number" id="stake-${uid}" min="1" value="100">
          </div>
          <div>
            <label for="book-${uid}">Book to use</label>
            <select id="book-${uid}">
              ${outcome.books.map(b => `<option value="${b.price}">${b.book.replace(/_us$/,'').replace(/_/g,' ')} (${formatAmerican(b.price)})</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="ev-result" id="result-${uid}"></div>
      `;
      section.appendChild(evDiv);

      // Wire up inputs
      ['prob','stake','book'].forEach(field => {
        document.addEventListener('DOMContentLoaded', () => {});
        const el = evDiv.querySelector(`#${field}-${uid}`);
        if (el) el.addEventListener('input', () => recalc(uid));
      });

      card.appendChild(section);

      // divider between outcomes
      if (oi < outcomes.length - 1) {
        const div = document.createElement('div');
        div.className = 'divider';
        card.appendChild(div);
      }
    });

    list.appendChild(card);
  });

  container.appendChild(list);

  // Wire up all inputs after DOM is built
  document.querySelectorAll('[id^="prob-"], [id^="stake-"], [id^="book-"]').forEach(el => {
    el.addEventListener('input', () => {
      const uid = el.id.split('-').slice(1).join('-');
      recalc(uid);
    });
  });
}

function recalc(uid) {
  const probEl = document.getElementById('prob-' + uid);
  const stakeEl = document.getElementById('stake-' + uid);
  const bookEl = document.getElementById('book-' + uid);
  const resultEl = document.getElementById('result-' + uid);
  if (!probEl || !stakeEl || !bookEl || !resultEl) return;

  const myProb = parseFloat(probEl.value);
  const stake = parseFloat(stakeEl.value) || 100;
  const chosenPrice = parseFloat(bookEl.value);

  if (!myProb || myProb < 1 || myProb > 99) {
    resultEl.innerHTML = '';
    return;
  }

  const decimal = americanToDecimal(chosenPrice);
  const impliedProb = decimalToImplied(decimal);
  const edge = (myProb - impliedProb).toFixed(1);
  const ev = calcEV(myProb, decimal, stake).toFixed(2);
  const roi = ((parseFloat(ev) / stake) * 100).toFixed(1);
  const isPos = parseFloat(ev) > 0;

  resultEl.innerHTML = `
    <span class="ev-pill ${isPos ? 'ev-pos' : 'ev-neg'}">EV: ${isPos ? '+' : ''}$${ev}</span>
    <span class="ev-pill ${parseFloat(edge) > 0 ? 'ev-pos' : 'ev-neg'}">Edge: ${edge}%</span>
    <span class="ev-pill ev-neutral">ROI: ${roi}%</span>
    <span class="ev-pill ev-neutral">Book implied: ${impliedProb.toFixed(1)}%</span>
  `;
}
