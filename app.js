const ODDS_KEY = '53374f8933fdc16b45facdb194c56298';
const CLEAR_KEY = 'sk_live_Bsj-nITf7h_brX-IKkw_9Vk0f9tjtsoDMtul211zzq8';
const PROPLINE_KEY = '8554d857fc2b136c18a1239835727fa0';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const SOCCER_SHARP = ['draftkings','fanduel','betmgm','bovada'];
const MARKETS = ['h2h','spreads','totals'];

// Auto-refresh: fetch on load, then every 5 min for up to 1 hour
const REFRESH_INTERVAL_MS = 5 * 60 * 1000;
const MAX_REFRESHES = 12;
let refreshCount = 0;
let refreshTimer = null;
let countdownTimer = null;
let nextRefreshAt = null;
let currentSport = 'baseball_mlb';
let scoresTimer = null;
let scoresCache = {};
let injuryCache = {};
let currentSharpBooks = SHARP_BOOKS;

// ── TEAM LOGOS (ESPN CDN) ─────────────────────────────────────────────────────
const ESPN_TEAM_IDS = {
  // MLB
  'New York Yankees':6,'Boston Red Sox':2,'Los Angeles Dodgers':19,'Chicago Cubs':16,
  'Houston Astros':18,'Atlanta Braves':15,'New York Mets':21,'Philadelphia Phillies':22,
  'San Diego Padres':25,'San Francisco Giants':26,'St. Louis Cardinals':24,
  'Toronto Blue Jays':14,'Minnesota Twins':9,'Cleveland Guardians':5,
  'Chicago White Sox':4,'Detroit Tigers':6,'Kansas City Royals':7,
  'Milwaukee Brewers':8,'Pittsburgh Pirates':23,'Cincinnati Reds':17,
  'Arizona Diamondbacks':29,'Colorado Rockies':27,'Los Angeles Angels':3,
  'Oakland Athletics':11,'Seattle Mariners':12,'Tampa Bay Rays':30,
  'Texas Rangers':13,'Miami Marlins':28,'Baltimore Orioles':1,'Washington Nationals':20,
  // NBA
  'Los Angeles Lakers':13,'Golden State Warriors':9,'Boston Celtics':2,
  'Miami Heat':14,'Chicago Bulls':4,'Brooklyn Nets':17,'Milwaukee Bucks':15,
  'Phoenix Suns':21,'Dallas Mavericks':6,'Denver Nuggets':7,
  'Philadelphia 76ers':20,'Toronto Raptors':28,'Atlanta Hawks':1,
  'New York Knicks':18,'Cleveland Cavaliers':5,'Indiana Pacers':11,
  'Orlando Magic':19,'Charlotte Hornets':30,'Detroit Pistons':8,
  'Washington Wizards':27,'Memphis Grizzlies':29,'New Orleans Pelicans':3,
  'Oklahoma City Thunder':25,'Sacramento Kings':23,'San Antonio Spurs':24,
  'Utah Jazz':26,'Minnesota Timberwolves':16,'Portland Trail Blazers':22,
  'Los Angeles Clippers':12,'Houston Rockets':10,
  // NFL
  'Kansas City Chiefs':12,'San Francisco 49ers':25,'Dallas Cowboys':6,
  'Philadelphia Eagles':21,'Buffalo Bills':2,'Miami Dolphins':15,
  'New England Patriots':17,'New York Jets':20,'Baltimore Ravens':33,
  'Cincinnati Bengals':4,'Cleveland Browns':5,'Pittsburgh Steelers':23,
  'Houston Texans':34,'Indianapolis Colts':11,'Jacksonville Jaguars':30,
  'Tennessee Titans':10,'Denver Broncos':7,'Las Vegas Raiders':13,
  'Los Angeles Chargers':24,'Seattle Seahawks':26,'Arizona Cardinals':22,
  'Los Angeles Rams':14,'New Orleans Saints':18,'Carolina Panthers':29,
  'Atlanta Falcons':1,'Tampa Bay Buccaneers':27,'Green Bay Packers':9,
  'Minnesota Vikings':16,'Chicago Bears':3,'Detroit Lions':8,
  'New York Giants':19,'Washington Commanders':28,
  // NHL
  'Boston Bruins':1,'Buffalo Sabres':2,'Detroit Red Wings':5,'Florida Panthers':13,
  'Montreal Canadiens':8,'Ottawa Senators':9,'Tampa Bay Lightning':14,
  'Toronto Maple Leafs':15,'Carolina Hurricanes':12,'Columbus Blue Jackets':29,
  'New Jersey Devils':1,'New York Islanders':19,'New York Rangers':20,
  'Philadelphia Flyers':4,'Pittsburgh Penguins':5,'Arizona Coyotes':53,
  'Chicago Blackhawks':16,'Colorado Avalanche':17,'Dallas Stars':25,
  'Minnesota Wild':30,'Nashville Predators':18,'St. Louis Blues':19,
  'Winnipeg Jets':52,'Anaheim Ducks':25,'Calgary Flames':3,'Edmonton Oilers':22,
  'Los Angeles Kings':26,'San Jose Sharks':28,'Seattle Kraken':55,'Vancouver Canucks':23,
  'Vegas Golden Knights':54,'Washington Capitals':15,
};

