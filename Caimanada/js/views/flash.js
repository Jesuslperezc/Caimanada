import { AlertService } from '../components/alert.js';
import { getMaxPlayersForSport, getPositionsForSport } from '../utils/sport-terms.js';

let flashState = {
  teams: [], queue: [], currentMatch: null, matchHistory: [],
  timerInterval: null, config: { timeLimit: 0 }
};

export async function renderFlashView() {
  const container = document.getElementById('flash-content-target');
  if (!container) return;

  // Si la URL trae datos de una sesión compartida, la absorbemos
  handleIncomingFlashUrl();

  if (flashState.currentMatch) { renderLiveMatchView(); return; }
  if (flashState.matchHistory.length > 0 && flashState.teams.length === 0) { flashState.matchHistory = []; }
  renderSetupView();
}

function handleIncomingFlashUrl() {
  const hash = window.location.hash;
  if (hash.includes('?data=')) {
    try {
      const compressedData = hash.split('?data=')[1];
      const jsonString = LZString.decompressFromEncodedURIComponent(compressedData);
      const incomingSession = JSON.parse(jsonString);
      
      mergeFlashSession(incomingSession);
      AlertService.showSuccess('¡Historial Flash sincronizado!', 'Se han actualizado tus videos');
      
      // Limpiar la URL y redirigir al Dashboard para que vea el resultado
      history.replaceState(null, null, window.location.pathname + '#dashboard');
      window.location.hash = '#dashboard'; // Dispara el router para ir al inicio
    } catch (e) { 
      console.error("Error leyendo URL", e); 
    }
  }
}

function getActiveSportId() { return localStorage.getItem('active_sport_id') || 'futbol_sala'; }

