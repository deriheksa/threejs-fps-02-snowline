// SNOWLINE — the field console (F key): MAP & MISSION, ARSENAL, SETTINGS,
// CONTROLS and SQUAD tabs, plus the player silhouette widget.
// Everything here is DOM; the 3D HUD lives in view.js.
import { weapons, sites, walls } from './state.js';

// Build the console once and return an API: open/close and per-frame refresh.
export function fieldConsole(s, prefs, onBuy, onStart, onClose) {
  const root = document.createElement('div');
  root.className = 'field-console hidden';
  root.innerHTML = `
    <div class="fc-header">
      <div class="fc-title">SNOWLINE · FIELD CONSOLE</div>
      <button class="fc-close" data-action="close">✕</button>
    </div>
    <div class="fc-tabs">
      <button data-tab="map" class="active">MAP & MISSION</button>
      <button data-tab="arsenal">ARSENAL</button>
      <button data-tab="settings">SETTINGS</button>
      <button data-tab="controls">CONTROLS</button>
      <button data-tab="squad">SQUAD 5v5</button>
    </div>
    <div class="fc-body">
      <div class="fc-panel" data-panel="map">
        <div class="fc-map"></div>
        <div class="fc-mission">OBJECTIVE: Plant the charge at A or B. First to 7 wins the match.</div>
        <div class="fc-rotate">ROTATE MAP <input type="range" min="-180" max="180" value="0" data-rotate></div>
      </div>
      <div class="fc-panel hidden" data-panel="arsenal">
        ${weapons.map((w, i) => `
          <div class="fc-weapon" data-weapon="${i}">
            <span>${w.name}</span><span>$${w.price}</span>
            <span>DMG ${w.dmg} · RPM ${w.rpm} · MAG ${w.mag}</span>
            <button data-buy="${i}">BUY</button>
          </div>`).join('')}
        <div class="fc-gear">
          <button data-buy="frag">FRAG $300</button>
          <button data-buy="smoke">SMOKE $300</button>
          <button data-buy="flash">FLASH $200</button>
          <button data-buy="vest">VEST $650</button>
          <button data-buy="helmet">HELMET $1000</button>
          <button data-buy="kit">KIT $400</button>
        </div>
      </div>
      <div class="fc-panel hidden" data-panel="settings">
        <label>SENSITIVITY <input type="range" min="0.2" max="3" step="0.1" value="${prefs.sensitivity}" data-pref="sensitivity"></label>
        <label>FOV <input type="range" min="60" max="100" step="1" value="${prefs.fov}" data-pref="fov"></label>
        <label>VOLUME <input type="range" min="0" max="1" step="0.1" value="${prefs.volume}" data-pref="volume"></label>
        <label>SNOW <input type="checkbox" ${prefs.snow ? 'checked' : ''} data-pref="snow"></label>
        <label>NORTH-UP RADAR <input type="checkbox" ${prefs.radarUp ? 'checked' : ''} data-pref="radarUp"></label>
        <label>INVERT Y <input type="checkbox" ${prefs.invert ? 'checked' : ''} data-pref="invert"></label>
      </div>
      <div class="fc-panel hidden" data-panel="controls">
        <div>WASD MOVE · SHIFT SPRINT · C CROUCH · SPACE JUMP</div>
        <div>MOUSE AIM · CLICK FIRE · RIGHT-CLICK AIM · R RELOAD</div>
        <div>E PLANT/DEFUSE · B / TAB BUY · F CONSOLE · P PAUSE · C CAMERA</div>
        <div>1-5 WEAPONS · 6 FRAG · 7 SMOKE · 8 FLASH · G FRAG · Q FLASH · V SMOKE</div>
      </div>
      <div class="fc-panel hidden" data-panel="squad"></div>
    </div>
    <div class="fc-footer">
      <button class="fc-start" data-action="start">DEPLOY</button>
    </div>`;
  document.body.appendChild(root);

  let open = false;
  let rotate = 0;
  const mapCanvas = root.querySelector('.fc-map');
  const map = document.createElement('canvas');
  map.width = 300; map.height = 240;
  mapCanvas.appendChild(map);

  function drawMap() {
    const ctx = map.getContext('2d');
    ctx.clearRect(0, 0, 300, 240);
    ctx.save();
    ctx.translate(150, 120);
    ctx.rotate((rotate * Math.PI) / 180);
    ctx.scale(6, 6);
    ctx.strokeStyle = 'rgba(160, 220, 255, 0.7)';
    ctx.lineWidth = 0.5;
    for (const [x, z, w, d] of walls) ctx.strokeRect(x - w / 2, z - d / 2, w, d);
    ctx.fillStyle = '#ffd34d';
    ctx.font = 'bold 3px monospace';
    ctx.textAlign = 'center';
    for (const site of sites) ctx.fillText(site.name[0], site.x, site.z);
    ctx.fillStyle = '#5fb7e8';
    for (const a of s.actors) {
      if (!a.alive) continue;
      ctx.beginPath();
      ctx.arc(a.x, a.z, 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  function refresh() {
    if (!open) return;
    drawMap();
    const squad = root.querySelector('[data-panel="squad"]');
    squad.innerHTML = s.actors.map((a) => `
      <div class="fc-soldier ${a.alive ? '' : 'dead'}">
        <span>${a.name}</span><span>${a.team === 0 ? 'SUMMIT' : 'VALE'}</span>
        <span>${a.hp} HP</span><span>${a.kills}K / ${a.deaths}D</span>
        <span>$${a.money}</span>
      </div>`).join('');
  }

  root.addEventListener('click', (e) => {
    const tab = e.target.closest('[data-tab]');
    if (tab) {
      root.querySelectorAll('[data-tab]').forEach((b) => b.classList.toggle('active', b === tab));
      root.querySelectorAll('[data-panel]').forEach((p) =>
        p.classList.toggle('hidden', p.dataset.panel !== tab.dataset.tab));
      return;
    }
    const buyBtn = e.target.closest('[data-buy]');
    if (buyBtn) { onBuy(buyBtn.dataset.buy); return; }
    const action = e.target.closest('[data-action]');
    if (!action) return;
    if (action.dataset.action === 'close') onClose();
    if (action.dataset.action === 'start') onStart();
  });
  root.addEventListener('input', (e) => {
    if (e.target.dataset.rotate !== undefined) rotate = Number(e.target.value);
    if (e.target.dataset.pref) {
      const key = e.target.dataset.pref;
      prefs[key] = e.target.type === 'checkbox' ? e.target.checked : Number(e.target.value);
    }
  });

  return {
    open() { open = true; root.classList.remove('hidden'); refresh(); },
    close() { open = false; root.classList.add('hidden'); },
    isOpen: () => open,
    refresh,
    setRotate(v) { rotate = v; },
  };
}

// A small canvas silhouette of the player: body, head, weapon and the
// current health/armour bars underneath.
export function silhouette(canvas, a) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = a.team === 0 ? '#5fb7e8' : '#ff5a5a';
  ctx.fillRect(40, 20, 20, 50); // torso
  ctx.fillRect(42, 8, 16, 14); // head
  ctx.fillRect(30, 25, 10, 30); // left arm
  ctx.fillRect(60, 25, 10, 30); // right arm
  ctx.fillRect(42, 70, 8, 30); // left leg
  ctx.fillRect(50, 70, 8, 30); // right leg
  ctx.fillStyle = '#222';
  ctx.fillRect(60, 40, 30, 5); // weapon
  ctx.fillStyle = '#333';
  ctx.fillRect(10, 110, 80, 6);
  ctx.fillStyle = a.hp > 50 ? '#4caf50' : a.hp > 25 ? '#ff9800' : '#f44336';
  ctx.fillRect(10, 110, 80 * Math.max(0, a.hp / 100), 6);
  ctx.fillStyle = '#333';
  ctx.fillRect(10, 120, 80, 4);
  ctx.fillStyle = '#2196f3';
  ctx.fillRect(10, 120, 80 * Math.max(0, a.armor / 100), 4);
}