function getESPNSport(sport) {
  if (sport.includes('mlb')) return 'mlb';
  if (sport.includes('nba')) return 'nba';
  if (sport.includes('nfl')||sport.includes('ncaaf')) return 'nfl';
  if (sport.includes('nhl')) return 'nhl';
  return null;
}

function teamLogoHTML(teamName, sport) {
  const espnSport = getESPNSport(sport||currentSport);
  const teamId = ESPN_TEAM_IDS[teamName];
  if (espnSport && teamId) {
    return `<img class="team-logo" 
      src="https://a.espncdn.com/i/teamlogos/${espnSport}/500/${teamId}.png"
      onerror="this.style.display='none';this.nextElementSibling.style.display='flex';"
      alt="${teamName}">
      <div class="team-badge" style="display:none;${teamBadgeStyle(teamName)}">${teamInitials(teamName)}</div>`;
  }
  return `<div class="team-badge" style="${teamBadgeStyle(teamName)}">${teamInitials(teamName)}</div>`;
}

function teamInitials(name) {
  return name.split(' ').map(w=>w[0]).join('').substring(0,3).toUpperCase();
}
function teamBadgeStyle(name) {
  const palette = ['#e63946','#2a9d8f','#e9c46a','#264653','#f4a261','#457b9d','#1d3557','#6d4c41','#37474f','#5e35b1','#00897b','#d81b60'];
  const bg = palette[name.split('').reduce((a,c)=>a+c.charCodeAt(0),0) % palette.length];
  return `background:${bg};`;
}

// ── BOOK BADGES ───────────────────────────────────────────────────────────────
const BOOK_COLORS = {
  draftkings:'#1a7a43', fanduel:'#1493ff', betmgm:'#c8963e',
  caesars:'#0033a0', bovada:'#e8a020', barstool:'#1a1a1a',
  pointsbet:'#e30613', williamhill_us:'#009f6b'
};
function bookBadgeHTML(key) {
  const short = cleanBook(key).split(' ').map(w=>w[0]).join('').substring(0,2).toUpperCase();
  const bg = BOOK_COLORS[key]||'#64748b';
  return `<div class="book-badge" style="background:${bg}">${short}</div>`;
}

// ── MATH ──────────────────────────────────────────────────────────────────────
function americanToDecimal(p) { return p>0?(p/100)+1:(100/Math.abs(p))+1; }
function decimalToImplied(d) { return (1/d)*100; }
function removeVig(probs) { const t=probs.reduce((a,b)=>a+b,0); return probs.map(p=>p/t*100); }
function fmt(n) { return n>0?'+'+n:''+n; }
function cleanBook(k) { return k.replace(/_us$/,'').replace(/_/g,' '); }
function formatTime(iso) {
  const d=new Date(iso);
  return d.toLocaleDateString('en-US',{weekday:'short',month:'short',day:'numeric'})
    +' · '+d.toLocaleTimeString('en-US',{hour:'numeric',minute:'2-digit'});
}

// ── SHARP CONSENSUS ───────────────────────────────────────────────────────────
function getSharpConsensus(outcomeBookMap, outcomeNames, sharpBooks) {
  const sharpPrices = {};
  outcomeNames.forEach(name => {
    const bookData = outcomeBookMap[name]||{};
    const vals = sharpBooks.map(b=>bookData[b]?.price).filter(Boolean);
    if (vals.length) sharpPrices[name] = vals.reduce((a,b)=>a+b,0)/vals.length;
  });
  const names = Object.keys(sharpPrices);
  // Need prices for ALL outcomes to do valid vig removal
  if (names.length < outcomeNames.length || names.length < 2) return null;
  const rawImplied = names.map(n=>decimalToImplied(americanToDecimal(sharpPrices[n])));
  const rawSum = rawImplied.reduce((a,b)=>a+b,0);
  // Sanity: raw implied should sum between 100-130%
  if (rawSum < 95 || rawSum > 130) return null;
  const trueProbs = removeVig(rawImplied);
  // Sanity: no extreme probs in pre-game markets
  if (trueProbs.some(p=>p>96||p<4)) return null;
  const result = {};
  names.forEach((n,i)=>result[n]=trueProbs[i]);
  // Store raw data for tooltip
  result._raw = { sharpPrices, rawImplied, rawSum, sharpBooks };
  return result;
}

// ── SCORING ───────────────────────────────────────────────────────────────────
function calcRowScore(edgePct, bookCount, disagreement, injPenalty) {
  if (edgePct <= 0.3) return null;
  let score;
  if (edgePct>=8) score=10;
  else if (edgePct>=6) score=9;
  else if (edgePct>=5) score=8;
  else if (edgePct>=4) score=7;
  else if (edgePct>=3) score=6;
  else if (edgePct>=2) score=5;
  else if (edgePct>=1) score=4;
  else if (edgePct>=0.5) score=3;
  else score=2;
  if (bookCount>=6) score=Math.min(10,score+1);
  else if (bookCount>=4) score=Math.min(10,score+0.5);
  if (disagreement>=5) score=Math.min(10,score+1);
  else if (disagreement>=3) score=Math.min(10,score+0.5);
  score=Math.max(1,score-injPenalty);
  return Math.round(score);
}

