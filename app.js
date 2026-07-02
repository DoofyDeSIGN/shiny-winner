const API_BASE = 'https://edgefinder-api.vercel.app';
const BOOKS = ['draftkings','fanduel','betmgm','caesars','pointsbet','williamhill_us','barstool','bovada'];
const SHARP_BOOKS = ['draftkings','fanduel'];
const SOFT_BOOKS = ['bovada','barstool','pointsbet'];
const SOCCER_SHARP = ['draftkings','fanduel','betmgm','bovada'];
const MARKETS = ['h2h','spreads','totals'];

// Auto-refresh config
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
let bettingCache = {};
let currentSharpBooks = SHARP_BOOKS;

// Opening lines stored on first fetch per session
// Structure: { gameId_marketKey_outcomeName: { sharpAvg, softAvg, timestamp } }
let openingLines = {};

// ── TEAM LOGOS ────────────────────────────────────────────────────────────────
const ESPN_TEAM_IDS = {
  'New York Yankees':10,'Boston Red Sox':2,'Los Angeles Dodgers':19,'Chicago Cubs':16,
  'Houston Astros':18,'Atlanta Braves':15,'New York Mets':21,'Philadelphia Phillies':22,
  'San Diego Padres':25,'San Francisco Giants':26,'St. Louis Cardinals':24,
  'Toronto Blue Jays':14,'Minnesota Twins':9,'Cleveland Guardians':5,
  'Chicago White Sox':4,'Detroit Tigers':6,'Kansas City Royals':7,
  'Milwaukee Brewers':8,'Pittsburgh Pirates':23,'Cincinnati Reds':17,
  'Arizona Diamondbacks':29,'Colorado Rockies':27,'Los Angeles Angels':3,
  'Oakland Athletics':11,'Seattle Mariners':12,'Tampa Bay Rays':30,
  'Texas Rangers':13,'Miami Marlins':28,'Baltimore Orioles':1,'Washington Nationals':20,
  'Los Angeles Lakers':13,'Golden State Warriors':9,'Boston Celtics':2,
  'Miami Heat':14,'Chicago Bulls':4,'Brooklyn Nets':17,'Milwaukee Bucks':15,
  'Phoenix Suns':21,'Dallas Mavericks':6,'Denver Nuggets':7,
  'Philadelphia 76ers':20,'Toronto Raptors':28,'Atlanta Hawks':1,
  'New York Knicks':18,'Cleveland Cavaliers':5,'Indiana Pacers':11,
  'Orlando Magic':19,'Charlotte Hornets':30,'Detroit Pistons':8,
  'Memphis Grizzlies':29,'New Orleans Pelicans':3,'Oklahoma City Thunder':25,
  'Sacramento Kings':23,'San Antonio Spurs':24,'Utah Jazz':26,
  'Minnesota Timberwolves':16,'Portland Trail Blazers':22,'Los Angeles Clippers':12,'Houston Rockets':10,
  'Kansas City Chiefs':12,'San Francisco 49ers':25,'Dallas Cowboys':6,
  'Philadelphia Eagles':21,'Buffalo Bills':2,'Miami Dolphins':15,
  'New England Patriots':17,'New York Jets':20,'Baltimore Ravens':33,
  'Cincinnati Bengals':4,'Cleveland Browns':5,'Pittsburgh Steelers':23,
  'Houston Texans':34,'Indianapolis Colts':11,'Jacksonville Jaguars':30,
  'Tennessee Titans':10,'Denver Broncos':7,'Las Vegas Raiders':13,
  'Los Angeles Chargers':24,'Seattle Seahawks':26,'Arizona Cardinals':22,
  'Los Angeles Rams':14,'New Orleans Saints':18,'Carolina Panthers':29,
  'Tampa Bay Buccaneers':27,'Green Bay Packers':9,'Minnesota Vikings':16,
  'Chicago Bears':3,'Detroit Lions':8,'New York Giants':19,'Washington Commanders':28,
};

function getESPNSport(sport) {
  if (!sport) sport = currentSport;
  if (sport.includes('mlb')) return 'mlb';
  if (sport.includes('nba')) return 'nba';
  if (sport.includes('nfl')||sport.includes('ncaaf')) return 'nfl';
  if (sport.includes('nhl')) return 'nhl';
  return null;
}