function renderSetupView() {
  const container = document.getElementById('flash-content-target');
  flashState = { teams: [], queue: [], currentMatch: null, matchHistory: [], timerInterval: null, config: { timeLimit: 0 } };

  container.innerHTML = `
    <article class="info-card">
      <h2 class="modal-card__title">Configurar Caimana Flash</h2>
      <div class="form-group">
        <label class="form-group__label">Agrega los equipos/jugadores (Enter para agregar)</label>
        <div style="display: flex; gap: 0.5rem;">
          <input type="text" id="flash-team-input" class="form-control" placeholder="Ej: Equipo A, Carlos, etc." />
          <button id="flash-add-team-btn" class="btn btn--primary"><i class="fa-solid fa-plus"></i></button>
        </div>
      </div>
      <div id="flash-teams-list" style="display: flex; flex-direction: column; gap: 0.75rem; margin-bottom: 1.5rem;"></div>
      <div class="form-group">
        <label class="form-group__label">Límite de tiempo por partido (Minutos)</label>
        <input type="number" id="flash-time-limit" class="form-control" min="0" value="10" />
        <p style="font-size: 0.75rem; color: var(--text-muted); margin-top: 0.25rem;">0 = Sin límite de tiempo.</p>
      </div>
      <div class="modal-actions">
        <button id="flash-start-btn" class="btn btn--primary btn-full" disabled><i class="fa-solid fa-play"></i> Iniciar Caimana Flash</button>
      </div>
    </article>
  `;

  const input = document.getElementById('flash-team-input');
  const addBtn = document.getElementById('flash-add-team-btn');
  const startBtn = document.getElementById('flash-start-btn');
  const list = document.getElementById('flash-teams-list');

  const updateList = () => {
    list.innerHTML = flashState.teams.map((t, i) => `
      <div style="background: rgba(0,0,0,0.2); border: 1px solid var(--border-card); padding: 0.75rem 1rem; border-radius: 8px; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <strong style="color: var(--text-primary);">${t.name}</strong>
          <p style="font-size: 0.75rem; color: var(--text-muted); margin: 0;">${t.players.length} jugadores</p>
        </div>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="window.openFlashRoster('${t.id}')" class="btn btn--secondary btn--sm"><i class="fa-solid fa-users"></i> Plantilla</button>
          <button onclick="window.removeFlashTeam(${i})" class="btn btn--danger btn--sm"><i class="fa-solid fa-trash"></i></button>
        </div>
      </div>
    `).join('');
    startBtn.disabled = flashState.teams.length < 2;
  };

  window.removeFlashTeam = (i) => { flashState.teams.splice(i, 1); updateList(); };

  window.openFlashRoster = (teamId) => {
    const team = flashState.teams.find(t => t.id === teamId);
    if (!team) return;
    const sportId = getActiveSportId();
    const positions = getPositionsForSport(sportId);
    document.getElementById('dynamic-flash-roster-modal')?.remove();
    
    document.body.insertAdjacentHTML('beforeend', `
      <div id="dynamic-flash-roster-modal" class="modal-overlay">
        <div class="modal-card modal-card--form">
          <h2 class="modal-card__title">Plantilla: ${team.name}</h2>
          <div class="form-group">
            <label class="form-group__label">Nombre del Jugador</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" id="flash-player-name" class="form-control" placeholder="Nombre" autofocus />
              <select id="flash-player-pos" class="form-control" style="max-width: 120px;">
                ${positions.map(p => `<option value="${p}">${p}</option>`).join('')}
              </select>
              <button id="flash-add-player-btn" class="btn btn--primary"><i class="fa-solid fa-plus"></i></button>
            </div>
          </div>
          <div id="flash-players-list" style="max-height: 200px; overflow-y: auto; margin-bottom: 1rem;"></div>
          <div class="modal-actions">
            <button type="button" id="flash-roster-close" class="btn btn--secondary btn-full">Cerrar</button>
          </div>
        </div>
      </div>
    `);

    const modalEl = document.getElementById('dynamic-flash-roster-modal');
    const nameInput = document.getElementById('flash-player-name');
    const posInput = document.getElementById('flash-player-pos');
    const addPBtn = document.getElementById('flash-add-player-btn');
    const listEl = document.getElementById('flash-players-list');

    const renderPlayers = () => {
      listEl.innerHTML = team.players.map(p => `
        <div style="display: flex; justify-content: space-between; background: rgba(255,255,255,0.05); padding: 0.5rem 0.75rem; border-radius: 6px; margin-bottom: 0.3rem; font-size: 0.85rem;">
          <span>${p.name} <span style="color: var(--text-muted);">(${p.position})</span></span>
          <button onclick="window.removeFlashPlayer('${team.id}', '${p.id}')" class="btn btn--danger btn--sm" style="padding: 0.2rem 0.4rem;">X</button>
        </div>
      `).join('') || '<p style="color: var(--text-muted); text-align: center; font-size: 0.85rem;">Sin jugadores</p>';
    };

    window.removeFlashPlayer = (tId, pId) => {
      const t = flashState.teams.find(x => x.id === tId);
      t.players = t.players.filter(p => p.id !== pId);
      renderPlayers(); updateList();
    };

    const addPlayer = () => {
      const name = nameInput.value.trim();
      if (name) {
        team.players.push({ id: `p_${Date.now()}`, name, position: posInput.value });
        nameInput.value = ''; renderPlayers(); updateList();
      }
    };

    addPBtn.onclick = addPlayer;
    nameInput.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addPlayer(); } };
    document.getElementById('flash-roster-close').onclick = () => modalEl.remove();
    modalEl.onclick = (e) => { if (e.target === modalEl) modalEl.remove(); };
    renderPlayers();
  };

  const addTeam = () => {
    const name = input.value.trim();
    if (name) {
      flashState.teams.push({ id: `flash_t_${Date.now()}_${flashState.teams.length}`, name, players: [] });
      input.value = ''; updateList();
    }
  };

  addBtn.onclick = addTeam;
  input.onkeydown = (e) => { if (e.key === 'Enter') { e.preventDefault(); addTeam(); } };

  startBtn.onclick = () => {
    flashState.config.timeLimit = parseInt(document.getElementById('flash-time-limit').value) || 0;
    flashState.queue = [...flashState.teams];
    startNextMatch();
  };

  updateList();
}