// ── ARB CHECK ─────────────────────────────────────────────────────────────────
function checkArbitrage(outcomeNames, outcomeBookMap) {
  const bestPrices={}, bestBooks={}, bestPoints={};
  outcomeNames.forEach(name => {
    const bookData=outcomeBookMap[name]||{};
    let best=-Infinity, bestBook=null, bestPoint=null;
    Object.entries(bookData).forEach(([book,d])=>{
      if (d.price>best){best=d.price;bestBook=book;bestPoint=d.point;}
    });
    bestPrices[name]=best; bestBooks[name]=bestBook; bestPoints[name]=bestPoint;
  });
  // Sanity: no blowout lines
  for (const name of outcomeNames) {
    if (bestPrices[name]<=-Infinity) continue;
    const imp=decimalToImplied(americanToDecimal(bestPrices[name]));
    if (imp<4||imp>96) return {isArb:false,profit:null,bestPrices,bestBooks};
  }
  const points=outcomeNames.map(n=>bestPoints[n]).filter(p=>p!==undefined&&p!==null);
  if (points.length>=2) {
    const abs=points.map(p=>Math.abs(p));
    if (!abs.every(p=>p===abs[0])) return {isArb:false,profit:null,bestPrices,bestBooks};
  }
  const impliedSum=outcomeNames.reduce((sum,name)=>{
    return sum+(bestPrices[name]>-Infinity?decimalToImplied(americanToDecimal(bestPrices[name])):100);
  },0);
  const isArb=impliedSum<100;
  const profit=isArb?(100-impliedSum).toFixed(2):null;
  return {isArb,profit,bestPrices,bestBooks,impliedSum};
}

function calcArbStakes(outcomeNames, bestPrices, totalStake=100) {
  const decimals={};
  outcomeNames.forEach(n=>decimals[n]=americanToDecimal(bestPrices[n]));
  const impliedSum=outcomeNames.reduce((s,n)=>s+decimalToImplied(decimals[n]),0);
  const stakes={};
  outcomeNames.forEach(n=>{stakes[n]=((decimalToImplied(decimals[n])/impliedSum)*totalStake).toFixed(2);});
  const worstReturn=Math.min(...outcomeNames.map(n=>stakes[n]*decimals[n]));
  return {stakes,guaranteedProfit:(worstReturn-totalStake).toFixed(2)};
}

// ── ODDS MAP ──────────────────────────────────────────────────────────────────
function buildOddsMap(game) {
  const raw={h2h:{},spreads:{},totals:{}};
  game.bookmakers.forEach(bm=>{
    bm.markets.forEach(mk=>{
      if (!raw[mk.key]) return;
      mk.outcomes.forEach(o=>{
        if (!raw[mk.key][o.name]) raw[mk.key][o.name]={};
        raw[mk.key][o.name][bm.key]={price:o.price,point:o.point};
      });
    });
  });
  ['spreads','totals'].forEach(mkt=>{
    Object.keys(raw[mkt]).forEach(outcomeName=>{
      const bookData=raw[mkt][outcomeName];
      const ptCounts={};
      Object.values(bookData).forEach(d=>{
        if (d.point===undefined||d.point===null) return;
        ptCounts[d.point]=(ptCounts[d.point]||0)+1;
      });
      if (!Object.keys(ptCounts).length) return;
      const consensusPt=Object.entries(ptCounts).sort((a,b)=>b[1]-a[1])[0][0];
      Object.keys(bookData).forEach(book=>{
        const pt=bookData[book].point;
        if (pt===undefined||pt===null||String(pt)!==String(consensusPt)) delete bookData[book];
      });
    });
  });
  return raw;
}

// ── TOOLTIP SYSTEM ────────────────────────────────────────────────────────────
const tooltip = document.getElementById('tooltip');

function showTooltip(e, html) {
  tooltip.innerHTML = html;
  tooltip.style.display = 'block';
  positionTooltip(e);
}

function positionTooltip(e) {
  const pad = 14;
  let x = e.clientX + pad;
  let y = e.clientY + pad;
  const tw = tooltip.offsetWidth;
  const th = tooltip.offsetHeight;
  if (x + tw > window.innerWidth - pad) x = e.clientX - tw - pad;
  if (y + th > window.innerHeight - pad) y = e.clientY - th - pad;
  tooltip.style.left = x + 'px';
  tooltip.style.top = y + 'px';
}

function hideTooltip() { tooltip.style.display = 'none'; }

document.addEventListener('mousemove', e => {
  if (tooltip.style.display !== 'none') positionTooltip(e);
});