// Direct logo URLs from Wikipedia/Wikimedia commons — CORS open, reliable
const TEAM_LOGO_URLS = {
  // MLB
  'New York Yankees': 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/New_York_Yankees_logo.svg/120px-New_York_Yankees_logo.svg.png',
  'Boston Red Sox': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/6d/RedSoxPrimary_HangingSocks.svg/120px-RedSoxPrimary_HangingSocks.svg.png',
  'Los Angeles Dodgers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0e/Los_Angeles_Dodgers_Logo.svg/120px-Los_Angeles_Dodgers_Logo.svg.png',
  'Chicago Cubs': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/ChicagoCubs_logo.svg/120px-ChicagoCubs_logo.svg.png',
  'Houston Astros': 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6b/Houston-Astros-Logo.svg/120px-Houston-Astros-Logo.svg.png',
  'Atlanta Braves': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/f2/Atlanta_Braves.svg/120px-Atlanta_Braves.svg.png',
  'New York Mets': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7b/New_York_Mets.svg/120px-New_York_Mets.svg.png',
  'Philadelphia Phillies': 'https://upload.wikimedia.org/wikipedia/en/thumb/5/54/Philadelphia_Phillies_logo.svg/120px-Philadelphia_Phillies_logo.svg.png',
  'San Diego Padres': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/7d/San_Diego_Padres_logo.svg/120px-San_Diego_Padres_logo.svg.png',
  'San Francisco Giants': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/63/Giants_Logo.svg/120px-Giants_Logo.svg.png',
  'St. Louis Cardinals': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/9d/StLouisCardinals_cap_logo.svg/120px-StLouisCardinals_cap_logo.svg.png',
  'Toronto Blue Jays': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c9/Toronto_Blue_Jays_Logo.svg/120px-Toronto_Blue_Jays_Logo.svg.png',
  'Minnesota Twins': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a8/Minnesota_Twins_logo.svg/120px-Minnesota_Twins_logo.svg.png',
  'Cleveland Guardians': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2c/Cleveland_Guardians_Logo.svg/120px-Cleveland_Guardians_Logo.svg.png',
  'Chicago White Sox': 'https://upload.wikimedia.org/wikipedia/en/thumb/c/c1/Chicago_White_Sox.svg/120px-Chicago_White_Sox.svg.png',
  'Detroit Tigers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Detroit_Tigers_logo.svg/120px-Detroit_Tigers_logo.svg.png',
  'Kansas City Royals': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/1a/Kansas_City_Royals_logo.svg/120px-Kansas_City_Royals_logo.svg.png',
  'Milwaukee Brewers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/06/Milwaukee_Brewers_logo_%282020%29.svg/120px-Milwaukee_Brewers_logo_%282020%29.svg.png',
  'Pittsburgh Pirates': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/81/Pittsburgh_Pirates_logo.svg/120px-Pittsburgh_Pirates_logo.svg.png',
  'Cincinnati Reds': 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Cincinnati_Reds_Logo.svg/120px-Cincinnati_Reds_Logo.svg.png',
  'Arizona Diamondbacks': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/60/Arizona_Diamondbacks_logo.svg/120px-Arizona_Diamondbacks_logo.svg.png',
  'Colorado Rockies': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/0a/Colorado_Rockies_logo.svg/120px-Colorado_Rockies_logo.svg.png',
  'Los Angeles Angels': 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8b/Los_Angeles_Angels_of_Anaheim.svg/120px-Los_Angeles_Angels_of_Anaheim.svg.png',
  'Seattle Mariners': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Seattle_Mariners_logo_%28low_res%29.svg/120px-Seattle_Mariners_logo_%28low_res%29.svg.png',
  'Tampa Bay Rays': 'https://upload.wikimedia.org/wikipedia/en/thumb/3/35/Tampa_Bay_Rays_logo_%282019%29.svg/120px-Tampa_Bay_Rays_logo_%282019%29.svg.png',
  'Texas Rangers': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/43/Texas_Rangers.svg/120px-Texas_Rangers.svg.png',
  'Miami Marlins': 'https://upload.wikimedia.org/wikipedia/en/thumb/a/a4/Miami_Marlins_Logo.svg/120px-Miami_Marlins_Logo.svg.png',
  'Baltimore Orioles': 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cc/Baltimore_Orioles_cap_logo.svg/120px-Baltimore_Orioles_cap_logo.svg.png',
  'Washington Nationals': 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a3/Washington_Nationals_logo.svg/120px-Washington_Nationals_logo.svg.png',
  'Oakland Athletics': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5f/Oakland_Athletics_SVG.svg/120px-Oakland_Athletics_SVG.svg.png',
  // NBA
  'Los Angeles Lakers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3c/Los_Angeles_Lakers_logo.svg/120px-Los_Angeles_Lakers_logo.svg.png',
  'Golden State Warriors': 'https://upload.wikimedia.org/wikipedia/en/thumb/0/01/Golden_State_Warriors_logo.svg/120px-Golden_State_Warriors_logo.svg.png',
  'Boston Celtics': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8b/Boston_Celtics.svg/120px-Boston_Celtics.svg.png',
  'Miami Heat': 'https://upload.wikimedia.org/wikipedia/en/thumb/f/fb/Miami_Heat_logo.svg/120px-Miami_Heat_logo.svg.png',
  'Chicago Bulls': 'https://upload.wikimedia.org/wikipedia/en/thumb/6/67/Chicago_Bulls_logo.svg/120px-Chicago_Bulls_logo.svg.png',
  'Milwaukee Bucks': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4a/Milwaukee_Bucks_logo.svg/120px-Milwaukee_Bucks_logo.svg.png',
  'Phoenix Suns': 'https://upload.wikimedia.org/wikipedia/en/thumb/d/dc/Phoenix_Suns_logo.svg/120px-Phoenix_Suns_logo.svg.png',
  'Dallas Mavericks': 'https://upload.wikimedia.org/wikipedia/en/thumb/9/90/Dallas_Mavericks_logo.svg/120px-Dallas_Mavericks_logo.svg.png',
  'Denver Nuggets': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/76/Denver_Nuggets.svg/120px-Denver_Nuggets.svg.png',
  'Philadelphia 76ers': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Philadelphia_76ers_logo.svg/120px-Philadelphia_76ers_logo.svg.png',
  // NFL
  'Kansas City Chiefs': 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e1/Kansas_City_Chiefs_logo.svg/120px-Kansas_City_Chiefs_logo.svg.png',
  'San Francisco 49ers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3a/San_Francisco_49ers_logo.svg/120px-San_Francisco_49ers_logo.svg.png',
  'Dallas Cowboys': 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/15/Dallas_Cowboys.svg/120px-Dallas_Cowboys.svg.png',
  'Philadelphia Eagles': 'https://upload.wikimedia.org/wikipedia/en/thumb/8/8e/Philadelphia_Eagles_logo.svg/120px-Philadelphia_Eagles_logo.svg.png',
  'Buffalo Bills': 'https://upload.wikimedia.org/wikipedia/en/thumb/7/77/Buffalo_Bills_logo.svg/120px-Buffalo_Bills_logo.svg.png',
  'Green Bay Packers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/50/Green_Bay_Packers_logo.svg/120px-Green_Bay_Packers_logo.svg.png',
  'New England Patriots': 'https://upload.wikimedia.org/wikipedia/en/thumb/4/4f/New_England_Patriots_logo.svg/120px-New_England_Patriots_logo.svg.png',
  'Baltimore Ravens': 'https://upload.wikimedia.org/wikipedia/en/thumb/1/16/Baltimore_Ravens_logo.svg/120px-Baltimore_Ravens_logo.svg.png',
  'Pittsburgh Steelers': 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/Pittsburgh_Steelers_logo.svg/120px-Pittsburgh_Steelers_logo.svg.png',
};

function teamLogoHTML(teamName, sport) {
  const initials = teamName.split(' ').map(w=>w[0]).join('').substring(0,3).toUpperCase();
  const palette = ['#e63946','#2a9d8f','#e9c46a','#264653','#f4a261','#457b9d','#1d3557','#6d4c41','#37474f','#5e35b1','#00897b','#d81b60'];
  const bg = palette[teamName.split('').reduce((a,c)=>a+c.charCodeAt(0),0)%palette.length];
  const logoUrl = TEAM_LOGO_URLS[teamName];
  if (logoUrl) {
    return `<img class="team-logo" src="${logoUrl}" onerror="this.style.display='none';this.nextElementSibling.style.display='flex'" alt="${teamName}"><div class="team-badge" style="display:none;background:${bg}">${initials}</div>`;
  }
  return `<div class="team-badge" style="background:${bg}">${initials}</div>`;
}