function startNextMatch() {
  if (flashState.queue.length < 2) { endFlashSession(); return; }
  const team1 = flashState.queue.shift();
  const team2 = flashState.queue.shift();
  flashState.currentMatch = { team1, team2, score1: 0, score2: 0, events: [], startTime: Date.now(), endTime: null };
  renderLiveMatchView();
}

function renderLiveMatchView() {
  const container = document.getElementById('flash-content-target');
  const m = flashState.currentMatch;

  const renderTeamPlayers = (team, side) => {
    if (team.players.length === 0) return `<button onclick="window.flashScore(${side}, 1)" class="btn btn--secondary btn--sm btn-full" style="margin-top: 0.5rem;"><i class="fa-solid fa-plus"></i> Punto</button>`;
    return team.players.map(p => `
      <button onclick="window.flashPlayerScore(${side}, '${p.id}')" class="btn btn--secondary btn--sm" style="margin-top: 0.5rem; width: 100%; text-align: left;">
        <i class="fa-solid fa-futbol" style="margin-right: 0.5rem; color: var(--accent-primary);"></i> ${p.name}
      </button>
    `).join('');
  };

  container.innerHTML = `
    <article class="info-card" style="text-align: center;">
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 1.5rem; background: rgba(0,0,0,0.3); padding: 1rem; border-radius: 12px; gap: 1rem;">
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
          <p style="font-size: 1.2rem; font-weight: 800; color: var(--accent-primary);">${m.team1.name}</p>
          <span id="flash-score-1" style="font-size: 3rem; font-weight: 900; color: #fff; font-family: monospace;">${m.score1}</span>
          <div style="width: 100%;">${renderTeamPlayers(m.team1, 1)}</div>
        </div>
        <div style="font-size: 1.5rem; color: var(--text-muted); align-self: center;">VS</div>
        <div style="flex: 1; display: flex; flex-direction: column; align-items: center;">
          <p style="font-size: 1.2rem; font-weight: 800; color: var(--accent-secondary);">${m.team2.name}</p>
          <span id="flash-score-2" style="font-size: 3rem; font-weight: 900; color: #fff; font-family: monospace;">${m.score2}</span>
          <div style="width: 100%;">${renderTeamPlayers(m.team2, 2)}</div>
        </div>
      </div>
      <div style="margin-bottom: 2rem;">
        <p style="font-size: 0.8rem; color: var(--text-muted); text-transform: uppercase;">Tiempo de partido</p>
        <h2 id="flash-timer" style="font-size: 2.5rem; font-weight: 900; color: #fff;">00:00</h2>
      </div>
      <div class="modal-actions" style="flex-direction: column; gap: 0.75rem;">
        <button onclick="window.endFlashMatch('${m.team1.id}', false)" class="btn btn--primary btn-full">Ganó ${m.team1.name}</button>
        <button onclick="window.endFlashMatch('${m.team2.id}', false)" class="btn btn--primary btn-full">Ganó ${m.team2.name}</button>
        <div style="display: flex; gap: 0.5rem;">
          <button onclick="window.endFlashMatch('${m.team1.id}', true)" class="btn btn--secondary btn-full">Gana y Cede Lugar (${m.team1.name})</button>
          <button onclick="window.endFlashMatch('${m.team2.id}', true)" class="btn btn--secondary btn-full">Gana y Cede Lugar (${m.team2.name})</button>
        </div>
        <button onclick="window.abortFlash()" class="btn btn--danger btn-full" style="margin-top: 1rem;">Terminar Sesión Flash</button>
      </div>
    </article>
  `;

  if (flashState.timerInterval) clearInterval(flashState.timerInterval);
  flashState.timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - m.startTime) / 1000);
    const mins = String(Math.floor(elapsed / 60)).padStart(2, '0');
    const secs = String(elapsed % 60).padStart(2, '0');
    const timerEl = document.getElementById('flash-timer');
    if (timerEl) timerEl.textContent = `${mins}:${secs}`;
    if (flashState.config.timeLimit > 0 && elapsed >= flashState.config.timeLimit * 60) {
      clearInterval(flashState.timerInterval);
      AlertService.showWarning('¡Tiempo agotado!', 'Límite de tiempo alcanzado.');
      const winnerId = m.score1 >= m.score2 ? m.team1.id : m.team2.id;
      window.endFlashMatch(winnerId, false);
    }
  }, 1000);
}

