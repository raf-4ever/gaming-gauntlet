/* ==================================================================
     FIREBASE — everyone reads live state; only the logged-in host
     (admin) can write. Enforce the write side for real in your
     Firebase Realtime Database rules (see the note in chat).
  ================================================================== */
  import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-app.js";
  import { getAuth, onAuthStateChanged, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-auth.js";
  import { getDatabase, ref, onValue, set, update } from "https://www.gstatic.com/firebasejs/10.12.4/firebase-database.js";

  var firebaseConfig = {
    apiKey: "AIzaSyDotYtjcu62V_6rzgv4DP01I1zjNuA8aTE",
    authDomain: "gaming-gauntlet.firebaseapp.com",
    projectId: "gaming-gauntlet",
    storageBucket: "gaming-gauntlet.firebasestorage.app",
    messagingSenderId: "36061335474",
    appId: "1:36061335474:web:fd1109fdc6f2c34604deab",
    measurementId: "G-7HKTD50QP8"
  };

  var app = initializeApp(firebaseConfig);
  var auth = getAuth(app);
  var db = getDatabase(app, "https://gaming-gauntlet-default-rtdb.europe-west1.firebasedatabase.app");
  var stateRef = ref(db, "state");

  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, function(c){
      return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];
    });
  }

  /* ---------- Shared state (single source of truth, synced via Firebase) ---------- */
  var DEFAULT_GAME_POOL = [
    {icon:'🏎️', name:'Mario Kart 8', genre:'Racing'},
    {icon:'🔫', name:'Valorant', genre:'FPS'},
    {icon:'🧟', name:'Resident Evil Speedrun', genre:'Horror'},
    {icon:'🐉', name:'Pokémon Nuzlocke', genre:'RPG'},
    {icon:'⚔️', name:'Co-op Adventure Run', genre:'Adventure'},
    {icon:'🥊', name:'Smash Bros', genre:'Fighting'},
    {icon:'🏀', name:'Rocket League', genre:'Sports'},
    {icon:'🧱', name:'Build Battle', genre:'Creative'},
    {icon:'🕵️', name:'Among Us', genre:'Social'},
    {icon:'🎳', name:'Fall Guys', genre:'Party'},
    {icon:'🃏', name:'Jackbox Party Pack', genre:'Party'},
    {icon:'🎲', name:'Mystery Wildcard', genre:'Surprise'}
  ];
  var TARGET_GAME_COUNT = 6;

  var gamePool = DEFAULT_GAME_POOL.slice();
  var chosenGames = [];
  var teamMode = 'duo';
  var duoTeams = [];
  var groupPlayers = [];
  var groupTeams = [];
  var scoreboardTeams = [];
  var wheelRotation = 0;
  var wheelSpinning = false;
  var isAdmin = false;
  var isAuthed = false;
  var hasLoadedRemote = false;
  var HOST_EMAIL = 'boudiafrafail2020@gmail.com';
  var F1_POINTS = [25,18,15,12,10,8,6,4,2,1];

  // gameResults[i] describes the chosenGames[i] slot:
  // { marks: { teamName: {finish:bool, challenge:bool} }, finalized:bool, placements:[{team,score,place,points}] }
  var gameResults = [];
  var clips = [];

  var wheelEl = document.getElementById('gameWheel');

  /* ---------- Wheel ---------- */
  function availableGames(){
    return gamePool.filter(function(g){
      return !chosenGames.some(function(c){ return c.name === g.name; });
    });
  }
  function buildWheel(){
    if(!wheelEl) return;
    var avail = availableGames();
    var n = avail.length;
    if(n === 0){ wheelEl.style.background = 'var(--card)'; wheelEl.innerHTML=''; return; }
    var seg = 360/n;
    var palette = ['#00d4ff','#aa00ff','#ff3399','#ffd700','#ff7700','#3ddc73','#4d6bff','#ff5c8a','#00e0b0','#c48aff','#ffab40','#66d9ff'];
    var parts = [], labels = '';
    avail.forEach(function(g,i){
      var start = i*seg, end=(i+1)*seg, color = palette[i%palette.length];
      parts.push(color+' '+start+'deg '+end+'deg');
      var center = start + seg/2;
      labels += '<div class="wheel-label" style="--angle:'+center+'deg"><span>'+g.icon+' '+g.name+'</span></div>';
    });
    wheelEl.style.background = 'conic-gradient(' + parts.join(',') + ')';
    wheelEl.innerHTML = labels;
  }
  function gameIconHtml(g, cls){
    if(g.image){
      return '<img class="'+cls+'" src="'+escapeHtml(g.image)+'" alt="" loading="lazy">';
    }
    return '<span class="'+cls+'">'+g.icon+'</span>';
  }
  function renderPoolList(){
    var wrap = document.getElementById('poolList');
    if(!wrap) return;
    if(gamePool.length === 0){ wrap.innerHTML = '<p class="team-empty-note">No games yet — add your first one above.</p>'; return; }
    wrap.innerHTML = gamePool.map(function(g,i){
      var used = chosenGames.some(function(c){ return c.name === g.name; });
      var thumb = g.image ? '<img class="pool-chip-thumb" src="'+escapeHtml(g.image)+'" alt="" loading="lazy">' : '';
      return '<span class="player-chip pool-chip'+(used?' is-used':'')+'">'+thumb+g.icon+' '+escapeHtml(g.name)+
        (g.genre ? '<small>('+escapeHtml(g.genre)+')</small>' : '') +
        (used ? '<em>spun</em>' : '') +
        '<button data-idx="'+i+'" aria-label="Remove game">✕</button></span>';
    }).join('');
    wrap.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        gamePool.splice(parseInt(btn.getAttribute('data-idx'),10),1);
        renderPoolList(); buildWheel(); renderChosenGames();
        persist();
      });
    });
  }
  function renderChosenGames(){
    var wrap = document.getElementById('chosenGames');
    if(!wrap) return;
    var html = '';
    for(var i=0;i<TARGET_GAME_COUNT;i++){
      if(chosenGames[i]){
        var g = chosenGames[i];
        html += '<div class="game-card cut-corner">'+gameIconHtml(g,'game-icon')+'<p class="game-genre">'+g.genre+'</p><h3 class="game-title">'+g.name+'</h3><p class="game-note">Locked in — game '+(i+1)+' of 6.</p></div>';
      } else {
        html += '<div class="game-card cut-corner chosen-placeholder"><span class="game-icon">❔</span><p class="game-genre">Slot '+(i+1)+'</p><h3 class="game-title">Spin To Reveal</h3><p class="game-note">Waiting on the wheel…</p></div>';
      }
    }
    wrap.innerHTML = html;
    var spinBtn = document.getElementById('spinBtn');
    if(spinBtn){
      if(chosenGames.length >= TARGET_GAME_COUNT || availableGames().length===0){
        spinBtn.disabled = true;
        spinBtn.textContent = chosenGames.length >= TARGET_GAME_COUNT ? 'All Six Locked In 🔒' : 'Add More Games To Spin';
      } else {
        spinBtn.disabled = !isAdmin;
        spinBtn.textContent = 'Spin The Wheel';
      }
    }
  }
  function spinWheel(){
    if(!isAdmin || wheelSpinning) return;
    var avail = availableGames();
    if(chosenGames.length >= TARGET_GAME_COUNT || avail.length===0) return;
    wheelSpinning = true;
    var n = avail.length;
    var seg = 360/n;
    var winnerIndex = Math.floor(Math.random()*n);
    var center = winnerIndex*seg + seg/2;
    var extra = 5*360 + ((360 - center) % 360);
    wheelRotation += extra;
    wheelEl.style.transition = 'transform 3.6s cubic-bezier(.12,.72,.14,1)';
    wheelEl.style.transform = 'rotate(' + wheelRotation + 'deg)';
    setTimeout(function(){
      var winner = avail[winnerIndex];
      chosenGames.push(winner);
      wheelEl.style.transition = 'none';
      wheelRotation = 0;
      wheelEl.style.transform = 'rotate(0deg)';
      buildWheel();
      renderChosenGames();
      renderPoolList();
      wheelSpinning = false;
      persist();
    }, 3700);
  }
  function resetWheel(){
    if(!isAdmin) return;
    chosenGames = [];
    wheelRotation = 0;
    if(wheelEl){ wheelEl.style.transition='none'; wheelEl.style.transform='rotate(0deg)'; }
    buildWheel(); renderChosenGames(); renderPoolList();
    persist();
  }
  function restoreDefaultGames(){
    if(!isAdmin) return;
    if(!confirm('Replace your custom game list with the default 12 games? This also clears any games already spun.')) return;
    gamePool = DEFAULT_GAME_POOL.slice();
    chosenGames = [];
    wheelRotation = 0;
    if(wheelEl){ wheelEl.style.transition='none'; wheelEl.style.transform='rotate(0deg)'; }
    buildWheel(); renderChosenGames(); renderPoolList();
    persist();
  }

  var spinBtnEl = document.getElementById('spinBtn');
  if(spinBtnEl) spinBtnEl.addEventListener('click', spinWheel);
  var resetWheelBtnEl = document.getElementById('resetWheelBtn');
  if(resetWheelBtnEl) resetWheelBtnEl.addEventListener('click', resetWheel);
  var restoreDefaultsBtnEl = document.getElementById('restoreDefaultsBtn');
  if(restoreDefaultsBtnEl) restoreDefaultsBtnEl.addEventListener('click', restoreDefaultGames);
  var addGameBtn = document.getElementById('addGameBtn');
  if(addGameBtn){
    addGameBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      var iconInput = document.getElementById('gameIconInput');
      var nameInput = document.getElementById('gameNameInput');
      var genreInput = document.getElementById('gameGenreInput');
      var imageInput = document.getElementById('gameImageInput');
      var name = nameInput.value.trim();
      if(!name) return;
      if(gamePool.some(function(g){ return g.name.toLowerCase() === name.toLowerCase(); })){
        alert('That game is already in your pool.');
        return;
      }
      var icon = iconInput.value.trim() || '🎮';
      var genre = genreInput.value.trim() || 'Game';
      var image = imageInput.value.trim();
      var entry = {icon:icon, name:name, genre:genre};
      if(image && /^https?:\/\//i.test(image)) entry.image = image;
      gamePool.push(entry);
      iconInput.value=''; nameInput.value=''; genreInput.value=''; imageInput.value='';
      renderPoolList(); buildWheel(); renderChosenGames();
      persist();
    });
  }
  var gameNameInputEl = document.getElementById('gameNameInput');
  if(gameNameInputEl && addGameBtn){
    gameNameInputEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); addGameBtn.click(); }
    });
  }

  /* ---------- Teams ---------- */
  function setTeamModeUI(mode){
    document.querySelectorAll('.team-mode-card').forEach(function(c){
      c.classList.toggle('is-active', c.getAttribute('data-mode') === mode);
    });
    var duoUi = document.getElementById('duoUi');
    var groupUi = document.getElementById('groupUi');
    if(!duoUi || !groupUi) return;
    if(mode === 'duo'){
      duoUi.style.display = '';
      groupUi.style.display = 'none';
    } else {
      duoUi.style.display = 'none';
      groupUi.style.display = '';
      var label = document.getElementById('groupSizeLabel');
      if(label) label.textContent = mode === 'trio' ? '3' : '4';
    }
  }
  function renderDuoTeams(){
    var wrap = document.getElementById('duoTeamsList');
    if(!wrap) return;
    if(duoTeams.length === 0){ wrap.innerHTML = '<p class="team-empty-note">No duo teams yet — add your first pair above.</p>'; return; }
    wrap.innerHTML = duoTeams.map(function(t,i){
      return '<div class="team-result-card cut-corner"><span class="team-result-name">'+escapeHtml(t.a)+' &amp; '+escapeHtml(t.b)+'</span><button class="team-remove-btn" data-idx="'+i+'" aria-label="Remove team">✕</button></div>';
    }).join('');
    wrap.querySelectorAll('.team-remove-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        duoTeams.splice(parseInt(btn.getAttribute('data-idx'),10),1);
        renderDuoTeams();
        persist();
      });
    });
  }
  function renderGroupPlayers(){
    var wrap = document.getElementById('groupPlayersList');
    if(!wrap) return;
    if(groupPlayers.length === 0){ wrap.innerHTML = '<p class="team-empty-note">No players added yet.</p>'; return; }
    wrap.innerHTML = groupPlayers.map(function(name,i){
      return '<span class="player-chip">'+escapeHtml(name)+'<button data-idx="'+i+'" aria-label="Remove player">✕</button></span>';
    }).join('');
    wrap.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        groupPlayers.splice(parseInt(btn.getAttribute('data-idx'),10),1);
        renderGroupPlayers();
        persist();
      });
    });
  }
  function renderGroupTeams(){
    var wrap = document.getElementById('groupTeamsList');
    if(!wrap) return;
    if(groupTeams.length === 0){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = groupTeams.map(function(team,i){
      return '<div class="team-result-card cut-corner"><span class="team-result-label">Team '+(i+1)+'</span><span class="team-result-name">'+team.map(escapeHtml).join(', ')+'</span></div>';
    }).join('');
  }
  function shuffleGroupTeams(){
    if(!isAdmin) return;
    var size = teamMode === 'trio' ? 3 : 4;
    if(groupPlayers.length < size){
      alert('Add at least ' + size + ' players to form a ' + teamMode + '.');
      return;
    }
    var shuffled = groupPlayers.slice();
    for(var i = shuffled.length - 1; i > 0; i--){
      var j = Math.floor(Math.random() * (i + 1));
      var tmp = shuffled[i]; shuffled[i] = shuffled[j]; shuffled[j] = tmp;
    }
    var teams = [];
    for(var k = 0; k < shuffled.length; k += size){
      teams.push(shuffled.slice(k, k + size));
    }
    if(teams.length > 1 && teams[teams.length-1].length < size - 1){
      var leftover = teams.pop();
      teams[teams.length-1] = teams[teams.length-1].concat(leftover);
    }
    groupTeams = teams;
    renderGroupTeams();
    persist();
  }

  document.querySelectorAll('.team-mode-card').forEach(function(card){
    card.addEventListener('click', function(){
      if(!isAdmin) return;
      teamMode = card.getAttribute('data-mode');
      setTeamModeUI(teamMode);
      persist();
    });
  });
  var addDuoBtn = document.getElementById('addDuoBtn');
  if(addDuoBtn){
    addDuoBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      var aInput = document.getElementById('duoInputA');
      var bInput = document.getElementById('duoInputB');
      var a = aInput.value.trim(), b = bInput.value.trim();
      if(!a || !b) return;
      duoTeams.push({a:a, b:b});
      aInput.value = ''; bInput.value = '';
      renderDuoTeams();
      persist();
    });
  }
  var addPlayerBtn = document.getElementById('addPlayerBtn');
  if(addPlayerBtn){
    addPlayerBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      var input = document.getElementById('playerInput');
      var name = input.value.trim();
      if(!name) return;
      groupPlayers.push(name);
      input.value = '';
      renderGroupPlayers();
      persist();
    });
  }
  var playerInputEl = document.getElementById('playerInput');
  if(playerInputEl && addPlayerBtn){
    playerInputEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); addPlayerBtn.click(); }
    });
  }
  var duoInputBEl = document.getElementById('duoInputB');
  if(duoInputBEl && addDuoBtn){
    duoInputBEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); addDuoBtn.click(); }
    });
  }
  var shuffleBtnEl = document.getElementById('shuffleTeamsBtn');
  if(shuffleBtnEl) shuffleBtnEl.addEventListener('click', shuffleGroupTeams);

  /* ---------- Scoreboard (totals computed from finalized game results) ---------- */
  function computeTeamPoints(teamName){
    var total = 0;
    gameResults.forEach(function(gr){
      if(gr && gr.finalized && gr.placements){
        gr.placements.forEach(function(p){ if(p.team === teamName) total += p.points; });
      }
    });
    return total;
  }
  function renderScoreboard(){
    var wrap = document.getElementById('scoreboardGrid');
    if(!wrap) return;
    if(scoreboardTeams.length === 0){
      wrap.innerHTML = '<p class="team-empty-note">Add your teams below to start tracking the league.</p>';
    } else {
      var withPts = scoreboardTeams.map(function(t){ return { name:t.name, points: computeTeamPoints(t.name) }; });
      var maxScore = Math.max.apply(null, withPts.map(function(t){ return t.points; }));
      wrap.innerHTML = withPts.map(function(t,i){
        var isLeader = t.points === maxScore && maxScore > 0;
        return '<div class="scoreboard-card cut-corner'+(isLeader?' is-leader':'')+'">' +
          (isLeader ? '<span class="leader-badge">👑 Leading</span>' : '') +
          '<div class="scoreboard-name">'+escapeHtml(t.name)+'</div>' +
          '<div class="scoreboard-score">'+t.points+'<small>pts</small></div>' +
          '<div class="scoreboard-btns">' +
          '<button data-action="remove" data-idx="'+i+'" class="scoreboard-remove">Remove Team ✕</button>' +
          '</div></div>';
      }).join('');
    }
    wrap.querySelectorAll('button').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        var idx = parseInt(btn.getAttribute('data-idx'),10);
        scoreboardTeams.splice(idx,1);
        renderScoreboard();
        renderResultsGames();
        persist();
      });
    });
  }
  var addScoreTeamBtn = document.getElementById('addScoreTeamBtn');
  if(addScoreTeamBtn){
    addScoreTeamBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      var input = document.getElementById('scoreTeamInput');
      var name = input.value.trim();
      if(!name) return;
      scoreboardTeams.push({name:name});
      input.value = '';
      renderScoreboard();
      renderResultsGames();
      persist();
    });
  }
  var scoreTeamInputEl = document.getElementById('scoreTeamInput');
  if(scoreTeamInputEl && addScoreTeamBtn){
    scoreTeamInputEl.addEventListener('keydown', function(e){
      if(e.key === 'Enter'){ e.preventDefault(); addScoreTeamBtn.click(); }
    });
  }
  var importTeamsBtn = document.getElementById('importTeamsBtn');
  if(importTeamsBtn){
    importTeamsBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      var names = [];
      if(teamMode === 'duo'){
        names = duoTeams.map(function(t){ return t.a + ' & ' + t.b; });
      } else {
        names = groupTeams.map(function(team,i){ return 'Team ' + (i+1) + ' (' + team.join(', ') + ')'; });
      }
      if(names.length === 0){ alert('Build your teams above first, then import them here.'); return; }
      names.forEach(function(name){
        if(!scoreboardTeams.some(function(t){ return t.name === name; })){
          scoreboardTeams.push({name:name});
        }
      });
      renderScoreboard();
      renderResultsGames();
      persist();
    });
  }
  var resetScoresBtn = document.getElementById('resetScoresBtn');
  if(resetScoresBtn){
    resetScoresBtn.addEventListener('click', function(){
      if(!isAdmin) return;
      if(!confirm('Reset ALL per-game marks and finalized results? Team rosters stay, but every point resets to zero.')) return;
      gameResults = [];
      renderScoreboard();
      renderResultsGames();
      renderRecap();
      persist();
    });
  }

  /* ---------- Results: mark finish/challenge per team per game, then finalize for F1 points ---------- */
  function getGameResult(i){
    if(!gameResults[i]) gameResults[i] = { marks:{}, finalized:false, placements:null };
    if(!gameResults[i].marks) gameResults[i].marks = {};
    return gameResults[i];
  }
  function renderResultsGames(){
    var wrap = document.getElementById('resultsGamesList');
    if(!wrap) return;
    if(chosenGames.length === 0){
      wrap.innerHTML = '<p class="team-empty-note">Spin the wheel above to lock in games before marking results.</p>';
      return;
    }
    if(scoreboardTeams.length === 0){
      wrap.innerHTML = '<p class="team-empty-note">Add your teams in the Scoreboard section above first.</p>';
      return;
    }
    wrap.innerHTML = chosenGames.map(function(g,i){
      var gr = getGameResult(i);
      var rows = scoreboardTeams.map(function(t){
        var m = gr.marks[t.name] || {finish:false, challenge:false};
        var score = (m.finish?1:0) + (m.challenge?1:0);
        return '<div class="result-team-row">' +
          '<span class="result-team-name">'+escapeHtml(t.name)+'</span>' +
          '<button class="result-toggle finish-toggle'+(m.finish?' is-on':'')+'" data-game="'+i+'" data-team="'+escapeHtml(t.name)+'" data-field="finish">Finished</button>' +
          '<button class="result-toggle challenge-toggle'+(m.challenge?' is-on':'')+'" data-game="'+i+'" data-team="'+escapeHtml(t.name)+'" data-field="challenge">Challenge</button>' +
          '<span class="result-team-score">'+score+' pt'+(score===1?'':'s')+'</span>' +
          '</div>';
      }).join('');
      return '<div class="result-game-card cut-corner">' +
        '<div class="result-game-head">' +
          gameIconHtml(g,'game-icon')+'<h3>'+escapeHtml(g.name)+'</h3>' +
          '<span class="result-game-status'+(gr.finalized?' is-final':'')+'">'+(gr.finalized?'Finalized':'In Progress')+'</span>' +
        '</div>' +
        rows +
        '<div class="result-game-actions">' +
          '<button class="btn-primary" data-finalize="'+i+'"'+(gr.finalized?' disabled':'')+'>Finalize &amp; Award Points</button>' +
          '<button class="btn-ghost" data-reopen="'+i+'"'+(gr.finalized?'':' disabled')+'>Reopen</button>' +
        '</div>' +
      '</div>';
    }).join('');

    wrap.querySelectorAll('.result-toggle').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        var i = parseInt(btn.getAttribute('data-game'),10);
        var team = btn.getAttribute('data-team');
        var field = btn.getAttribute('data-field');
        var gr = getGameResult(i);
        if(gr.finalized) return;
        if(!gr.marks[team]) gr.marks[team] = {finish:false, challenge:false};
        gr.marks[team][field] = !gr.marks[team][field];
        renderResultsGames();
        persist();
      });
    });
    wrap.querySelectorAll('[data-finalize]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        var i = parseInt(btn.getAttribute('data-finalize'),10);
        finalizeGame(i);
      });
    });
    wrap.querySelectorAll('[data-reopen]').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        var i = parseInt(btn.getAttribute('data-reopen'),10);
        var gr = getGameResult(i);
        if(!confirm('Reopen this game? Its awarded points will be removed until you finalize again.')) return;
        gr.finalized = false;
        gr.placements = null;
        renderResultsGames();
        renderScoreboard();
        renderRecap();
        persist();
      });
    });
  }
  function finalizeGame(i){
    var gr = getGameResult(i);
    if(gr.finalized) return;
    var scored = scoreboardTeams.map(function(t){
      var m = gr.marks[t.name] || {finish:false, challenge:false};
      return { team:t.name, score:(m.finish?1:0)+(m.challenge?1:0), challenge: !!m.challenge };
    });
    scored.sort(function(a,b){ return b.score - a.score; });
    var placements = [];
    var place = 1;
    for(var idx=0; idx<scored.length; idx++){
      if(idx > 0 && scored[idx].score < scored[idx-1].score) place = idx + 1;
      var points = place <= F1_POINTS.length ? F1_POINTS[place-1] : 0;
      placements.push({ team:scored[idx].team, score:scored[idx].score, place:place, points:points, challenge:scored[idx].challenge });
    }
    gr.placements = placements;
    gr.finalized = true;
    renderResultsGames();
    renderScoreboard();
    renderRecap();
    persist();
  }

  /* ---------- Recap ---------- */
  function renderRecap(){
    var wrap = document.getElementById('recapList');
    if(!wrap) return;
    if(chosenGames.length === 0){
      wrap.innerHTML = '<p class="team-empty-note">Recaps will appear here once games are spun and finalized.</p>';
      return;
    }
    wrap.innerHTML = chosenGames.map(function(g,i){
      var gr = gameResults[i];
      var head = '<div class="recap-head">'+gameIconHtml(g,'game-icon')+'<h3>'+escapeHtml(g.name)+'</h3>';
      if(gr && gr.finalized && gr.placements && gr.placements.length){
        head += '<span class="recap-winner">🏆 '+escapeHtml(gr.placements[0].team)+'</span></div>';
        var rows = gr.placements.map(function(p){
          return '<div class="recap-row'+(p.place===1?' is-first':'')+'">' +
            '<span class="recap-place">P'+p.place+'</span>' +
            '<span class="recap-team">'+escapeHtml(p.team)+(p.challenge?'<span class="recap-badge" style="margin-left:0.5rem;">⚡ Challenge</span>':'')+'</span>' +
            '<span class="recap-pts">+'+p.points+' pts</span>' +
          '</div>';
        }).join('');
        return '<div class="recap-card cut-corner">'+head+'<div class="recap-placements">'+rows+'</div></div>';
      }
      head += '</div>';
      return '<div class="recap-card cut-corner">'+head+'<p class="recap-pending">Not finalized yet.</p></div>';
    }).join('');
  }

  /* ---------- Clips ---------- */
  function renderClips(){
    var wrap = document.getElementById('clipsList');
    if(!wrap) return;
    if(clips.length === 0){
      wrap.innerHTML = '<p class="team-empty-note">No clips posted yet — be the first.</p>';
      return;
    }
    wrap.innerHTML = clips.slice().reverse().map(function(c){
      var safeUrl = /^https?:\/\//i.test(c.url) ? c.url : '#';
      return '<div class="clip-card cut-corner">' +
        '<div class="clip-head"><span class="clip-name">'+escapeHtml(c.name)+'</span>' +
        '<button class="clip-remove-btn" data-ts="'+c.ts+'" aria-label="Delete clip">Delete ✕</button>' +
        '</div>' +
        '<a class="clip-link" href="'+escapeHtml(safeUrl)+'" target="_blank" rel="noopener noreferrer">'+escapeHtml(c.url)+'</a>' +
        (c.note ? '<div class="clip-note">'+escapeHtml(c.note)+'</div>' : '') +
      '</div>';
    }).join('');
    wrap.querySelectorAll('.clip-remove-btn').forEach(function(btn){
      btn.addEventListener('click', function(){
        if(!isAdmin) return;
        var ts = parseFloat(btn.getAttribute('data-ts'));
        var idx = clips.findIndex(function(c){ return c.ts === ts; });
        if(idx === -1) return;
        if(!confirm('Delete this clip? This can\'t be undone.')) return;
        clips.splice(idx,1);
        renderClips();
        saveClips();
      });
    });
  }
  function saveClips(){
    if(!isAuthed) return;
    set(ref(db, 'state/clips'), clips).catch(function(err){ console.error('Clip save failed:', err); });
  }
  var addClipBtn = document.getElementById('addClipBtn');
  if(addClipBtn){
    addClipBtn.addEventListener('click', function(){
      if(!isAuthed) return;
      var nameInput = document.getElementById('clipNameInput');
      var urlInput = document.getElementById('clipUrlInput');
      var noteInput = document.getElementById('clipNoteInput');
      var name = nameInput.value.trim();
      var url = urlInput.value.trim();
      var note = noteInput.value.trim();
      if(!name || !url){ alert('Add your name and a clip link.'); return; }
      clips.push({ name:name, url:url, note:note, ts:Date.now() });
      nameInput.value=''; urlInput.value=''; noteInput.value='';
      renderClips();
      saveClips();
    });
  }

  /* ---------- Firebase sync ---------- */
  function collectState(){
    return {
      gamePool: gamePool, chosenGames: chosenGames, teamMode: teamMode,
      duoTeams: duoTeams, groupPlayers: groupPlayers, groupTeams: groupTeams,
      scoreboardTeams: scoreboardTeams, gameResults: gameResults, clips: clips, wheelRotation: 0
    };
  }
  var saveTimer = null;
  function persist(){
    if(!isAdmin) return;
    if(saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function(){
      update(stateRef, collectState()).catch(function(err){ console.error('Sync save failed:', err); });
    }, 150);
  }
  function applyRemoteState(data){
    if(!data) return;
    if(Array.isArray(data.gamePool)) gamePool = data.gamePool;
    if(Array.isArray(data.chosenGames)) chosenGames = data.chosenGames;
    if(data.teamMode) teamMode = data.teamMode;
    if(Array.isArray(data.duoTeams)) duoTeams = data.duoTeams;
    if(Array.isArray(data.groupPlayers)) groupPlayers = data.groupPlayers;
    if(Array.isArray(data.groupTeams)) groupTeams = data.groupTeams;
    if(Array.isArray(data.scoreboardTeams)) scoreboardTeams = data.scoreboardTeams;
    if(Array.isArray(data.gameResults)) gameResults = data.gameResults;
    if(Array.isArray(data.clips)) clips = data.clips;

    buildWheel();
    renderPoolList();
    renderChosenGames();
    setTeamModeUI(teamMode);
    renderDuoTeams();
    renderGroupPlayers();
    renderGroupTeams();
    renderScoreboard();
    renderResultsGames();
    renderRecap();
    renderClips();
    if(wheelEl){ wheelEl.style.transition='none'; wheelEl.style.transform='rotate(0deg)'; }
  }

  onValue(stateRef, function(snap){
    var data = snap.val();
    hasLoadedRemote = true;
    if(data){
      applyRemoteState(data);
    } else {
      // Nothing saved yet — show local defaults; first host save creates it.
      buildWheel(); renderPoolList(); renderChosenGames();
      setTeamModeUI(teamMode); renderDuoTeams(); renderGroupPlayers(); renderGroupTeams();
      renderScoreboard(); renderResultsGames(); renderRecap(); renderClips();
    }
  }, function(err){ console.error('Sync read failed:', err); });

  window.addEventListener('beforeunload', function(){
    if(isAdmin) update(stateRef, collectState()).catch(function(){});
  });

  /* ---------- Auth: host (full edit) vs any assigned contributor (clips only) ---------- */
  var adminToggle = document.getElementById('adminToggle');
  var adminPanel = document.getElementById('adminPanel');
  var adminEmail = document.getElementById('adminEmail');
  var adminPassword = document.getElementById('adminPassword');
  var adminLoginBtn = document.getElementById('adminLoginBtn');
  var adminLogoutBtn = document.getElementById('adminLogoutBtn');
  var adminStatus = document.getElementById('adminStatus');
  var syncBadgeText = document.getElementById('syncBadgeText');

  adminToggle.addEventListener('click', function(){
    adminPanel.style.display = adminPanel.style.display === 'block' ? 'none' : 'block';
  });

  function setEditable(canEdit){
    document.body.classList.toggle('viewer-mode', !canEdit);
    document.body.classList.toggle('is-admin-mode', canEdit);
    syncBadgeText.textContent = canEdit ? 'Host mode — editing on' : (isAuthed ? 'Logged in — clips only' : 'Live view — watching only');

    var ids = [
      'addDuoBtn','addPlayerBtn','shuffleTeamsBtn','addGameBtn',
      'spinBtn','resetWheelBtn','restoreDefaultsBtn',
      'addScoreTeamBtn','importTeamsBtn','resetScoresBtn'
    ];
    ids.forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.disabled = !canEdit;
    });
    var inputs = ['duoInputA','duoInputB','playerInput','gameIconInput','gameNameInput','gameGenreInput','gameImageInput','scoreTeamInput'];
    inputs.forEach(function(id){
      var el = document.getElementById(id);
      if(el) el.readOnly = !canEdit;
    });
    // spinBtn's disabled state also depends on wheel progress — recompute
    renderChosenGames();
  }

  adminLoginBtn.addEventListener('click', async function(){
    try{
      await signInWithEmailAndPassword(auth, adminEmail.value.trim(), adminPassword.value);
    }catch(err){
      adminStatus.textContent = err.message;
    }
  });
  adminLogoutBtn.addEventListener('click', async function(){
    await signOut(auth);
  });
  onAuthStateChanged(auth, function(user){
    isAuthed = !!user;
    isAdmin = isAuthed && user.email === HOST_EMAIL;
    document.body.classList.toggle('is-authed', isAuthed);
    setEditable(isAdmin);
    if(!user){ adminStatus.textContent = 'Not logged in'; }
    else if(isAdmin){ adminStatus.textContent = 'Logged in as host (' + user.email + ')'; }
    else{ adminStatus.textContent = 'Logged in as ' + user.email + ' — clips only'; }
  });

  // Start locked until auth state resolves
  setEditable(false);