// ── BOOK BADGES ───────────────────────────────────────────────────────────────
const BOOK_COLORS = {
  draftkings:'#1a7a43',fanduel:'#1493ff',betmgm:'#c8963e',
  caesars:'#0033a0',bovada:'#e8a020',barstool:'#1a1a1a',
  pointsbet:'#e30613',williamhill_us:'#009f6b'
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
  if (names.length < outcomeNames.length || names.length < 2) return null;
  const rawImplied = names.map(n=>decimalToImplied(americanToDecimal(sharpPrices[n])));
  const rawSum = rawImplied.reduce((a,b)=>a+b,0);
  if (rawSum < 95 || rawSum > 130) return null;
  const trueProbs = removeVig(rawImplied);
  if (trueProbs.some(p=>p>96||p<4)) return null;
  const result = {};
  names.forEach((n,i)=>result[n]=trueProbs[i]);
  result._raw = { sharpPrices, rawImplied, rawSum, sharpBooks };
  return result;
}

// ── SHARP vs PUBLIC SIGNAL ────────────────────────────────────────────────────
// Uses three signals:
// 1. Sharp/soft book divergence: sharp books (DK/FD) pricing differently than soft books (Bovada/Barstool)
//    means sharp money has moved the sharp books but soft books haven't caught up yet
// 2. Line movement: compares current sharp avg to stored opening line sharp avg
//    If line moved toward this side since open, sharp money is likely responsible
// 3. Cross-signal: if both agree = high confidence. If only one fires = moderate.
//
// Returns: { signal: 'sharp'|'public'|'neutral', confidence: 'high'|'medium'|'low',
//            sharpAvg, softAvg, divergence, movement, explanation }

function getSharpPublicSignal(gameId, marketKey, outcomeName, bookData, allOutcomes, awayTeam, homeTeam) {
  // Try real betting data first
  const gameKey = Object.keys(bettingCache).find(k => {
    const g = bettingCache[k];
    return (g.away === awayTeam && g.home === homeTeam);
  });
  if (gameKey && bettingCache[gameKey].markets[marketKey]) {
    const mktData = bettingCache[gameKey].markets[marketKey];
    const isHome = outcomeName === homeTeam;
    const isAway = outcomeName === awayTeam;
    const isOver = outcomeName === 'Over';
    const isUnder = outcomeName === 'Under';
    let side = isHome ? mktData.home : isAway ? mktData.away : isOver ? mktData.over : isUnder ? mktData.under : null;
    if (side && side.bets_pct !== null && side.money_pct !== null) {
      const betsPct = parseFloat(side.bets_pct);
      const moneyPct = parseFloat(side.money_pct);
      const moneyBetsDiff = moneyPct - betsPct;
      // Sharp signal: money % significantly higher than bet % = big bettors on this side
      // Public signal: bet % high but money % low = lots of small public bets
      let signal = 'neutral', confidence = 'low';
      if (moneyBetsDiff >= 15) { signal = 'sharp'; confidence = 'high'; }
      else if (moneyBetsDiff >= 8) { signal = 'sharp'; confidence = 'medium'; }
      else if (moneyBetsDiff >= 3) { signal = 'sharp'; confidence = 'low'; }
      else if (moneyBetsDiff <= -15) { signal = 'public'; confidence = 'high'; }
      else if (moneyBetsDiff <= -8) { signal = 'public'; confidence = 'medium'; }
      else if (betsPct >= 65) { signal = 'public'; confidence = 'low'; }
      return {
        signal, confidence,
        betsPct, moneyPct, moneyBetsDiff,
        realData: true,
        sharpAvg: null, softAvg: null, divergence: 0, movement: 0,
        divergenceSignal: 'neutral', movementSignal: 'neutral'
      };
    }
  }
  const sharpPrices = SHARP_BOOKS.map(b=>bookData[b]?.price).filter(Boolean);
  const softPrices = SOFT_BOOKS.map(b=>bookData[b]?.price).filter(Boolean);

  if (sharpPrices.length === 0) return null;

  const sharpAvg = sharpPrices.reduce((a,b)=>a+b,0)/sharpPrices.length;
  const softAvg = softPrices.length ? softPrices.reduce((a,b)=>a+b,0)/softPrices.length : null;

  // Divergence: how much better are sharp books vs soft books (in implied prob points)
  // Positive divergence on sharp side = sharp books giving BETTER odds = they took sharp action
  // and adjusted, but soft books haven't. This means sharp money is on the OTHER side.
  // Wait — if sharp books have WORSE odds (lower price) = they got sharp action and shortened the price
  // = sharp money IS on this side (books reacting to sharp bets by lowering the price)
  let divergence = 0;
  let divergenceSignal = 'neutral';

  if (softAvg !== null) {
    const sharpImplied = decimalToImplied(americanToDecimal(sharpAvg));
    const softImplied = decimalToImplied(americanToDecimal(softAvg));
    divergence = sharpImplied - softImplied;

    // Sharp books have HIGHER implied prob (lower odds/price) than soft books:
    // Sharp money bet this side → sharp books shortened their price → sharp backed
    if (divergence > 3) divergenceSignal = 'sharp';
    // Sharp books have LOWER implied prob (better odds) than soft books:
    // Sharp money bet the OTHER side → public is on this side → public backed
    else if (divergence < -3) divergenceSignal = 'public';
  }

  // Line movement: compare to opening line stored on first fetch
  const lineKey = `${gameId}_${marketKey}_${outcomeName}`;
  let movementSignal = 'neutral';
  let movement = 0;

  if (!openingLines[lineKey]) {
    // Store opening line
    openingLines[lineKey] = { sharpAvg, timestamp: Date.now() };
  } else {
    const openSharpAvg = openingLines[lineKey].sharpAvg;
    const openImplied = decimalToImplied(americanToDecimal(openSharpAvg));
    const currentImplied = decimalToImplied(americanToDecimal(sharpAvg));
    movement = currentImplied - openImplied; // positive = line moved toward this side (shorter odds)

    // Line moved significantly toward this side = sharp money bet here
    if (movement > 2) movementSignal = 'sharp';
    // Line moved away from this side = sharp money bet the other side
    else if (movement < -2) movementSignal = 'public';
  }

  // Combine signals
  let signal = 'neutral';
  let confidence = 'low';

  if (divergenceSignal === 'sharp' && movementSignal === 'sharp') {
    signal = 'sharp'; confidence = 'high';
  } else if (divergenceSignal === 'public' && movementSignal === 'public') {
    signal = 'public'; confidence = 'high';
  } else if (divergenceSignal === 'sharp' || movementSignal === 'sharp') {
    signal = 'sharp'; confidence = 'medium';
  } else if (divergenceSignal === 'public' || movementSignal === 'public') {
    signal = 'public'; confidence = 'medium';
  } else {
    // Weak signal — use best available data to make a lean
    // If sharp books have better odds than implied market avg = public side (books haven't moved)
    // If sharp books have worse odds = sharp side (books already moved on sharp action)
    const allPrices = Object.values(bookData).map(d=>d.price);
    if (allPrices.length >= 2) {
      const marketAvgImplied = allPrices.reduce((a,p)=>a+decimalToImplied(americanToDecimal(p)),0)/allPrices.length;
      const sharpImplied = decimalToImplied(americanToDecimal(sharpAvg));
      if (sharpImplied > marketAvgImplied + 1) { signal = 'sharp'; confidence = 'low'; }
      else if (sharpImplied < marketAvgImplied - 1) { signal = 'public'; confidence = 'low'; }
    }
  }

  if (sharpPrices.length === 0) { signal = 'neutral'; confidence = 'low'; }

  return { signal, confidence, sharpAvg, softAvg, divergence, movement, divergenceSignal, movementSignal };
}