window.flashScore = (team, amount) => {
  const m = flashState.currentMatch;
  if (!m) return;
  if (team === 1) m.score1 = Math.max(0, m.score1 + amount);
  if (team === 2) m.score2 = Math.max(0, m.score2 + amount);
  document.getElementById('flash-score-1').textContent = m.score1;
  document.getElementById('flash-score-2').textContent = m.score2;
};

window.flashPlayerScore = (team, playerId) => {
  const m = flashState.currentMatch;
  if (!m) return;
  const teamObj = team === 1 ? m.team1 : m.team2;
  const player = teamObj.players.find(p => p.id === playerId);
  if (team === 1) m.score1++; else m.score2++;
  // REGISTRO DE HORA EXACTA DEL GOL
  m.events.push({ id: `ev_${Date.now()}`, teamName: teamObj.name, playerName: player.name, timestamp: Date.now(), beelupUrl: null });
  document.getElementById('flash-score-1').textContent = m.score1;
  document.getElementById('flash-score-2').textContent = m.score2;
};

window.endFlashMatch = (winnerId, isFairPlay) => {
  const m = flashState.currentMatch;
  if (!m) return;
  clearInterval(flashState.timerInterval);
  m.endTime = Date.now();
  m.duration = Math.floor((m.endTime - m.startTime) / 1000);
  m.winnerId = winnerId;
  m.winnerName = winnerId === m.team1.id ? m.team1.name : m.team2.name;

  flashState.matchHistory.push({
    id: `match_${m.startTime}`, team1: m.team1.name, team2: m.team2.name,
    score1: m.score1, score2: m.score2, winner: m.winnerName, 
    duration: m.duration, isFairPlay, events: m.events, startTime: m.startTime
  });

  const winnerTeam = winnerId === m.team1.id ? m.team1 : m.team2;
  const loserTeam = winnerId === m.team1.id ? m.team2 : m.team1;

  if (isFairPlay) {
    // GANA Y CEDE LUGAR: El perdedor se queda en cancha, el ganador se va a descansar al final
    flashState.queue.unshift(loserTeam);
    flashState.queue.push(winnerTeam);
    AlertService.showSuccess(`¡${winnerTeam.name} ganó y cedió!`, `${loserTeam.name} se queda en cancha`);
  } else {
    flashState.queue.unshift(winnerTeam);
    flashState.queue.push(loserTeam);
    AlertService.showSuccess(`¡${winnerTeam.name} ganó!`, 'El rey se queda');
  }
  startNextMatch();
};