function trueProbTooltip(trueProb, outcomeName, consensus) {
  const raw = consensus._raw;
  const booksUsed = raw.sharpBooks.filter(b => raw.sharpPrices[b]);
  const rawImpStr = Object.entries(raw.sharpPrices).map(([n,p])=>`${n.split(' ').pop()}: ${decimalToImplied(americanToDecimal(p)).toFixed(1)}%`).join(', ');
  return `<div class="tooltip-title">True Probability — ${trueProb.toFixed(1)}%</div>
    <div class="tooltip-row"><span class="tooltip-label">Sharp books used</span><span class="tooltip-val">${booksUsed.map(cleanBook).join(', ')}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Raw implied (with vig)</span><span class="tooltip-val">${rawImpStr}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">After vig removal</span><span class="tooltip-val">${trueProb.toFixed(1)}%</span></div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">The sharp books set the most accurate lines. We remove their built-in profit margin (vig) to get the true estimated probability.</div>`;
}

function bestCellTooltip(bookKey, price, trueProb, outcomeName, edgeVs) {
  const implied = decimalToImplied(americanToDecimal(price));
  const evOn100 = edgeVs > 0 ? ((edgeVs/100) * 91).toFixed(2) : null;
  return `<div class="tooltip-title">Best Available Line — ${cleanBook(bookKey)}</div>
    <div class="tooltip-row"><span class="tooltip-label">Their odds</span><span class="tooltip-val">${fmt(price)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Their implied prob</span><span class="tooltip-val">${implied.toFixed(1)}%</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Sharp true prob</span><span class="tooltip-val">${trueProb ? trueProb.toFixed(1)+'%' : 'N/A'}</span></div>
    ${edgeVs !== null ? `<div class="tooltip-row"><span class="tooltip-label">Edge vs consensus</span><span class="tooltip-val" style="color:${edgeVs>0?'#16a34a':'#dc2626'}">${edgeVs>0?'+':''}${edgeVs.toFixed(1)}%</span></div>` : ''}
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">${edgeVs>0 ? `${cleanBook(bookKey)} is offering better odds than the sharp consensus implies. This is a +EV bet.` : 'Best available line but slightly below the sharp consensus. Shop around.'}</div>`;
}

function arbCellTooltip(bookKey, price, outcomeName, arbResult, arbStakes) {
  const implied = decimalToImplied(americanToDecimal(price));
  const stakeStr = Object.entries(arbStakes.stakes).map(([n,s])=>`${n.split(' ').pop()}: $${s}`).join(' · ');
  return `<div class="tooltip-title">⬡ Arbitrage Opportunity</div>
    <div class="tooltip-row"><span class="tooltip-label">Best line for ${outcomeName.split(' ').pop()}</span><span class="tooltip-val">${cleanBook(bookKey)} ${fmt(price)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Combined implied</span><span class="tooltip-val">${arbResult.impliedSum.toFixed(1)}%</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Guaranteed profit</span><span class="tooltip-val" style="color:#7c3aed">+$${arbStakes.guaranteedProfit} per $100</span></div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-row"><span class="tooltip-label">Bet breakdown</span><span class="tooltip-val">${stakeStr}</span></div>
    <div class="tooltip-note">Place these bets simultaneously across books. You profit no matter who wins.</div>`;
}

function scoreBadgeTooltip(score, edgePct, bookCount, disagreement, injPenalty, trueProb, bestPrice) {
  const implied = bestPrice ? decimalToImplied(americanToDecimal(bestPrice)).toFixed(1) : null;
  const label = score>=8?'Strong edge':score>=6?'Good edge':score>=4?'Moderate edge':'Weak edge';
  return `<div class="tooltip-title">EV Score ${score}/10 — ${label}</div>
    <div class="tooltip-row"><span class="tooltip-label">Edge vs consensus</span><span class="tooltip-val">${edgePct>0?'+':''}${edgePct.toFixed(1)}%</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Books available</span><span class="tooltip-val">${bookCount}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Book disagreement</span><span class="tooltip-val">${disagreement.toFixed(1)}%</span></div>
    ${injPenalty>0?`<div class="tooltip-row"><span class="tooltip-label">Injury penalty</span><span class="tooltip-val" style="color:#dc2626">-${injPenalty}</span></div>`:''}
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">Score is based on: how much better the best line is vs the sharp consensus, how many books are available, how much the books disagree, and injury risk. 8-10 = strong edge worth acting on.</div>`;
}

// ── DATA FETCHING ─────────────────────────────────────────────────────────────
async function fetchScores(sport) {
  try {
    const res = await fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_KEY}&daysFrom=1`);
    if (!res.ok) return;
    const data = await res.json();
    data.forEach(s=>{scoresCache[s.id]=s;});
    updateScoresOnPage();
  } catch(e) {}
}

function updateScoresOnPage() {
  Object.entries(scoresCache).forEach(([id, s]) => {
    const el = document.getElementById('scores-'+id);
    if (!el) return;
    if (s.scores) {
      s.scores.forEach(team => {
        const scoreEl = el.querySelector('[data-team="'+team.name+'"]');
        if (scoreEl) scoreEl.textContent = team.score;
      });
    }
    const periodEl = el.querySelector('.game-period');
    if (periodEl && s.last_update && !s.completed) {
      periodEl.textContent = 'LIVE';
    }
  });
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
  const cs = toClearSport(sport);
  if (!cs) return;
  try {
    const res = await fetch(`https://api.clearsportsapi.com/v1/${cs}/injuries`,
      {headers:{'Authorization':`Bearer ${CLEAR_KEY}`}});
    if (!res.ok) return;
    const data = await res.json();
    const injuries = data.data||data.injuries||data||[];
    injuries.forEach(inj=>{
      const team=inj.team?.name||inj.team;
      if (!team) return;
      if (!injuryCache[team]) injuryCache[team]=0;
      const status=(inj.status||'').toLowerCase();
      if (status.includes('out')) injuryCache[team]=Math.min(3,injuryCache[team]+1.5);
      else if (status.includes('questionable')||status.includes('doubtful'))
        injuryCache[team]=Math.min(3,injuryCache[team]+0.5);
    });
  } catch(e) {}
}