function sharpPublicBadgeHTML(spData) {
  if (!spData) return '';
  const conf = spData.confidence;
  const opacity = conf === 'high' ? '1' : conf === 'medium' ? '0.85' : '0.6';
  if (spData.signal === 'sharp') return `<div class="sp-badge sharp" style="opacity:${opacity}">⚡ Sharp${conf==='high'?' ★':conf==='low'?' ?':''}</div>`;
  if (spData.signal === 'public') return `<div class="sp-badge public" style="opacity:${opacity}">👥 Public${conf==='high'?' ★':conf==='low'?' ?':''}</div>`;
  return `<div class="sp-badge neutral">➖ Neutral</div>`;
}

function spTooltipHTML(spData) {
  const divStr = spData.divergence !== 0 ? `${spData.divergence>0?'+':''}${spData.divergence.toFixed(1)}pp` : 'N/A';
  const movStr = spData.movement !== 0 ? `${spData.movement>0?'+':''}${spData.movement.toFixed(1)}pp` : 'No movement yet';

  const divExp = spData.divergenceSignal === 'sharp'
    ? 'Sharp books have shorter odds than soft books — they absorbed sharp bets and adjusted their price. Soft books haven\'t caught up.'
    : spData.divergenceSignal === 'public'
    ? 'Soft books have shorter odds than sharp books — public money pushed soft book prices down. Sharp books didn\'t move, suggesting they see value on the other side.'
    : 'Sharp and soft books are roughly aligned — no divergence signal.';

  const movExp = spData.movementSignal === 'sharp'
    ? 'The sharp book line has shortened since this page loaded — money came in on this side and moved the market.'
    : spData.movementSignal === 'public'
    ? 'The line has drifted away from this side since load — the market moved against it, suggesting sharp money is elsewhere.'
    : 'No significant line movement detected since page loaded.';

  return `<div class="tooltip-title">${spData.signal === 'sharp' ? '⚡ Sharp Money Signal' : '👥 Public Money Signal'} — ${spData.confidence.toUpperCase()} confidence</div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-row"><span class="tooltip-label">Sharp book avg</span><span class="tooltip-val">${fmt(Math.round(spData.sharpAvg))}</span></div>
    ${spData.softAvg ? `<div class="tooltip-row"><span class="tooltip-label">Soft book avg</span><span class="tooltip-val">${fmt(Math.round(spData.softAvg))}</span></div>` : ''}
    <div class="tooltip-row"><span class="tooltip-label">Book divergence</span><span class="tooltip-val" style="color:${spData.divergenceSignal==='sharp'?'#16a34a':spData.divergenceSignal==='public'?'#dc2626':'#9aa3b2'}">${divStr}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Line movement</span><span class="tooltip-val" style="color:${spData.movementSignal==='sharp'?'#16a34a':spData.movementSignal==='public'?'#dc2626':'#9aa3b2'}">${movStr}</span></div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-note"><strong>Divergence:</strong> ${divExp}</div>
    <div class="tooltip-note" style="margin-top:5px"><strong>Movement:</strong> ${movExp}</div>
    <div class="tooltip-note" style="margin-top:5px;color:#f59e0b">Note: Based on book divergence and line movement. True public % data requires a paid service.</div>`;
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
  const bestPrices={},bestBooks={},bestPoints={};
  outcomeNames.forEach(name=>{
    const bookData=outcomeBookMap[name]||{};
    let best=-Infinity,bestBook=null,bestPoint=null;
    Object.entries(bookData).forEach(([book,d])=>{
      if(d.price>best){best=d.price;bestBook=book;bestPoint=d.point;}
    });
    bestPrices[name]=best;bestBooks[name]=bestBook;bestPoints[name]=bestPoint;
  });
  for (const name of outcomeNames) {
    if(bestPrices[name]<=-Infinity) continue;
    const imp=decimalToImplied(americanToDecimal(bestPrices[name]));
    if(imp<4||imp>96) return {isArb:false,profit:null,bestPrices,bestBooks};
  }
  const points=outcomeNames.map(n=>bestPoints[n]).filter(p=>p!==undefined&&p!==null);
  if(points.length>=2){
    const abs=points.map(p=>Math.abs(p));
    if(!abs.every(p=>p===abs[0])) return {isArb:false,profit:null,bestPrices,bestBooks};
  }
  const impliedSum=outcomeNames.reduce((sum,name)=>{
    return sum+(bestPrices[name]>-Infinity?decimalToImplied(americanToDecimal(bestPrices[name])):100);
  },0);
  const isArb=impliedSum<100;
  const profit=isArb?(100-impliedSum).toFixed(2):null;
  return {isArb,profit,bestPrices,bestBooks,impliedSum};
}

function calcArbStakes(outcomeNames,bestPrices,totalStake=100){
  const decimals={};
  outcomeNames.forEach(n=>decimals[n]=americanToDecimal(bestPrices[n]));
  const impliedSum=outcomeNames.reduce((s,n)=>s+decimalToImplied(decimals[n]),0);
  const stakes={};
  outcomeNames.forEach(n=>{stakes[n]=((decimalToImplied(decimals[n])/impliedSum)*totalStake).toFixed(2);});
  const worstReturn=Math.min(...outcomeNames.map(n=>parseFloat(stakes[n])*decimals[n]));
  return {stakes,guaranteedProfit:(worstReturn-totalStake).toFixed(2)};
}