window.abortFlash = () => {
  if (flashState.timerInterval) clearInterval(flashState.timerInterval);
  endFlashSession();
};
function endFlashSession() {
  const container = document.getElementById('flash-content-target');
  const teamStats = {};
  const playerStats = {};
  
  flashState.matchHistory.forEach(m => {
    if (!teamStats[m.team1]) teamStats[m.team1] = { w: 0, l: 0 };
    if (!teamStats[m.team2]) teamStats[m.team2] = { w: 0, l: 0 };
    teamStats[m.winner].w++;
    if (m.winner === m.team1) teamStats[m.team2].l++; else teamStats[m.team1].l++;
    m.events.forEach(ev => {
      if (!playerStats[ev.playerName]) playerStats[ev.playerName] = { goals: 0 };
      playerStats[ev.playerName].goals++;
    });
  });

  container.innerHTML = `
    <article class="info-card">
      <h2 class="modal-card__title" style="text-align: center;"><i class="fa-solid fa-flag-checkered"></i> Sesión Finalizada</h2>
      
      <!-- SUBIDA DE FOTO DE RECUERDO MEJORADA -->
      <div style="text-align: center; margin-bottom: 1.5rem;">
        <label class="form-group__label">Foto de Recuerdo</label>
        <div id="flash-photo-preview" style="width: 100%; max-width: 300px; height: 200px; margin: 0 auto 0.75rem; border: 2px dashed var(--border-card); border-radius: 8px; display: flex; align-items: center; justify-content: center; cursor: pointer; background: rgba(0,0,0,0.2); overflow: hidden; position: relative;">
          <span style="color: var(--text-muted); font-size: 0.85rem; text-align: center; padding: 1rem;"><i class="fa-solid fa-camera"></i><br>Presiona para tomar foto<br>o subir de tu galería</span>
        </div>
        
        <!-- Botones explícitos para móvil -->
        <div style="display: flex; gap: 0.5rem;">
          <label class="btn btn--secondary btn-full" style="cursor: pointer; margin: 0;">
            <i class="fa-solid fa-camera"></i> Tomar Foto
            <input type="file" id="flash-photo-camera" accept="image/*" capture="environment" style="display: none;">
          </label>
          <label class="btn btn--secondary btn-full" style="cursor: pointer; margin: 0;">
            <i class="fa-solid fa-image"></i> Galería
            <input type="file" id="flash-photo-gallery" accept="image/*" style="display: none;">
          </label>
        </div>
      </div>

      <div style="text-align: left; max-height: 300px; overflow-y: auto; margin-bottom: 1.5rem;">
        <h4 style="color: var(--text-muted); margin-bottom: 0.5rem;">Historial y Enlaces Beelup</h4>
        ${flashState.matchHistory.map((m, i) => `
          <div style="background: rgba(0,0,0,0.2); padding: 0.75rem 1rem; border-radius: 8px; margin-bottom: 0.5rem;">
            <div style="display: flex; justify-content: space-between; font-size: 0.9rem; margin-bottom: 0.5rem;">
              <span><strong>${i+1}.</strong> ${m.team1} ${m.score1} - ${m.score2} ${m.team2}</span>
              <span style="color: var(--accent-primary); font-size: 0.8rem;">Ganó ${m.winner}</span>
            </div>
            ${m.events.map(ev => `
              <div style="display: flex; gap: 0.5rem; align-items: center; margin-bottom: 0.25rem;">
                <span style="font-size: 0.75rem; color: var(--text-muted); min-width: 60px;">${new Date(ev.timestamp).toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' })}</span>
                <span style="font-size: 0.8rem; flex: 1;">${ev.playerName}</span>
                <input type="text" class="form-control" style="padding: 0.2rem 0.5rem; font-size: 0.75rem; max-width: 150px;" placeholder="Link Beelup" oninput="window.setBeelupUrl('${m.id}', '${ev.id}', this.value)" value="${ev.beelupUrl || ''}" />
              </div>
            `).join('')}
          </div>
        `).join('')}
      </div>

      <div class="modal-actions">
        <button onclick="window.discardFlash()" class="btn btn--secondary btn-full">Descartar</button>
        <button onclick="window.saveFlashAndExit()" class="btn btn--primary btn-full"><i class="fa-solid fa-floppy-disk"></i> Guardar y Compartir</button>
      </div>
    </article>
  `;

  // Lógica de la foto
  const photoPreview = document.getElementById('flash-photo-preview');
  let photoBase64 = null;

  const handlePhotoSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        photoBase64 = ev.target.result;
        photoPreview.innerHTML = `<img src="${photoBase64}" style="width: 100%; height: 100%; object-fit: cover;">`;
        flashState.sessionPhoto = photoBase64; // Guardamos en el estado temporal
      };
      reader.readAsDataURL(file);
    }
  };

  // Listeners para ambos inputs
  document.getElementById('flash-photo-camera').onchange = handlePhotoSelect;
  document.getElementById('flash-photo-gallery').onchange = handlePhotoSelect;
  
  // Si hacen clic en la caja grande, por defecto abrimos la cámara
  photoPreview.onclick = () => document.getElementById('flash-photo-camera').click();
}
window.saveFlashAndExit = () => {
  const sessionId = `flash_sess_${Date.now()}`;
  const sessionData = {
    id: sessionId,
    date: new Date().toISOString(),
    matchHistory: flashState.matchHistory
  };

  // Guardar estadísticas en el historial normal
  mergeFlashSession(sessionData);

  // Guardar foto en un localStorage aparte (imágenes pesan mucho)
  if (flashState.sessionPhoto) {
    let photos = JSON.parse(localStorage.getItem('caimanada_flash_photos') || '{}');
    photos[sessionId] = flashState.sessionPhoto;
    localStorage.setItem('caimanada_flash_photos', JSON.stringify(photos));
  }

  AlertService.showSuccess('Sesión guardada en tu historial.', '¡GUARDADO!');
  
  // Generar URL para compartir (SIN la foto, solo datos)
  const compressed = LZString.compressToEncodedURIComponent(JSON.stringify(sessionData));
  const shareUrl = `${window.location.origin}${window.location.pathname}#flash?data=${compressed}`;
  
   navigator.clipboard.writeText(shareUrl).then(() => {
    document.getElementById('dynamic-share-url-modal')?.remove();
    document.body.insertAdjacentHTML('beforeend', `
      <div id="dynamic-share-url-modal" class="modal-overlay">
        <div class="modal-card modal-card--form" style="text-align: center;">
          <h2 class="modal-card__title"><i class="fa-solid fa-link"></i> Enlace Copiado</h2>
          <p class="modal-subtitle">El enlace de estadísticas está en tu portapapeles. ¡Pégalo en tu grupo de WhatsApp!</p>
          <div class="modal-actions">
            <button id="close-share-modal-btn" class="btn btn--primary btn-full">Ir al Dashboard</button>
          </div>
        </div>
      </div>
    `);
    
    // LÓGICA DE CIERRE CORREGIDA
    const modalEl = document.getElementById('dynamic-share-url-modal');
    const closeBtn = document.getElementById('close-share-modal-btn');
    
    if (closeBtn) {
      closeBtn.onclick = () => {
        modalEl.remove(); // 1. Borra el modal de la pantalla
        window.resetFlash(); // 2. Limpia la sesión flash
        window.location.hash = '#dashboard'; // 3. Te manda al inicio
      };
    }
    
    // Si hacen clic fuera del modal, también se cierra
    if (modalEl) {
      modalEl.onclick = (e) => { 
        if (e.target === modalEl) {
          modalEl.remove();
          window.resetFlash();
          window.location.hash = '#dashboard';
        } 
      };
    }
  }).catch(() => AlertService.showError('No se pudo copiar el enlace'));
};