// ── REFRESH LOGIC ─────────────────────────────────────────────────────────────
function updateRefreshStatus(fetching) {
  const el = document.getElementById('refresh-status');
  if (!el) return;
  if (fetching) {
    el.innerHTML = '<div class="refresh-dot"></div> Fetching...';
    return;
  }
  if (refreshCount >= MAX_REFRESHES) {
    el.innerHTML = '<div class="refresh-dot idle"></div> Auto-refresh ended (1 hour limit)';
    return;
  }
  const secsLeft = nextRefreshAt ? Math.max(0, Math.round((nextRefreshAt - Date.now()) / 1000)) : 0;
  const mins = Math.floor(secsLeft/60);
  const secs = secsLeft%60;
  el.innerHTML = `<div class="refresh-dot"></div> Next refresh in ${mins}:${secs.toString().padStart(2,'0')}`;
}

function scheduleNextRefresh() {
  if (refreshCount >= MAX_REFRESHES) {
    updateRefreshStatus(false);
    return;
  }
  nextRefreshAt = Date.now() + REFRESH_INTERVAL_MS;
  refreshTimer = setTimeout(async () => {
    refreshCount++;
    await doFetch(currentSport, false);
    scheduleNextRefresh();
  }, REFRESH_INTERVAL_MS);

  clearInterval(countdownTimer);
  countdownTimer = setInterval(() => updateRefreshStatus(false), 1000);
}

async function manualFetch() {
  clearTimeout(refreshTimer);
  clearInterval(countdownTimer);
  refreshCount = 0;
  currentSport = document.getElementById('sport-sel').value;
  scoresCache = {};
  injuryCache = {};
  await doFetch(currentSport, true);
  scheduleNextRefresh();
  // Start score polling every 60s
  clearInterval(scoresTimer);
  scoresTimer = setInterval(() => fetchScores(currentSport), 60000);
}