// ── ODDS MAP ──────────────────────────────────────────────────────────────────
function buildOddsMap(game) {
  const raw={h2h:{},spreads:{},totals:{}};
  game.bookmakers.forEach(bm=>{
    bm.markets.forEach(mk=>{
      if(!raw[mk.key]) return;
      mk.outcomes.forEach(o=>{
        if(!raw[mk.key][o.name]) raw[mk.key][o.name]={};
        raw[mk.key][o.name][bm.key]={price:o.price,point:o.point};
      });
    });
  });
  ['spreads','totals'].forEach(mkt=>{
    Object.keys(raw[mkt]).forEach(outcomeName=>{
      const bookData=raw[mkt][outcomeName];
      const ptCounts={};
      Object.values(bookData).forEach(d=>{
        if(d.point===undefined||d.point===null) return;
        ptCounts[d.point]=(ptCounts[d.point]||0)+1;
      });
      if(!Object.keys(ptCounts).length) return;
      const consensusPt=Object.entries(ptCounts).sort((a,b)=>b[1]-a[1])[0][0];
      Object.keys(bookData).forEach(book=>{
        const pt=bookData[book].point;
        if(pt===undefined||pt===null||String(pt)!==String(consensusPt)) delete bookData[book];
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
  const pad=14, tw=tooltip.offsetWidth, th=tooltip.offsetHeight;
  let x=e.clientX+pad, y=e.clientY+pad;
  if(x+tw>window.innerWidth-pad) x=e.clientX-tw-pad;
  if(y+th>window.innerHeight-pad) y=e.clientY-th-pad;
  tooltip.style.left=x+'px'; tooltip.style.top=y+'px';
}
function hideTooltip() { tooltip.style.display='none'; }
document.addEventListener('mousemove', e=>{ if(tooltip.style.display!=='none') positionTooltip(e); });

function trueProbTooltip(trueProb, outcomeName, consensus) {
  const raw=consensus._raw;
  const booksUsed=raw.sharpBooks.filter(b=>raw.sharpPrices[b]);
  const rawStr=Object.entries(raw.sharpPrices).map(([n,p])=>`${n.split(' ').pop()}: ${decimalToImplied(americanToDecimal(p)).toFixed(1)}%`).join(', ');
  return `<div class="tooltip-title">True Probability — ${trueProb.toFixed(1)}%</div>
    <div class="tooltip-row"><span class="tooltip-label">Sharp books used</span><span class="tooltip-val">${booksUsed.map(cleanBook).join(', ')}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Raw implied (with vig)</span><span class="tooltip-val">${rawStr}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">After vig removal</span><span class="tooltip-val">${trueProb.toFixed(1)}%</span></div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">Sharp books set the most accurate lines. We remove their profit margin (vig) to get the true estimated probability of this outcome.</div>`;
}

function bestCellTooltip(bookKey, price, trueProb, edgeVs) {
  const implied=decimalToImplied(americanToDecimal(price));
  return `<div class="tooltip-title">Best Available Line — ${cleanBook(bookKey)}</div>
    <div class="tooltip-row"><span class="tooltip-label">Their odds</span><span class="tooltip-val">${fmt(price)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Their implied prob</span><span class="tooltip-val">${implied.toFixed(1)}%</span></div>
    ${trueProb?`<div class="tooltip-row"><span class="tooltip-label">Sharp true prob</span><span class="tooltip-val">${trueProb.toFixed(1)}%</span></div>`:''}
    ${edgeVs!==null?`<div class="tooltip-row"><span class="tooltip-label">Edge vs consensus</span><span class="tooltip-val" style="color:${edgeVs>0?'#16a34a':'#dc2626'}">${edgeVs>0?'+':''}${edgeVs.toFixed(1)}%</span></div>`:''}
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">${edgeVs&&edgeVs>0?`${cleanBook(bookKey)} is offering better odds than the sharp consensus implies. Positive EV bet.`:'Best available line. Slightly below sharp consensus — shop around.'}</div>`;
}

function arbCellTooltip(bookKey, price, outcomeName, arbResult, arbStakes) {
  const stakeStr=Object.entries(arbStakes.stakes).map(([n,s])=>`${n.split(' ').pop()}: $${s}`).join(' · ');
  return `<div class="tooltip-title">⬡ Arbitrage Opportunity</div>
    <div class="tooltip-row"><span class="tooltip-label">Best for ${outcomeName.split(' ').pop()}</span><span class="tooltip-val">${cleanBook(bookKey)} ${fmt(price)}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Combined implied</span><span class="tooltip-val">${arbResult.impliedSum.toFixed(1)}%</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Guaranteed profit</span><span class="tooltip-val" style="color:#7c3aed">+$${arbStakes.guaranteedProfit} per $100</span></div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-row"><span class="tooltip-label">How to bet</span><span class="tooltip-val">${stakeStr}</span></div>
    <div class="tooltip-note">Place these bets simultaneously. You profit no matter who wins.</div>`;
}

function scoreBadgeTooltip(score, edgePct, bookCount, disagreement, injPenalty) {
  const label=score>=8?'Strong edge worth acting on':score>=6?'Good edge':score>=4?'Moderate edge':'Weak edge — lines are tight';
  return `<div class="tooltip-title">EV Score ${score}/10 — ${label}</div>
    <div class="tooltip-divider"></div>
    <div class="tooltip-row"><span class="tooltip-label">Edge vs sharp consensus</span><span class="tooltip-val" style="color:${edgePct>0?'#16a34a':'#dc2626'}">${edgePct>0?'+':''}${edgePct.toFixed(1)}%</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Books available</span><span class="tooltip-val">${bookCount} ${bookCount>=4?'(+1 bonus)':''}</span></div>
    <div class="tooltip-row"><span class="tooltip-label">Book disagreement</span><span class="tooltip-val">${disagreement.toFixed(1)}% ${disagreement>=3?'(+1 bonus)':''}</span></div>
    ${injPenalty>0?`<div class="tooltip-row"><span class="tooltip-label">Injury penalty</span><span class="tooltip-val" style="color:#dc2626">-${injPenalty}</span></div>`:''}
    <div class="tooltip-divider"></div>
    <div class="tooltip-note">Score uses: edge size vs sharp consensus, number of books available, how much books disagree with each other, and injury risk. 8-10 = strong edge.</div>`;
}

// ── DATA FETCHING ─────────────────────────────────────────────────────────────
async function fetchScores(sport) {
  try {
    const res=await fetch(`${API_BASE}/api/scores?sport=${sport}`);
    if(!res.ok) return;
    const data=await res.json();
    data.forEach(s=>{scoresCache[s.id]=s;});
    updateScoresOnPage();
  } catch(e){}
}

function updateScoresOnPage() {
  Object.entries(scoresCache).forEach(([id,s])=>{
    const el=document.getElementById('scores-'+id);
    if(!el) return;
    if(s.scores){
      s.scores.forEach(team=>{
        const scoreEl=el.querySelector(`[data-team="${team.name}"]`);
        if(scoreEl) scoreEl.textContent=team.score;
      });
    }
    const periodEl=el.querySelector('.game-period');
    if(periodEl&&!s.completed&&s.scores) periodEl.textContent='LIVE';
  });
}

function toClearSport(sport){
  if(sport.includes('nfl')||sport.includes('ncaaf')) return 'nfl';
  if(sport.includes('nba')||sport.includes('ncaab')) return 'nba';
  if(sport.includes('mlb')) return 'mlb';
  if(sport.includes('nhl')) return 'nhl';
  if(sport.includes('soccer')) return 'soccer';
  return null;
}

async function fetchInjuries(sport){
  const cs=toClearSport(sport);
  if(!cs) return;
  try{
    const res=await fetch(`${API_BASE}/api/injuries?sport=${cs}`);
    if(!res.ok) return;
    const data=await res.json();
    const injuries=data.data||data.injuries||data||[];
    injuries.forEach(inj=>{
      const team=inj.team?.name||inj.team;
      if(!team) return;
      if(!injuryCache[team]) injuryCache[team]=0;
      const status=(inj.status||'').toLowerCase();
      if(status.includes('out')) injuryCache[team]=Math.min(3,injuryCache[team]+1.5);
      else if(status.includes('questionable')||status.includes('doubtful'))
        injuryCache[team]=Math.min(3,injuryCache[team]+0.5);
    });
  }catch(e){}
}

async function fetchBetting(sport) {
  try {
    const res = await fetch(`${API_BASE}/api/betting?sport=${sport}`);
    if (!res.ok) return;
    const data = await res.json();
    bettingCache = data;
  } catch(e) {}
}

// ── REFRESH LOGIC ─────────────────────────────────────────────────────────────
function updateRefreshStatus(fetching){
  const el=document.getElementById('refresh-status');
  if(!el) return;
  if(fetching){el.innerHTML='<div class="refresh-dot"></div> Fetching...';return;}
  if(refreshCount>=MAX_REFRESHES){el.innerHTML='<div class="refresh-dot idle"></div> Auto-refresh ended (1hr limit)';return;}
  const secsLeft=nextRefreshAt?Math.max(0,Math.round((nextRefreshAt-Date.now())/1000)):0;
  const mins=Math.floor(secsLeft/60),secs=secsLeft%60;
  el.innerHTML=`<div class="refresh-dot"></div> Next refresh in ${mins}:${secs.toString().padStart(2,'0')}`;
}

function scheduleNextRefresh(){
  if(refreshCount>=MAX_REFRESHES){updateRefreshStatus(false);return;}
  nextRefreshAt=Date.now()+REFRESH_INTERVAL_MS;
  refreshTimer=setTimeout(async()=>{
    refreshCount++;
    await doFetch(currentSport,false);
    scheduleNextRefresh();
  },REFRESH_INTERVAL_MS);
  clearInterval(countdownTimer);
  countdownTimer=setInterval(()=>updateRefreshStatus(false),1000);
}

async function manualFetch(){
  clearTimeout(refreshTimer);clearInterval(countdownTimer);
  refreshCount=0;
  currentSport=document.getElementById('sport-sel').value;
  scoresCache={};injuryCache={};bettingCache={};openingLines={};
  await doFetch(currentSport,true);
  scheduleNextRefresh();
  clearInterval(scoresTimer);
  scoresTimer=setInterval(()=>fetchScores(currentSport),60000);
}

async function doFetch(sport,showLoading){
  const btn=document.getElementById('fetch-btn');
  const apiNote=document.getElementById('api-remaining');
  const container=document.getElementById('games-container');
  const isSoccer=sport.includes('soccer')||sport.includes('world_cup');
  currentSharpBooks=isSoccer?SOCCER_SHARP:SHARP_BOOKS;
  const regions=isSoccer?'us,uk,eu':'us';
  const minBooks=parseInt(document.getElementById('min-books').value);
  btn.disabled=true;btn.textContent='Fetching...';
  updateRefreshStatus(true);
  if(showLoading) container.innerHTML='<p class="status-msg">Loading games...</p>';
  try{
    await Promise.all([fetchScores(sport),fetchInjuries(sport),fetchBetting(sport)]);
    const url=`${API_BASE}/api/odds?sport=${sport}&regions=${regions}`;
    const res=await fetch(url);
    const remaining=res.headers.get('x-requests-remaining');
    const used=res.headers.get('x-requests-used');
    if(remaining!==null) apiNote.innerHTML=`${used} requests used · ${remaining} remaining this month`;
    if(!res.ok) throw new Error('API error '+res.status);
    const data=await res.json();
    const filtered=data.filter(g=>g.bookmakers.length>=minBooks);
    if(!filtered.length){
      container.innerHTML='<p class="status-msg">No games found. Try lowering Min Books.</p>';
    }else{
      renderGames(filtered,sport);
    }
    fetchProps(sport);
  }catch(e){
    container.innerHTML=`<p class="status-msg">Could not load odds: ${e.message}</p>`;
  }finally{
    btn.disabled=false;btn.textContent='Fetch odds';
    updateRefreshStatus(false);
  }
}

// ── BET SIGNAL ────────────────────────────────────────────────────────────────
function betTip(title, note) {
  return encodeURIComponent('<div class="tooltip-title">' + title + '</div><div class="tooltip-note">' + note + '</div>');
}

function getBetSignalHTML(score, edgePct, trueProb, bestPrice) {
  if (!trueProb || !bestPrice) return '<div class="bet-signal none">—</div>';
  const implied = decimalToImplied(americanToDecimal(bestPrice));
  const lineValueNum = parseFloat((trueProb - implied).toFixed(1));
  const lineValueStr = (lineValueNum > 0 ? '+' : '') + lineValueNum.toFixed(1) + '%';
  const lineClass = lineValueNum > 0 ? 'pos' : lineValueNum < 0 ? 'neg' : 'neutral';
  const lineTip = lineValueNum > 0
    ? 'Best price is ' + lineValueStr + ' better than the sharp consensus.'
    : 'Best price is ' + Math.abs(lineValueNum).toFixed(1) + '% below the sharp consensus.';

  // Industry standard thresholds
  // 2-3% = Value Bet, 3-5% = Good Bet, 5-7% = Strong Bet, 7%+ = Sharp Edge
  let signalHTML = '';
  if (lineValueNum >= 7) {
    signalHTML = '<div class="bet-signal sharp-edge" data-tip="' + betTip('Sharp Edge', lineValueStr + ' edge. Professionals act at this level. Rare — move fast before books adjust.') + '" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">Sharp Edge</div>';
  } else if (lineValueNum >= 5) {
    signalHTML = '<div class="bet-signal strong" data-tip="' + betTip('Strong Bet', lineValueStr + ' edge vs sharp consensus. Serious bettors look for 5%+. Worth acting on.') + '" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">Strong Bet</div>';
  } else if (lineValueNum >= 3) {
    signalHTML = '<div class="bet-signal good" data-tip="' + betTip('Good Bet', lineValueStr + ' edge vs sharp consensus. Solid value — most recreational sharp bettors act here.') + '" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">Good Bet</div>';
  } else if (lineValueNum >= 2) {
    signalHTML = '<div class="bet-signal value" data-tip="' + betTip('Value Bet', lineValueStr + ' edge vs sharp consensus. Marginal but positive value.') + '" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">Value Bet</div>';
  }

  const lineHTML = '<div class="line-value ' + lineClass + '" data-tip="' + betTip('Line Value: ' + lineValueStr, lineTip) + '" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">' + lineValueStr + '</div>';
  return lineHTML + signalHTML;
}

// ── RENDER GAMES ──────────────────────────────────────────────────────────────
function renderGames(games,sport){
  const container=document.getElementById('games-container');
  container.innerHTML='';
  const list=document.createElement('div');
  list.className='games-list';

  games.forEach((game,gi)=>{
    const oddsMap=buildOddsMap(game);
    const booksPresent=[...new Set(game.bookmakers.map(b=>b.key))];
    const scoreData=scoresCache[game.id]||null;
    const isLive=scoreData&&!scoreData.completed&&scoreData.scores;
    const awayPenalty=Math.round(injuryCache[game.away_team]||0);
    const homePenalty=Math.round(injuryCache[game.home_team]||0);
    const awayScoreVal=scoreData?.scores?.find(s=>s.name===game.away_team)?.score;
    const homeScoreVal=scoreData?.scores?.find(s=>s.name===game.home_team)?.score;
    const awayLeading=awayScoreVal!==undefined&&parseInt(awayScoreVal)>parseInt(homeScoreVal);
    const homeLeading=homeScoreVal!==undefined&&parseInt(homeScoreVal)>parseInt(awayScoreVal);
    const injBadge=p=>p>=2?`<span class="inj-badge inj-out">INJ</span>`:p>=1?`<span class="inj-badge inj-q">Q</span>`:'';

    const card=document.createElement('div');
    card.className='game-card';

    // Get period/inning info
    const period = scoreData?.last_update && isLive ? (scoreData.period || scoreData.inning || '') : '';
    const periodLabel = period ? String(period) : '';

    card.innerHTML=`
      <div class="game-header" id="scores-${game.id}">
        <div class="teams-col">
          <div class="team-row">
            ${teamLogoHTML(game.away_team,sport)}
            <span class="team-name${awayLeading?' leading':''}">${game.away_team}</span>
            ${injBadge(awayPenalty)}
            <span class="team-score${awayLeading?' leading':''}" data-team="${game.away_team}">${awayScoreVal!==undefined?awayScoreVal:''}</span>
          </div>
          <div class="team-row" style="margin-top:6px">
            ${teamLogoHTML(game.home_team,sport)}
            <span class="team-name${homeLeading?' leading':''}">${game.home_team}</span>
            ${injBadge(homePenalty)}
            <span class="team-score${homeLeading?' leading':''}" data-team="${game.home_team}">${homeScoreVal!==undefined?homeScoreVal:''}</span>
          </div>
        </div>
        <div class="game-right">
          ${isLive?'<div class="live-badge">● LIVE</div>':''}
          ${isLive&&periodLabel?`<div class="game-period-display">${periodLabel}</div>`:''}
          <div class="game-time">${formatTime(game.commence_time)}</div>
          <div class="game-sport">${game.sport_title}</div>
          <div class="game-books">${game.bookmakers.length} books</div>
        </div>
      </div>
    `;

    const table=document.createElement('table');
    table.className='odds-table';
    table.innerHTML=`<thead><tr>
      <th class="market-th">Market</th>
      ${booksPresent.map(b=>`<th class="book-th"><div class="book-header">${bookBadgeHTML(b)}<span class="book-label">${cleanBook(b)}</span></div></th>`).join('')}
      <th class="score-th">Score</th>
    </tr></thead>`;

    const tbody=document.createElement('tbody');
    const marketGroups=[{key:'h2h',label:'Moneyline'},{key:'spreads',label:'Spread'},{key:'totals',label:'Total'}];

    marketGroups.forEach((mkt,mktIdx)=>{
      const outcomes=Object.keys(oddsMap[mkt.key]);
      if(!outcomes.length) return;
      const consensus=getSharpConsensus(oddsMap[mkt.key],outcomes,currentSharpBooks);
      const arbResult=checkArbitrage(outcomes,oddsMap[mkt.key]);
      const arbStakes=arbResult.isArb?calcArbStakes(outcomes,arbResult.bestPrices):null;

      if(mktIdx>0){
        const divRow=document.createElement('tr');
        divRow.className='section-divider';
        divRow.innerHTML=`<td colspan="${booksPresent.length+2}"><span class="section-divider-label">${mkt.label}</span></td>`;
        tbody.appendChild(divRow);
      }

      outcomes.forEach((outcomeName,oi)=>{
        const bookData=oddsMap[mkt.key][outcomeName];
        const prices=Object.values(bookData).map(d=>d.price);
        const bestPrice=prices.length?Math.max(...prices):null;
        const trueProb=consensus?consensus[outcomeName]:null;
        const sideLabel=outcomeName===game.home_team?'Home':outcomeName===game.away_team?'Away':outcomeName;

        // EV scoring
        let bestEdge=0,bookDisagreement=0;
        if(trueProb&&bestPrice){
          const bestImplied=decimalToImplied(americanToDecimal(bestPrice));
          bestEdge=trueProb-bestImplied;
          const worstPrice=Math.min(...prices);
          bookDisagreement=Math.abs(decimalToImplied(americanToDecimal(bestPrice))-decimalToImplied(americanToDecimal(worstPrice)));
        }
        const injPenalty=outcomeName===game.away_team?Math.round(homePenalty):Math.round(awayPenalty);
        const rowScore=arbResult.isArb?10:calcRowScore(bestEdge,booksPresent.length,bookDisagreement,injPenalty);

        // Sharp/public signal — use real betting data if available
        const spData=getSharpPublicSignal(game.id,mkt.key,outcomeName,bookData,outcomes,game.away_team,game.home_team);

        const row=document.createElement('tr');
        if(arbResult.isArb) row.className='arb-row';

        const cellsHTML=booksPresent.map(bookKey=>{
          const d=bookData[bookKey];
          if(!d) return `<td class="odds-td empty">—</td>`;
          const isBest=d.price===bestPrice;
          const isArb=arbResult.isArb&&d.price===arbResult.bestPrices[outcomeName];
          const implied=decimalToImplied(americanToDecimal(d.price));
          const edgeVs=trueProb?trueProb-implied:null;
          let cellClass='odds-td';
          if(isArb) cellClass+=' arb-cell';
          else if(isBest) cellClass+=' best-cell';
          let tipHTML='';
          if(isArb&&arbStakes) tipHTML=arbCellTooltip(bookKey,d.price,outcomeName,arbResult,arbStakes);
          else if(isBest) tipHTML=bestCellTooltip(bookKey,d.price,trueProb,edgeVs);
          return `<td class="${cellClass}"
            ${tipHTML?`data-tip="${encodeURIComponent(tipHTML)}" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()"`:''}>
            ${d.point!==undefined&&d.point!==null?`<div class="odds-point">${d.point>0?'+':''}${d.point}</div>`:''}
            <div class="odds-val">${fmt(d.price)}</div>
            <div class="odds-implied">${implied.toFixed(1)}%</div>
          </td>`;
        }).join('');

        let trueProbHTML='';
        if(trueProb&&consensus){
          const tpTip=trueProbTooltip(trueProb,outcomeName,consensus);
          trueProbHTML=`<div class="true-prob" data-tip="${encodeURIComponent(tpTip)}" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">True: ${trueProb.toFixed(1)}%</div>`;
        }

        const spTip=spData?spTooltipHTML(spData):'';
        const spBadgeRaw=sharpPublicBadgeHTML(spData);
        const spBadgeHTML=spBadgeRaw&&spData?spBadgeRaw.replace('<div class="sp-badge',`<div class="sp-badge`).replace('>',` ${spTip?`data-tip="${encodeURIComponent(spTip)}" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()"`:''}>`):'';

        let scoreTip='';
        if(rowScore&&!arbResult.isArb) scoreTip=scoreBadgeTooltip(rowScore,bestEdge,booksPresent.length,bookDisagreement,injPenalty);
        else if(arbResult.isArb) scoreTip=`<div class="tooltip-title">Score 10 — Arbitrage</div><div class="tooltip-note">Guaranteed profit regardless of outcome. Bet both sides simultaneously across books.</div>`;

        let arbLabelHTML='';
        if(arbResult.isArb&&oi===0&&arbStakes){
          const arbTip=`<div class='tooltip-title'>⬡ Arbitrage — Guaranteed Profit</div><div class='tooltip-row'><span class='tooltip-label'>Profit per $100</span><span class='tooltip-val' style='color:#7c3aed'>+$${arbStakes.guaranteedProfit}</span></div><div class='tooltip-note'>Bet: ${Object.entries(arbStakes.stakes).map(([n,s])=>cleanBook(arbResult.bestBooks[n]||'')+' $'+s+' on '+n.split(' ').pop()).join(' · ')}</div>`;
          arbLabelHTML=`<div class="arb-label" data-tip="${encodeURIComponent(arbTip)}" onmouseenter="showTooltip(event,decodeURIComponent(this.dataset.tip))" onmouseleave="hideTooltip()">⬡ ARB +$${arbStakes.guaranteedProfit} / $100</div>`;
        }

        row.innerHTML=`
          <td class="market-td${arbResult.isArb?' arb-market':''}">
            <div class="market-name">${oi===0?`<strong>${mkt.label}</strong>`:''}</div>
            <div class="market-side">${sideLabel}</div>
            ${trueProbHTML}

            ${arbLabelHTML}
          </td>
          ${cellsHTML}
          <td class="score-td">
            ${getBetSignalHTML(rowScore, bestEdge, trueProb, bestPrice)}
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
function switchTab(tab,btn){
  document.querySelectorAll('.tab').forEach(t=>t.classList.remove('active'));
  document.getElementById('tab-lines').style.display=tab==='lines'?'block':'none';
  document.getElementById('tab-props').style.display=tab==='props'?'block':'none';
  if(btn) btn.classList.add('active');
}

// ── PROPS ─────────────────────────────────────────────────────────────────────
const PROPLINE_SPORT_MAP={
  'baseball_mlb':'baseball_mlb','basketball_nba':'basketball_nba',
  'basketball_ncaab':'basketball_ncaab','icehockey_nhl':'icehockey_nhl',
  'americanfootball_nfl':'americanfootball_nfl','americanfootball_ncaaf':'americanfootball_ncaaf',
  'soccer_epl':'soccer_england_premier_league','soccer_uefa_champs_league':'soccer_uefa_champs_league',
  'soccer_fifa_world_cup':'soccer_fifa_world_cup'
};
const PROP_MARKETS={
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
function cleanPropName(key){return key.replace(/^(player_|pitcher_|batter_)/,'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}

async function fetchProps(sport){
  const container=document.getElementById('props-container');
  const propSport=PROPLINE_SPORT_MAP[sport];
  if(!propSport){container.innerHTML='<p class="status-msg">Player props not available for this sport.</p>';return;}
  const markets=PROP_MARKETS[sport]||['player_points'];
  try{
    // Use AllOrigins proxy to bypass CORS
    const evRes=await fetch(`${API_BASE}/api/props?sport=${propSport}`);
    if(!evRes.ok) throw new Error('Events '+evRes.status);
    const evData=await evRes.json();
    const events=Array.isArray(evData)?evData:(evData.data||evData.events||[]);
    if(!events.length){container.innerHTML='<p class="status-msg">No upcoming games with player props.</p>';return;}
    const propsData=[];
    for(const event of events.slice(0,6)){
      try{
        const eventId=event.id||event.event_id;
        const oddsRes=await fetch(`${API_BASE}/api/props?sport=${propSport}&eventId=${eventId}&markets=${markets.join(',')}`);
        if(!oddsRes.ok) continue;
        const d=await oddsRes.json();
        const norm=Array.isArray(d)?d[0]:(d.bookmakers?d:(d.data||d));
        if(norm&&(norm.bookmakers||norm.id)) propsData.push(norm);
      }catch(e){}
    }
    if(!propsData.length){container.innerHTML='<p class="status-msg">No player props posted yet for today.</p>';return;}
    renderProps(propsData);
  }catch(e){
    container.innerHTML=`<p class="status-msg">Props error: ${e.message}</p>`;
  }
}

function renderProps(games){
  const container=document.getElementById('props-container');
  container.innerHTML='';
  const list=document.createElement('div');
  list.className='games-list';
  games.forEach(game=>{
    const propMap={};
    (game.bookmakers||[]).forEach(bm=>{
      (bm.markets||[]).forEach(mk=>{
        if(!propMap[mk.key]) propMap[mk.key]={};
        (mk.outcomes||[]).forEach(o=>{
          const key=(o.description||o.name)+'||'+(o.name||'');
          if(!propMap[mk.key][key]) propMap[mk.key][key]={label:o.description||o.name,side:o.name,books:{}};
          propMap[mk.key][key].books[bm.key]={price:o.price,point:o.point};
        });
      });
    });
    const propKeys=Object.keys(propMap);
    if(!propKeys.length) return;
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
      if(!allBooks.length) return;
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
          if(!entry) return;
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
              if(!d) return `<td class="odds-td empty">—</td>`;
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
window.addEventListener('load',()=>{
  currentSport=document.getElementById('sport-sel').value;
  manualFetch();
});