function mergeFlashSession(incomingSession) {
  let history = JSON.parse(localStorage.getItem('caimanada_flash_history') || '[]');
  const existingIdx = history.findIndex(s => s.id === incomingSession.id);
  
  if (existingIdx === -1) {
    history.unshift(incomingSession);
  } else {
    // MERGE: Combinar los links de Beelup
    const local = history[existingIdx];
    incomingSession.matchHistory.forEach((incMatch, i) => {
      if (local.matchHistory[i] && local.matchHistory[i].id === incMatch.id) {
        incMatch.events.forEach((incEv, j) => {
          if (local.matchHistory[i].events[j] && local.matchHistory[i].events[j].id === incEv.id) {
            if (incEv.beelupUrl && !local.matchHistory[i].events[j].beelupUrl) {
              local.matchHistory[i].events[j].beelupUrl = incEv.beelupUrl;
            }
          }
        });
      }
    });
    history[existingIdx] = local;
  }
  localStorage.setItem('caimanada_flash_history', JSON.stringify(history.slice(0, 5)));
}

window.discardFlash = () => { window.resetFlash(); window.location.hash = '#dashboard'; };
window.resetFlash = () => { flashState = { teams: [], queue: [], currentMatch: null, matchHistory: [], timerInterval: null, config: { timeLimit: 0 } }; renderFlashView(); };