async function doFetch(sport, showLoading) {
  const btn = document.getElementById('fetch-btn');
  const apiNote = document.getElementById('api-remaining');
  const container = document.getElementById('games-container');
  const isSoccer = sport.includes('soccer')||sport.includes('world_cup');
  currentSharpBooks = isSoccer ? SOCCER_SHARP : SHARP_BOOKS;
  const regions = isSoccer ? 'us,uk,eu' : 'us';
  const minBooks = parseInt(document.getElementById('min-books').value);

  btn.disabled = true;
  btn.textContent = 'Fetching...';
  updateRefreshStatus(true);
  if (showLoading) container.innerHTML = '<p class="status-msg">Loading games...</p>';

  try {
    await Promise.all([fetchScores(sport), fetchInjuries(sport)]);
    const url = `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_KEY}&regions=${regions}&markets=${MARKETS.join(',')}&oddsFormat=american&bookmakers=${BOOKS.join(',')}`;
    const res = await fetch(url);
    const remaining = res.headers.get('x-requests-remaining');
    const used = res.headers.get('x-requests-used');
    if (remaining !== null) {
      apiNote.innerHTML = `${used} requests used · ${remaining} remaining this month`;
    }
    if (!res.ok) throw new Error('API error '+res.status);
    const data = await res.json();
    const filtered = data.filter(g=>g.bookmakers.length>=minBooks);
    if (!filtered.length) {
      container.innerHTML = '<p class="status-msg">No games found. Try lowering Min Books.</p>';
    } else {
      renderGames(filtered, sport);
    }
    fetchProps(sport);
  } catch(e) {
    container.innerHTML = `<p class="status-msg">Could not load odds: ${e.message}</p>`;
  } finally {
    btn.disabled = false;
    btn.textContent = 'Fetch odds';
    updateRefreshStatus(false);
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
    const booksPresent = [...new Set(game.bookmakers.map(b=>b.key))];
    const scoreData = scoresCache[game.id]||null;
    const isLive = scoreData && !scoreData.completed && scoreData.scores;
    const awayPenalty = Math.round(injuryCache[game.away_team]||0);
    const homePenalty = Math.round(injuryCache[game.home_team]||0);

    const awayScoreVal = scoreData?.scores?.find(s=>s.name===game.away_team)?.score;
    const homeScoreVal = scoreData?.scores?.find(s=>s.name===game.home_team)?.score;
    const awayLeading = awayScoreVal!==undefined && parseInt(awayScoreVal)>parseInt(homeScoreVal);
    const homeLeading = homeScoreVal!==undefined && parseInt(homeScoreVal)>parseInt(awayScoreVal);

    const injBadge = p => p>=2?`<span class="inj-badge inj-out">INJ</span>`:p>=1?`<span class="inj-badge inj-q">Q</span>`:'';

    const card = document.createElement('div');
    card.className = 'game-card';
    card.id = 'card-'+game.id;

    card.innerHTML = `
      <div class="game-header" id="scores-${game.id}">
        <div class="teams-col">
          <div class="team-row">
            ${teamLogoHTML(game.away_team, sport)}
            <span class="team-name${awayLeading?' leading':''}">${game.away_team}</span>
            ${injBadge(awayPenalty)}
            <span class="team-score${awayLeading?' leading':''}" data-team="${game.away_team}">${awayScoreVal!==undefined?awayScoreVal:''}</span>
            ${isLive?'<span class="game-period">LIVE</span>':''}
          </div>
          <div class="team-row" style="margin-top:6px">
            ${teamLogoHTML(game.home_team, sport)}
            <span class="team-name${homeLeading?' leading':''}">${game.home_team}</span>
            ${injBadge(homePenalty)}
            <span class="team-score${homeLeading?' leading':''}" data-team="${game.home_team}">${homeScoreVal!==undefined?homeScoreVal:''}</span>
          </div>
        </div>
        <div class="game-right">
          ${isLive?'<div class="live-badge">● LIVE</div>':''}
          <div class="game-time">${formatTime(game.commence_time)}</div>
          <div class="game-sport">${game.sport_title}</div>
        </div>
      </div>
    `;

    const table = document.createElement('table');
    table.className = 'odds-table';
    table.innerHTML = `<thead><tr>
      <th class="market-th">Market</th>
      ${booksPresent.map(b=>`<th class="book-th"><div class="book-header">${bookBadgeHTML(b)}<span class="book-label">${cleanBook(b)}</span></div></th>`).join('')}
      <th class="score-th">Score</th>
    </tr></thead>`;

    const tbody = document.createElement('tbody');
    const marketGroups = [
      {key:'h2h',label:'Moneyline'},
      {key:'spreads',label:'Spread'},
      {key:'totals',label:'Total'}
    ];

    marketGroups.forEach((mkt, mktIdx) => {
      const outcomes = Object.keys(oddsMap[mkt.key]);
      if (!outcomes.length) return;
      const consensus = getSharpConsensus(oddsMap[mkt.key], outcomes, currentSharpBooks);
      const arbResult = checkArbitrage(outcomes, oddsMap[mkt.key]);
      const arbStakes = arbResult.isArb ? calcArbStakes(outcomes, arbResult.bestPrices) : null;

      if (mktIdx > 0) {
        const divRow = document.createElement('tr');
        divRow.className = 'section-divider';
        divRow.innerHTML = `<td colspan="${booksPresent.length+2}"><span class="section-divider-label">${mkt.label}</span></td>`;
        tbody.appendChild(divRow);
      }

      outcomes.forEach((outcomeName, oi) => {
        const bookData = oddsMap[mkt.key][outcomeName];
        const prices = Object.values(bookData).map(d=>d.price);
        const bestPrice = prices.length ? Math.max(...prices) : null;
        const trueProb = consensus ? consensus[outcomeName] : null;
        const sideLabel = outcomeName===game.home_team?'Home':outcomeName===game.away_team?'Away':outcomeName;

        let bestEdge=0, bookDisagreement=0;
        if (trueProb && bestPrice) {
          const bestImplied = decimalToImplied(americanToDecimal(bestPrice));
          bestEdge = trueProb - bestImplied;
          const worstPrice = Math.min(...prices);
          bookDisagreement = Math.abs(decimalToImplied(americanToDecimal(bestPrice)) - decimalToImplied(americanToDecimal(worstPrice)));
        }
        const injPenalty = outcomeName===game.away_team?Math.round(homePenalty):Math.round(awayPenalty);
        const rowScore = arbResult.isArb ? 10 : calcRowScore(bestEdge, booksPresent.length, bookDisagreement, injPenalty);

        const row = document.createElement('tr');
        if (arbResult.isArb) row.className = 'arb-row';

        // Build cells
        const cellsHTML = booksPresent.map(bookKey => {
          const d = bookData[bookKey];
          if (!d) return `<td class="odds-td empty">—</td>`;
          const isBest = d.price === bestPrice;
          const isArb = arbResult.isArb && d.price === arbResult.bestPrices[outcomeName];
          const implied = decimalToImplied(americanToDecimal(d.price));
          const edgeVs = trueProb ? trueProb - implied : null;

          let cellClass = 'odds-td';
          if (isArb) cellClass += ' arb-cell';
          else if (isBest) cellClass += ' best-cell';

          // Build tooltip data attrs
          let tipAttrs = '';
          if (isArb && arbStakes) {
            const arbTip = arbCellTooltip(bookKey, d.price, outcomeName, arbResult, arbStakes);
            tipAttrs = `data-tip="${encodeURIComponent(arbTip)}"`;
          } else if (isBest && trueProb) {
            const bestTip = bestCellTooltip(bookKey, d.price, trueProb, outcomeName, edgeVs);
            tipAttrs = `data-tip="${encodeURIComponent(bestTip)}"`;
          }

          return `<td class="${cellClass}" ${tipAttrs}
            onmouseenter="if(this.dataset.tip)showTooltip(event,decodeURIComponent(this.dataset.tip))"
            onmouseleave="hideTooltip()">
            ${d.point!==undefined&&d.point!==null?`<div class="odds-point">${d.point>0?'+':''}${d.point}</div>`:''}
            <div class="odds-val">${fmt(d.price)}</div>
            <div class="odds-implied">${implied.toFixed(1)}%</div>
          </td>`;
        }).join('');

        // True prob tooltip
        let trueProbHTML = '';
        if (trueProb && consensus) {
          const tpTip = trueProbTooltip(trueProb, outcomeName, consensus);
          trueProbHTML = `<div class="true-prob" data-tip="${encodeURIComponent(tpTip)}"
            onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))"
            onmouseleave="hideTooltip()">True: ${trueProb.toFixed(1)}%</div>`;
        }

        // Score tooltip
        let scoreTip = '';
        if (rowScore && !arbResult.isArb) {
          scoreTip = scoreBadgeTooltip(rowScore, bestEdge, booksPresent.length, bookDisagreement, injPenalty, trueProb, bestPrice);
        } else if (arbResult.isArb) {
          scoreTip = `<div class="tooltip-title">Score 10 — Arbitrage</div><div class="tooltip-note">Guaranteed profit regardless of outcome. Bet both sides simultaneously.</div>`;
        }

        row.innerHTML = `
          <td class="market-td${arbResult.isArb?' arb-market':''}">
            <div class="market-name">${oi===0?`<strong>${mkt.label}</strong>`:''}</div>
            <div class="market-side">${sideLabel}</div>
            ${trueProbHTML}
            ${arbResult.isArb&&oi===0?`<div class="arb-label" 
              data-tip="${encodeURIComponent(`<div class='tooltip-title'>⬡ Arbitrage — Guaranteed Profit</div><div class='tooltip-row'><span class='tooltip-label'>Profit per $100</span><span class='tooltip-val' style='color:#7c3aed'>+$${arbStakes.guaranteedProfit}</span></div><div class='tooltip-note'>Bet: ${Object.entries(arbStakes.stakes).map(([n,s])=>cleanBook(arbResult.bestBooks[n]||'')+' $'+s+' on '+n.split(' ').pop()).join(' · ')}</div>`)}"
              onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))"
              onmouseleave="hideTooltip()">⬡ ARB +$${arbStakes.guaranteedProfit} / $100</div>`:''}
          </td>
          ${cellsHTML}
          <td class="score-td">
            ${rowScore
              ? `<div class="ev-score s${rowScore}" 
                  data-tip="${encodeURIComponent(scoreTip)}"
                  onmouseenter="if(this.dataset.tip)showTooltip(event,decodeURIComponent(this.dataset.tip))"
                  onmouseleave="hideTooltip()">${rowScore}</div>`
              : `<div class="ev-score-empty">—</div>`}
          </td>
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
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-lines').style.display = tab==='lines'?'block':'none';
  document.getElementById('tab-props').style.display = tab==='props'?'block':'none';
  if (btn) btn.classList.add('active');
}

// ── PROPS ─────────────────────────────────────────────────────────────────────
const PROPLINE_SPORT_MAP = {
  'baseball_mlb':'baseball_mlb','basketball_nba':'basketball_nba',
  'basketball_ncaab':'basketball_ncaab','icehockey_nhl':'icehockey_nhl',
  'americanfootball_nfl':'americanfootball_nfl','americanfootball_ncaaf':'americanfootball_ncaaf',
  'soccer_epl':'soccer_england_premier_league','soccer_uefa_champs_league':'soccer_uefa_champs_league',
  'soccer_fifa_world_cup':'soccer_fifa_world_cup'
};
const PROP_MARKETS = {
  'baseball_mlb':['pitcher_strikeouts','batter_hits','batter_home_runs','batter_rbis'],
  'basketball_nba':['player_points','player_rebounds','player_assists','player_threes'],
  'basketball_ncaab':['player_points','player_rebounds','player_assists'],
  'icehockey_nhl':['player_points','player_goals','player_assists','player_shots_on_goal'],
  'americanfootball_nfl':['player_pass_yds','player_rush_yds','player_reception_yds','player_receptions'],
  'americanfootball_ncaaf':['player_pass_yds','player_rush_yds'],
  'soccer_epl':['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_uefa_champs_league':['player_shots_on_target','player_goal_scorer_anytime'],
  'soccer_fifa_world_cup':['player_goal_scorer_anytime','player_shots_on_target']
};
function cleanPropName(key) {
  return key.replace(/^(player_|pitcher_|batter_)/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());
}

async function fetchProps(sport) {
  const container = document.getElementById('props-container');
  const propSport = PROPLINE_SPORT_MAP[sport];
  if (!propSport) { container.innerHTML='<p class="status-msg">Player props not available for this sport.</p>'; return; }
  const markets = PROP_MARKETS[sport]||['player_points'];
  try {
    const evRes = await fetch(`https://api.prop-line.com/v1/sports/${propSport}/events?apiKey=${PROPLINE_KEY}`);
    if (!evRes.ok) throw new Error('Events '+evRes.status);
    const evData = await evRes.json();
    const events = Array.isArray(evData)?evData:(evData.data||evData.events||[]);
    if (!events.length) { container.innerHTML='<p class="status-msg">No upcoming games with player props.</p>'; return; }
    const propsData=[];
    for (const event of events.slice(0,6)) {
      try {
        const eventId=event.id||event.event_id;
        const oddsRes=await fetch(`https://api.prop-line.com/v1/sports/${propSport}/events/${eventId}/odds?markets=${markets.join(',')}&apiKey=${PROPLINE_KEY}`);
        if (!oddsRes.ok) continue;
        const d=await oddsRes.json();
        const norm=Array.isArray(d)?d[0]:(d.bookmakers?d:(d.data||d));
        if (norm&&(norm.bookmakers||norm.id)) propsData.push(norm);
      } catch(e) {}
    }
    if (!propsData.length) { container.innerHTML='<p class="status-msg">No player props posted yet for today.</p>'; return; }
    renderProps(propsData);
  } catch(e) {
    container.innerHTML=`<p class="status-msg">Props error: ${e.message}</p>`;
  }
}

function renderProps(games) {
  const container=document.getElementById('props-container');
  container.innerHTML='';
  const list=document.createElement('div');
  list.className='games-list';
  games.forEach(game=>{
    const propMap={};
    (game.bookmakers||[]).forEach(bm=>{
      (bm.markets||[]).forEach(mk=>{
        if (!propMap[mk.key]) propMap[mk.key]={};
        (mk.outcomes||[]).forEach(o=>{
          const key=(o.description||o.name)+'||'+(o.name||'');
          if (!propMap[mk.key][key]) propMap[mk.key][key]={label:o.description||o.name,side:o.name,books:{}};
          propMap[mk.key][key].books[bm.key]={price:o.price,point:o.point};
        });
      });
    });
    const propKeys=Object.keys(propMap);
    if (!propKeys.length) return;
    const card=document.createElement('div');
    card.className='game-card';
    card.innerHTML=`<div class="game-header">
      <div class="teams-col">
        <div class="team-row">${teamLogoHTML(game.away_team||'Away')}<span class="team-name">${game.away_team||'Away'}</span></div>
        <div class="team-row" style="margin-top:6px">${teamLogoHTML(game.home_team||'Home')}<span class="team-name">${game.home_team||'Home'}</span></div>
      </div>
      <div class="game-right">
        <div class="game-time">${game.commence_time?formatTime(game.commence_time):''}</div>
        <div class="game-sport">${game.sport_title||''}</div>
      </div>
    </div>`;
    propKeys.forEach(mktKey=>{
      const players=propMap[mktKey];
      const playerNames=[...new Set(Object.values(players).map(p=>p.label))];
      const allBooks=[...new Set(Object.values(players).flatMap(p=>Object.keys(p.books)))];
      if (!allBooks.length) return;
      const sec=document.createElement('div');
      sec.className='prop-section-header';
      sec.textContent=cleanPropName(mktKey);
      card.appendChild(sec);
      const table=document.createElement('table');
      table.className='odds-table';
      table.innerHTML=`<thead><tr><th class="market-th">Player</th>${allBooks.map(b=>`<th class="book-th"><div class="book-header">${bookBadgeHTML(b)}<span class="book-label">${cleanBook(b)}</span></div></th>`).join('')}</tr></thead>`;
      const tbody=document.createElement('tbody');
      playerNames.forEach(playerName=>{
        const entries=Object.values(players).filter(p=>p.label===playerName);
        const sides=[...new Set(entries.map(e=>e.side))];
        sides.forEach((side,si)=>{
          const entry=entries.find(e=>e.side===side);
          if (!entry) return;
          const prices=Object.values(entry.books).map(d=>d.price);
          const bestPrice=prices.length?Math.max(...prices):null;
          const row=document.createElement('tr');
          row.innerHTML=`
            <td class="market-td">
              ${si===0?`<div class="market-name"><strong>${playerName}</strong></div>`:''}
              <div class="market-side">${side}${Object.values(entry.books)[0]?.point!==undefined?' '+Object.values(entry.books)[0]?.point:''}</div>
            </td>
            ${allBooks.map(bookKey=>{
              const d=entry.books[bookKey];
              if (!d) return `<td class="odds-td empty">—</td>`;
              const isBest=d.price===bestPrice;
              const implied=decimalToImplied(americanToDecimal(d.price)).toFixed(1);
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

// ── AUTO START ────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  currentSport = document.getElementById('sport-sel').value;
  manualFetch();
});
