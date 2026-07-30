/* ==========================================================
   NEON CITY RUNNER
   A vanilla JS + Canvas endless runner.
   Organized into clearly separated modules:
   Storage, Audio, Input, Particles, Player, Obstacles,
   Coins, PowerUps, Background, UI, Game (state machine + loop)
   ========================================================== */

'use strict';

/* ============================================================
   1. STORAGE  (localStorage wrapper)
   ============================================================ */
const Storage = {
  KEYS: { HIGH_SCORE: 'ncr_high_score', SETTINGS: 'ncr_settings' },

  getHighScore() {
    const v = localStorage.getItem(this.KEYS.HIGH_SCORE);
    return v ? parseInt(v, 10) : 0;
  },

  setHighScore(value) {
    localStorage.setItem(this.KEYS.HIGH_SCORE, String(value));
  },

  resetHighScore() {
    localStorage.setItem(this.KEYS.HIGH_SCORE, '0');
  },

  getSettings() {
    const defaults = { sound: true, music: true, reducedEffects: false };
    try {
      const raw = localStorage.getItem(this.KEYS.SETTINGS);
      if (!raw) return defaults;
      return Object.assign(defaults, JSON.parse(raw));
    } catch (e) {
      return defaults;
    }
  },

  setSettings(settings) {
    localStorage.setItem(this.KEYS.SETTINGS, JSON.stringify(settings));
  }
};

/* ============================================================
   2. AUDIO MANAGER  (Web Audio API synthesized SFX + music)
   ============================================================ */
class AudioManager {
  constructor() {
    this.ctx = null;
    this.settings = Storage.getSettings();
    this.musicNodes = null;
    this.musicPlaying = false;
  }

  // Lazily create the AudioContext on first user gesture (required by browsers)
  ensureContext() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
  }

  setSoundEnabled(v) { this.settings.sound = v; }
  setMusicEnabled(v) {
    this.settings.music = v;
    if (!v) this.stopMusic();
    else if (this.musicPlaying === false) this.startMusic();
  }

  // Generic tone/beep generator
  _tone({ freq = 440, duration = 0.15, type = 'sine', gain = 0.2, slideTo = null, delay = 0 }) {
    if (!this.settings.sound || !this.ctx) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, t0 + duration);
    g.gain.setValueAtTime(gain, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
    osc.connect(g).connect(this.ctx.destination);
    osc.start(t0);
    osc.stop(t0 + duration + 0.02);
  }

  playJump() {
    this.ensureContext();
    this._tone({ freq: 330, slideTo: 660, duration: 0.18, type: 'square', gain: 0.15 });
  }

  playCoin() {
    this.ensureContext();
    this._tone({ freq: 880, slideTo: 1320, duration: 0.12, type: 'triangle', gain: 0.18 });
  }

  playPowerUp() {
    this.ensureContext();
    this._tone({ freq: 440, slideTo: 880, duration: 0.25, type: 'sawtooth', gain: 0.12 });
    this._tone({ freq: 660, slideTo: 1320, duration: 0.25, type: 'sine', gain: 0.1, delay: 0.08 });
  }

  playHit() {
    this.ensureContext();
    this._tone({ freq: 180, slideTo: 60, duration: 0.3, type: 'sawtooth', gain: 0.25 });
  }

  playGameOver() {
    this.ensureContext();
    this._tone({ freq: 300, slideTo: 80, duration: 0.6, type: 'sawtooth', gain: 0.2 });
    this._tone({ freq: 200, slideTo: 50, duration: 0.8, type: 'sine', gain: 0.15, delay: 0.15 });
  }

  playClick() {
    this.ensureContext();
    this._tone({ freq: 520, duration: 0.08, type: 'square', gain: 0.1 });
  }

  // Simple ambient arpeggio loop for "music"
  startMusic() {
    this.ensureContext();
    if (!this.settings.music || this.musicPlaying) return;
    this.musicPlaying = true;
    const notes = [130.81, 155.56, 196.0, 174.61, 130.81, 155.56, 233.08, 196.0];
    let i = 0;
    this._musicTimer = setInterval(() => {
      if (!this.musicPlaying || !this.settings.music) return;
      const n = notes[i % notes.length];
      this._tone({ freq: n, duration: 0.5, type: 'sine', gain: 0.045 });
      this._tone({ freq: n * 2, duration: 0.4, type: 'triangle', gain: 0.02 });
      i++;
    }, 430);
  }

  stopMusic() {
    this.musicPlaying = false;
    if (this._musicTimer) clearInterval(this._musicTimer);
  }
}

/* ============================================================
   3. INPUT MANAGER
   ============================================================ */
class InputManager {
  constructor() {
    this.keys = {};
    this.onJump = null;
    this.onSlideStart = null;
    this.onSlideEnd = null;
    this.onPauseToggle = null;
    this.onMuteToggle = null;

    window.addEventListener('keydown', (e) => this._handleKeyDown(e));
    window.addEventListener('keyup', (e) => this._handleKeyUp(e));
  }

  _handleKeyDown(e) {
    const code = e.code;
    if (['Space', 'ArrowUp', 'ArrowDown'].includes(code)) e.preventDefault();
    if (this.keys[code]) return; // ignore auto-repeat
    this.keys[code] = true;

    if ((code === 'Space' || code === 'ArrowUp') && this.onJump) this.onJump();
    if (code === 'ArrowDown' && this.onSlideStart) this.onSlideStart();
    if (code === 'KeyP' && this.onPauseToggle) this.onPauseToggle();
    if (code === 'KeyM' && this.onMuteToggle) this.onMuteToggle();
  }

  _handleKeyUp(e) {
    const code = e.code;
    this.keys[code] = false;
    if (code === 'ArrowDown' && this.onSlideEnd) this.onSlideEnd();
  }

  bindTouchButton(el, onStart, onEnd) {
    if (!el) return;
    const start = (e) => { e.preventDefault(); onStart && onStart(); };
    const end = (e) => { e.preventDefault(); onEnd && onEnd(); };
    el.addEventListener('touchstart', start, { passive: false });
    el.addEventListener('touchend', end, { passive: false });
    el.addEventListener('mousedown', start);
    el.addEventListener('mouseup', end);
    el.addEventListener('mouseleave', end);
  }
}

/* ============================================================
   4. PARTICLE SYSTEM
   ============================================================ */
class Particle {
  constructor(x, y, color, opts = {}) {
    this.x = x; this.y = y;
    this.vx = opts.vx !== undefined ? opts.vx : (Math.random() - 0.5) * 4;
    this.vy = opts.vy !== undefined ? opts.vy : (Math.random() - 0.5) * 4 - 1;
    this.life = opts.life || 0.6;
    this.maxLife = this.life;
    this.color = color;
    this.size = opts.size || (2 + Math.random() * 3);
    this.gravity = opts.gravity !== undefined ? opts.gravity : 0.08;
  }

  update(dt) {
    this.x += this.vx * dt * 60;
    this.y += this.vy * dt * 60;
    this.vy += this.gravity * dt * 60;
    this.life -= dt;
    return this.life > 0;
  }

  draw(ctx) {
    const alpha = Math.max(0, this.life / this.maxLife);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * alpha + 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class ParticleSystem {
  constructor() { this.particles = []; }

  burst(x, y, color, count = 12, opts = {}) {
    for (let i = 0; i < count; i++) this.particles.push(new Particle(x, y, color, opts));
  }

  update(dt) {
    this.particles = this.particles.filter((p) => p.update(dt));
  }

  draw(ctx) {
    for (const p of this.particles) p.draw(ctx);
  }

  clear() { this.particles = []; }
}

/* ============================================================
   5. CONSTANTS
   ============================================================ */
const GROUND_Y_RATIO = 0.78;      // ground line as a fraction of canvas height
const GRAVITY = 2200;             // px/s^2
const JUMP_VELOCITY = -900;       // px/s
const BASE_SPEED = 320;           // px/s
const MAX_SPEED = 780;
const PLAYER_X_RATIO = 0.18;

const COLORS = {
  cyan: '#00f0ff',
  purple: '#b026ff',
  pink: '#ff2d95',
  yellow: '#ffe94d',
  green: '#39ff88'
};

/* ============================================================
   6. PLAYER
   ============================================================ */
class Player {
  constructor(game) {
    this.game = game;
    this.width = 46;
    this.height = 64;
    this.slideHeight = 34;
    this.x = 0;
    this.y = 0;
    this.vy = 0;
    this.state = 'run'; // run | jump | slide | hit
    this.onGround = true;
    this.animTimer = 0;
    this.hitFlashTimer = 0;
    this.invulnerable = 0;
    this.shieldActive = false;
  }

  reset(groundY) {
    this.width = 46;
    this.height = 64;
    this.y = groundY - this.height;
    this.vy = 0;
    this.state = 'run';
    this.onGround = true;
    this.animTimer = 0;
    this.hitFlashTimer = 0;
    this.invulnerable = 0;
    this.shieldActive = false;
  }

  getCurrentHeight() { return this.state === 'slide' ? this.slideHeight : this.height; }

  jump() {
    if (this.onGround && this.state !== 'slide') {
      this.vy = JUMP_VELOCITY;
      this.onGround = false;
      this.state = 'jump';
      this.game.audio.playJump();
    }
  }

  startSlide() {
    if (this.onGround) this.state = 'slide';
  }

  endSlide() {
    if (this.state === 'slide') this.state = this.onGround ? 'run' : 'jump';
  }

  hit() {
    if (this.invulnerable > 0) return false;
    if (this.shieldActive) {
      this.shieldActive = false;
      this.game.audio.playPowerUp();
      return false; // absorbed, no life lost
    }
    this.hitFlashTimer = 0.6;
    this.invulnerable = 1.4;
    this.game.audio.playHit();
    return true; // real hit
  }

  update(dt, groundY) {
    // physics
    if (!this.onGround || this.vy !== 0) {
      this.vy += GRAVITY * dt;
      this.y += this.vy * dt;
      if (this.y + this.getCurrentHeight() >= groundY) {
        this.y = groundY - this.getCurrentHeight();
        this.vy = 0;
        this.onGround = true;
        if (this.state === 'jump') this.state = 'run';
      } else {
        this.onGround = false;
      }
    } else {
      this.y = groundY - this.getCurrentHeight();
    }

    if (this.hitFlashTimer > 0) this.hitFlashTimer -= dt;
    if (this.invulnerable > 0) this.invulnerable -= dt;

    this.animTimer += dt * (this.game.difficultySpeedMultiplier || 1);
  }

  getHitbox() {
    const h = this.getCurrentHeight();
    return { x: this.x + 8, y: this.y + 4, w: this.width - 16, h: h - 6 };
  }

  draw(ctx) {
    const cx = this.x + this.width / 2;
    const h = this.getCurrentHeight();
    const cy = this.y + h / 2;
    const blinking = this.invulnerable > 0 && Math.floor(this.invulnerable * 12) % 2 === 0;

    ctx.save();
    if (blinking) ctx.globalAlpha = 0.4;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.35 * (ctx.globalAlpha);
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, this.game.groundY + 6, this.width * 0.45, 7, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // shield bubble
    if (this.shieldActive) {
      ctx.save();
      ctx.strokeStyle = COLORS.cyan;
      ctx.lineWidth = 3;
      ctx.shadowColor = COLORS.cyan;
      ctx.shadowBlur = 20;
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(cx, cy, Math.max(this.width, h) * 0.72, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    const glowColor = this.state === 'hit' || blinking ? COLORS.pink : COLORS.cyan;
    ctx.shadowColor = glowColor;
    ctx.shadowBlur = 18;

    const legPhase = Math.sin(this.animTimer * 14);

    if (this.state === 'slide') {
      // sliding pose: low, elongated body
      ctx.fillStyle = '#131a2b';
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.5;
      this._roundRect(ctx, this.x, this.y + h * 0.15, this.width + 16, h * 0.85, 10);
      ctx.fill(); ctx.stroke();
      // visor
      ctx.fillStyle = glowColor;
      ctx.fillRect(this.x + this.width - 6, this.y + h * 0.3, 10, 6);
    } else {
      // body torso
      ctx.fillStyle = '#131a2b';
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 2.5;
      this._roundRect(ctx, this.x + 8, this.y + 10, this.width - 16, h - 26, 8);
      ctx.fill(); ctx.stroke();

      // head
      ctx.beginPath();
      ctx.fillStyle = '#1c2440';
      ctx.arc(cx, this.y + 8, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      // visor
      ctx.fillStyle = glowColor;
      ctx.fillRect(cx - 6, this.y + 4, 12, 5);

      // legs (animated)
      ctx.strokeStyle = glowColor;
      ctx.lineWidth = 5;
      ctx.lineCap = 'round';
      const legSwing = this.state === 'run' ? legPhase * 14 : 0;
      ctx.beginPath();
      ctx.moveTo(this.x + 14, this.y + h - 16);
      ctx.lineTo(this.x + 14 + legSwing, this.y + h);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x + this.width - 14, this.y + h - 16);
      ctx.lineTo(this.x + this.width - 14 - legSwing, this.y + h);
      ctx.stroke();

      // arms
      const armSwing = this.state === 'run' ? -legPhase * 10 : (this.state === 'jump' ? -8 : 0);
      ctx.beginPath();
      ctx.moveTo(this.x + 10, this.y + 20);
      ctx.lineTo(this.x + 10 + armSwing, this.y + 40);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x + this.width - 10, this.y + 20);
      ctx.lineTo(this.x + this.width - 10 - armSwing, this.y + 40);
      ctx.stroke();
    }

    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/* ============================================================
   7. OBSTACLES
   ============================================================ */
const OBSTACLE_TYPES = ['ground', 'flying', 'tall', 'moving'];

class Obstacle {
  constructor(type, x, groundY, canvasHeight) {
    this.type = type;
    this.x = x;
    this.passed = false;
    this.moveTimer = Math.random() * Math.PI * 2;

    switch (type) {
      case 'ground':
        this.width = 34; this.height = 44;
        this.y = groundY - this.height;
        break;
      case 'tall':
        this.width = 30; this.height = 78;
        this.y = groundY - this.height;
        break;
      case 'flying':
        this.width = 46; this.height = 30;
        this.y = groundY - 100; // requires slide
        break;
      case 'moving':
        this.width = 38; this.height = 34;
        this.baseY = groundY - 90;
        this.y = this.baseY;
        break;
    }
  }

  update(dt, speed) {
    this.x -= speed * dt;
    if (this.type === 'moving') {
      this.moveTimer += dt * 3;
      this.y = this.baseY + Math.sin(this.moveTimer) * 55;
    }
  }

  getHitbox() {
    return { x: this.x + 4, y: this.y + 4, w: this.width - 8, h: this.height - 8 };
  }

  draw(ctx) {
    ctx.save();
    let color = COLORS.pink;
    if (this.type === 'flying') color = COLORS.purple;
    if (this.type === 'tall') color = COLORS.cyan;
    if (this.type === 'moving') color = COLORS.yellow;

    ctx.shadowColor = color;
    ctx.shadowBlur = 16;
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
    ctx.fillStyle = 'rgba(10,4,20,0.85)';

    if (this.type === 'ground') {
      ctx.beginPath();
      ctx.moveTo(this.x, this.y + this.height);
      ctx.lineTo(this.x + this.width / 2, this.y);
      ctx.lineTo(this.x + this.width, this.y + this.height);
      ctx.closePath();
      ctx.fill(); ctx.stroke();
    } else if (this.type === 'tall') {
      ctx.fillRect(this.x, this.y, this.width, this.height);
      ctx.strokeRect(this.x, this.y, this.width, this.height);
      // warning stripes
      ctx.fillStyle = color;
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(this.x + 3, this.y + 10 + i * 22, this.width - 6, 4);
      }
    } else if (this.type === 'flying') {
      this._roundRect(ctx, this.x, this.y, this.width, this.height, 8);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x - 6, this.y + this.height / 2);
      ctx.lineTo(this.x, this.y + 4);
      ctx.lineTo(this.x, this.y + this.height - 4);
      ctx.closePath();
      ctx.fillStyle = color;
      ctx.fill();
    } else if (this.type === 'moving') {
      ctx.beginPath();
      ctx.arc(this.x + this.width / 2, this.y + this.height / 2, this.width / 2, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(this.x + this.width / 2 - 6, this.y + this.height / 2);
      ctx.lineTo(this.x + this.width / 2 + 6, this.y + this.height / 2);
      ctx.moveTo(this.x + this.width / 2, this.y + this.height / 2 - 6);
      ctx.lineTo(this.x + this.width / 2, this.y + this.height / 2 + 6);
      ctx.strokeStyle = '#1a1030';
      ctx.stroke();
    }
    ctx.restore();
  }

  _roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
}

/* ============================================================
   8. COINS  (spawned in patterns)
   ============================================================ */
class Coin {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.radius = 11;
    this.collected = false;
    this.spin = Math.random() * Math.PI * 2;
    this.bob = Math.random() * Math.PI * 2;
    this.baseY = y;
  }

  update(dt, speed) {
    this.x -= speed * dt;
    this.spin += dt * 6;
    this.bob += dt * 3;
    this.y = this.baseY + Math.sin(this.bob) * 4;
  }

  getHitbox() {
    return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
  }

  draw(ctx) {
    const squish = Math.abs(Math.cos(this.spin));
    ctx.save();
    ctx.translate(this.x, this.y);
    ctx.scale(Math.max(0.15, squish), 1);
    ctx.shadowColor = COLORS.yellow;
    ctx.shadowBlur = 16;
    ctx.fillStyle = COLORS.yellow;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a5b00';
    ctx.font = 'bold 12px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('$', 0, 1);
    ctx.restore();
  }
}

// Generates a set of coins in an interesting arrangement
function generateCoinPattern(startX, groundY) {
  const patterns = ['line', 'arc', 'wave', 'stairs'];
  const pattern = patterns[Math.floor(Math.random() * patterns.length)];
  const coins = [];
  const count = 5 + Math.floor(Math.random() * 4);
  const spacing = 44;
  const midY = groundY - 90;

  for (let i = 0; i < count; i++) {
    let x = startX + i * spacing;
    let y = midY;
    switch (pattern) {
      case 'line':
        y = midY;
        break;
      case 'arc':
        y = midY - Math.sin((i / (count - 1)) * Math.PI) * 70;
        break;
      case 'wave':
        y = midY + Math.sin(i * 0.9) * 40;
        break;
      case 'stairs':
        y = groundY - 40 - (i % 5) * 22;
        break;
    }
    coins.push(new Coin(x, y));
  }
  return coins;
}

/* ============================================================
   9. POWER-UPS
   ============================================================ */
const POWERUP_TYPES = ['shield', 'magnet', 'speed'];

class PowerUp {
  constructor(type, x, groundY) {
    this.type = type;
    this.x = x;
    this.y = groundY - 110 - Math.random() * 40;
    this.radius = 16;
    this.spin = 0;
    this.collected = false;
  }

  update(dt, speed) {
    this.x -= speed * dt;
    this.spin += dt * 3;
  }

  getHitbox() {
    return { x: this.x - this.radius, y: this.y - this.radius, w: this.radius * 2, h: this.radius * 2 };
  }

  draw(ctx) {
    const colorMap = { shield: COLORS.cyan, magnet: COLORS.purple, speed: COLORS.pink };
    const color = colorMap[this.type];
    ctx.save();
    ctx.translate(this.x, this.y + Math.sin(this.spin * 2) * 5);
    ctx.shadowColor = color;
    ctx.shadowBlur = 22;
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.fillStyle = 'rgba(10,4,20,0.8)';
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = 'bold 14px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const glyph = this.type === 'shield' ? '\u2660' : this.type === 'magnet' ? 'U' : '\u26A1';
    ctx.fillText(glyph, 0, 1);
    ctx.restore();
  }
}

/* ============================================================
   10. PARALLAX BACKGROUND
   ============================================================ */
class Background {
  constructor() {
    this.stars = [];
    this.buildings = [];
    this.signs = [];
    this.initialized = false;
  }

  init(width, height, groundY) {
    this.stars = Array.from({ length: 70 }, () => ({
      x: Math.random() * width,
      y: Math.random() * groundY * 0.7,
      r: Math.random() * 1.6 + 0.4,
      tw: Math.random() * Math.PI * 2
    }));

    this.buildings = [];
    let bx = 0;
    while (bx < width + 200) {
      const w = 60 + Math.random() * 90;
      const h = 80 + Math.random() * (groundY * 0.55);
      this.buildings.push({
        x: bx, w, h,
        color: [COLORS.purple, COLORS.cyan, COLORS.pink][Math.floor(Math.random() * 3)],
        windows: Math.floor(Math.random() * 20) + 8
      });
      bx += w + 10;
    }

    this.signs = [];
    let sx = 100;
    while (sx < width + 400) {
      this.signs.push({
        x: sx,
        y: groundY - 140 - Math.random() * 120,
        w: 50 + Math.random() * 40,
        h: 16 + Math.random() * 10,
        color: [COLORS.cyan, COLORS.pink, COLORS.purple][Math.floor(Math.random() * 3)]
      });
      sx += 250 + Math.random() * 200;
    }

    this.initialized = true;
    this.width = width;
    this.height = height;
    this.groundY = groundY;
    this.scrollFar = 0;
    this.scrollMid = 0;
    this.scrollNear = 0;
    this.moonX = width * 0.78;
  }

  update(dt, speed, width) {
    this.scrollFar = (this.scrollFar + speed * 0.15 * dt) % (width + 400);
    this.scrollMid = (this.scrollMid + speed * 0.35 * dt) % (width + 400);
    this.scrollNear = (this.scrollNear + speed * 0.9 * dt) % 60;
  }

  draw(ctx, width, height, groundY, reduced) {
    // sky gradient
    const grad = ctx.createLinearGradient(0, 0, 0, groundY);
    grad.addColorStop(0, '#0a0322');
    grad.addColorStop(0.6, '#1a0838');
    grad.addColorStop(1, '#2b0a3d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, width, groundY);

    // stars
    if (!reduced) {
      for (const s of this.stars) {
        const alpha = 0.5 + Math.sin(s.tw + Date.now() * 0.002) * 0.5;
        ctx.fillStyle = `rgba(255,255,255,${alpha})`;
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // moon
    ctx.save();
    ctx.fillStyle = '#eafcff';
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = reduced ? 10 : 30;
    ctx.beginPath();
    ctx.arc(this.moonX, groundY * 0.22, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // far buildings (parallax)
    for (const b of this.buildings) {
      const drawX = ((b.x - this.scrollFar) % (width + 400)) - 200;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = 'rgba(10,4,25,0.9)';
      ctx.strokeStyle = b.color;
      ctx.lineWidth = 1.2;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = reduced ? 4 : 12;
      const bh = b.h;
      ctx.fillRect(drawX, groundY - bh, b.w, bh);
      ctx.strokeRect(drawX, groundY - bh, b.w, bh);
      if (!reduced) {
        ctx.fillStyle = b.color;
        const cols = 3, rows = Math.min(10, Math.floor(bh / 18));
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            if (Math.random() > 0.55) continue;
            ctx.globalAlpha = 0.5;
            ctx.fillRect(drawX + 8 + c * (b.w - 16) / cols, groundY - bh + 10 + r * 16, 4, 6);
          }
        }
      }
      ctx.restore();
    }

    // neon signs
    for (const s of this.signs) {
      const drawX = ((s.x - this.scrollMid) % (width + 400)) - 200;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.fillStyle = s.color;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = reduced ? 6 : 18;
      ctx.globalAlpha = 0.9;
      ctx.fillRect(drawX, s.y, s.w, s.h * 0.3);
      ctx.strokeRect(drawX, s.y, s.w, s.h * 0.3);
      ctx.restore();
    }

    // road
    const roadGrad = ctx.createLinearGradient(0, groundY, 0, height);
    roadGrad.addColorStop(0, '#170a2b');
    roadGrad.addColorStop(1, '#05010f');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, groundY, width, height - groundY);

    // road neon edge
    ctx.save();
    ctx.strokeStyle = COLORS.cyan;
    ctx.shadowColor = COLORS.cyan;
    ctx.shadowBlur = reduced ? 5 : 14;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, groundY);
    ctx.lineTo(width, groundY);
    ctx.stroke();
    ctx.restore();

    // lane dashes (near, fast scroll)
    ctx.save();
    ctx.strokeStyle = 'rgba(255,45,149,0.55)';
    ctx.lineWidth = 4;
    ctx.setLineDash([30, 26]);
    ctx.lineDashOffset = -this.scrollNear * 4;
    ctx.beginPath();
    ctx.moveTo(0, groundY + (height - groundY) * 0.45);
    ctx.lineTo(width, groundY + (height - groundY) * 0.45);
    ctx.stroke();
    ctx.restore();
  }
}

/* ============================================================
   11. UI HELPER  (DOM updates, only touch DOM when values change)
   ============================================================ */
class UI {
  constructor() {
    this.els = {
      score: document.getElementById('hud-score'),
      coins: document.getElementById('hud-coins'),
      best: document.getElementById('hud-best'),
      speed: document.getElementById('hud-speed'),
      powerup: document.getElementById('hud-powerup'),
      lives: document.getElementById('hud-lives'),
      hud: document.getElementById('hud'),
      menuHighScore: document.getElementById('menu-high-score'),
      goScore: document.getElementById('go-score'),
      goCoins: document.getElementById('go-coins'),
      goBest: document.getElementById('go-best'),
      goNewBest: document.getElementById('go-newbest'),
      touchControls: document.getElementById('touch-controls'),
      ingameButtons: document.getElementById('ingame-buttons')
    };
    this._cache = {};
  }

  _set(el, key, value) {
    if (this._cache[key] === value) return;
    this._cache[key] = value;
    el.textContent = value;
  }

  updateHUD(score, coins, best, speedMult, lives, maxLives, powerupLabel) {
    this._set(this.els.score, 'score', Math.floor(score));
    this._set(this.els.coins, 'coins', coins);
    this._set(this.els.best, 'best', best);
    this._set(this.els.speed, 'speed', speedMult.toFixed(1) + 'x');

    if (powerupLabel) {
      this.els.powerup.classList.remove('hidden');
      this._set(this.els.powerup, 'powerup', powerupLabel);
    } else {
      this.els.powerup.classList.add('hidden');
    }

    // lives icons
    const icons = this.els.lives.children;
    for (let i = 0; i < icons.length; i++) {
      icons[i].classList.toggle('lost', i >= lives);
    }
  }

  showHUD(show) {
    this.els.hud.classList.toggle('hidden', !show);
  }

  showTouchControls(show) {
    this.els.touchControls.classList.toggle('hidden', !show);
    this.els.ingameButtons.classList.toggle('hidden', !show);
  }

  setMenuHighScore(v) { this.els.menuHighScore.textContent = v; }

  setGameOverStats(score, coins, best, isNew) {
    this.els.goScore.textContent = Math.floor(score);
    this.els.goCoins.textContent = coins;
    this.els.goBest.textContent = best;
    this.els.goNewBest.classList.toggle('hidden', !isNew);
  }
}

/* ============================================================
   12. GAME  (state machine + main loop)
   ============================================================ */
const STATES = { MENU: 'menu', HOWTO: 'howto', SETTINGS: 'settings', PLAYING: 'playing', PAUSED: 'paused', GAMEOVER: 'gameover' };

class Game {
  constructor() {
    this.canvas = document.getElementById('game-canvas');
    this.ctx = this.canvas.getContext('2d');
    this.ui = new UI();
    this.audio = new AudioManager();
    this.input = new InputManager();
    this.particles = new ParticleSystem();
    this.background = new Background();

    this.state = STATES.MENU;
    this.settings = Storage.getSettings();
    this.highScore = Storage.getHighScore();

    this.player = new Player(this);
    this.obstacles = [];
    this.coins = [];
    this.powerUps = [];

    this.score = 0;
    this.coinsCollected = 0;
    this.lives = 3;
    this.maxLives = 3;
    this.difficultySpeedMultiplier = 1;

    this.spawnTimer = 0;
    this.coinPatternTimer = 0;
    this.powerUpTimer = 0;

    this.activePowerUp = null; // {type, timeLeft}
    this.magnetActive = false;
    this.speedBoostActive = false;

    this.screenShake = 0;
    this.lastTime = 0;

    this._resize();
    window.addEventListener('resize', () => this._resize());

    this._bindUI();
    this._bindInputCallbacks();
    this.ui.setMenuHighScore(this.highScore);
    this._applySettingsToUI();

    requestAnimationFrame((t) => this._loop(t));
  }

  /* ---------- setup ---------- */

  _resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = w * dpr;
    this.canvas.height = h * dpr;
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = h + 'px';
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.width = w;
    this.height = h;
    this.groundY = h * GROUND_Y_RATIO;
    this.background.init(w, h, this.groundY);
    if (this.player) {
      this.player.x = w * PLAYER_X_RATIO;
      this.player.reset(this.groundY);
    }
  }

  _bindUI() {
    const $ = (id) => document.getElementById(id);

    $('btn-play').addEventListener('click', () => { this.audio.playClick(); this.startGame(); });
    $('btn-howto').addEventListener('click', () => { this.audio.playClick(); this._showScreen('screen-howto'); });
    $('btn-settings').addEventListener('click', () => { this.audio.playClick(); this._showScreen('screen-settings'); });

    document.querySelectorAll('.back-btn').forEach((btn) => {
      btn.addEventListener('click', () => { this.audio.playClick(); this._showScreen('screen-menu'); });
    });

    $('btn-resume').addEventListener('click', () => { this.audio.playClick(); this.resumeGame(); });
    $('btn-pause-restart').addEventListener('click', () => { this.audio.playClick(); this.startGame(); });
    $('btn-pause-menu').addEventListener('click', () => { this.audio.playClick(); this.goToMenu(); });

    $('btn-restart').addEventListener('click', () => { this.audio.playClick(); this.startGame(); });
    $('btn-gameover-menu').addEventListener('click', () => { this.audio.playClick(); this.goToMenu(); });

    $('btn-ingame-pause').addEventListener('click', () => { this.audio.playClick(); this.togglePause(); });
    $('btn-ingame-mute').addEventListener('click', () => this._toggleMute());

    $('toggle-sound').addEventListener('click', (e) => this._toggleSetting('sound', e.target));
    $('toggle-music').addEventListener('click', (e) => this._toggleSetting('music', e.target));
    $('toggle-effects').addEventListener('click', (e) => this._toggleSetting('reducedEffects', e.target));
    $('btn-reset-score').addEventListener('click', () => {
      this.audio.playClick();
      Storage.resetHighScore();
      this.highScore = 0;
      this.ui.setMenuHighScore(0);
    });

    this.input.bindTouchButton($('touch-jump'),
      () => this.player.jump(),
      () => {});
    this.input.bindTouchButton($('touch-slide'),
      () => this.player.startSlide(),
      () => this.player.endSlide());
  }

  _bindInputCallbacks() {
    this.input.onJump = () => { if (this.state === STATES.PLAYING) this.player.jump(); };
    this.input.onSlideStart = () => { if (this.state === STATES.PLAYING) this.player.startSlide(); };
    this.input.onSlideEnd = () => { if (this.state === STATES.PLAYING) this.player.endSlide(); };
    this.input.onPauseToggle = () => { if (this.state === STATES.PLAYING || this.state === STATES.PAUSED) this.togglePause(); };
    this.input.onMuteToggle = () => this._toggleMute();
  }

  _applySettingsToUI() {
    const soundBtn = document.getElementById('toggle-sound');
    const musicBtn = document.getElementById('toggle-music');
    const effectsBtn = document.getElementById('toggle-effects');
    this._setToggleBtn(soundBtn, this.settings.sound);
    this._setToggleBtn(musicBtn, this.settings.music);
    this._setToggleBtn(effectsBtn, this.settings.reducedEffects, true);
    this.audio.settings = this.settings;
  }

  _setToggleBtn(btn, value, invertedLabel = false) {
    // invertedLabel: for "Reduced Effects" ON means effect reduced (label ON), else OFF label default false
    btn.textContent = value ? 'ON' : 'OFF';
    btn.classList.toggle('off', !value);
  }

  _toggleSetting(key, btnEl) {
    this.audio.playClick();
    this.settings[key] = !this.settings[key];
    Storage.setSettings(this.settings);
    this._setToggleBtn(btnEl, this.settings[key]);
    this.audio.settings = this.settings;
    if (key === 'music') this.audio.setMusicEnabled(this.settings.music);
  }

  _toggleMute() {
    this.settings.sound = !this.settings.sound;
    this.settings.music = this.settings.sound;
    Storage.setSettings(this.settings);
    this.audio.settings = this.settings;
    this._applySettingsToUI();
    if (!this.settings.music) this.audio.stopMusic(); else this.audio.startMusic();
  }

  _showScreen(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
  }

  _hideAllScreens() {
    document.querySelectorAll('.screen').forEach((s) => s.classList.remove('active'));
  }

  /* ---------- state transitions ---------- */

  startGame() {
    this.audio.ensureContext();
    this.state = STATES.PLAYING;
    this._hideAllScreens();
    this.ui.showHUD(true);
    this.ui.showTouchControls(true);

    this.score = 0;
    this.coinsCollected = 0;
    this.lives = this.maxLives;
    this.obstacles = [];
    this.coins = [];
    this.powerUps = [];
    this.particles.clear();
    this.spawnTimer = 1.2;
    this.coinPatternTimer = 2.2;
    this.powerUpTimer = 8;
    this.activePowerUp = null;
    this.magnetActive = false;
    this.speedBoostActive = false;
    this.difficultySpeedMultiplier = 1;
    this.screenShake = 0;

    this.player.x = this.width * PLAYER_X_RATIO;
    this.player.reset(this.groundY);

    if (this.settings.music) this.audio.startMusic();
  }

  togglePause() {
    if (this.state === STATES.PLAYING) {
      this.state = STATES.PAUSED;
      this._showScreen('screen-pause');
    } else if (this.state === STATES.PAUSED) {
      this.resumeGame();
    }
  }

  resumeGame() {
    this.state = STATES.PLAYING;
    this._hideAllScreens();
  }

  goToMenu() {
    this.state = STATES.MENU;
    this.audio.stopMusic();
    this.ui.showHUD(false);
    this.ui.showTouchControls(false);
    this.ui.setMenuHighScore(this.highScore);
    this._showScreen('screen-menu');
  }

  endGame() {
    this.state = STATES.GAMEOVER;
    this.audio.stopMusic();
    this.audio.playGameOver();
    this.ui.showHUD(false);
    this.ui.showTouchControls(false);

    const finalScore = Math.floor(this.score);
    const isNew = finalScore > this.highScore;
    if (isNew) {
      this.highScore = finalScore;
      Storage.setHighScore(finalScore);
    }
    this.ui.setGameOverStats(finalScore, this.coinsCollected, this.highScore, isNew);
    this._showScreen('screen-gameover');
  }

  /* ---------- difficulty ---------- */

  getCurrentSpeed() {
    const scoreFactor = Math.min(this.score / 1800, 1);
    let speed = BASE_SPEED + scoreFactor * (MAX_SPEED - BASE_SPEED);
    if (this.speedBoostActive) speed *= 1.5;
    return speed;
  }

  getSpeedMultiplierLabel() {
    return this.getCurrentSpeed() / BASE_SPEED;
  }

  getSpawnInterval() {
    const scoreFactor = Math.min(this.score / 1800, 1);
    return 1.5 - scoreFactor * 0.9; // gets more frequent, floor ~0.6s
  }

  /* ---------- update ---------- */

  update(dt) {
    const speed = this.getCurrentSpeed();
    this.difficultySpeedMultiplier = speed / BASE_SPEED;

    this.player.update(dt, this.groundY);
    this.background.update(dt, speed, this.width);

    // score increases with distance
    this.score += dt * 10 * this.difficultySpeedMultiplier;

    // spawn obstacles
    this.spawnTimer -= dt;
    if (this.spawnTimer <= 0) {
      this.spawnTimer = this.getSpawnInterval() + Math.random() * 0.4;
      const type = OBSTACLE_TYPES[Math.floor(Math.random() * OBSTACLE_TYPES.length)];
      this.obstacles.push(new Obstacle(type, this.width + 60, this.groundY, this.height));
    }

    // spawn coin patterns
    this.coinPatternTimer -= dt;
    if (this.coinPatternTimer <= 0) {
      this.coinPatternTimer = 2.6 + Math.random() * 1.6;
      this.coins.push(...generateCoinPattern(this.width + 80, this.groundY));
    }

    // spawn power-ups
    this.powerUpTimer -= dt;
    if (this.powerUpTimer <= 0) {
      this.powerUpTimer = 12 + Math.random() * 8;
      const type = POWERUP_TYPES[Math.floor(Math.random() * POWERUP_TYPES.length)];
      this.powerUps.push(new PowerUp(type, this.width + 80, this.groundY));
    }

    // update obstacles
    for (const o of this.obstacles) o.update(dt, speed);
    this.obstacles = this.obstacles.filter((o) => o.x + o.width > -50);

    // update coins
    for (const c of this.coins) {
      c.update(dt, speed);
      if (this.magnetActive && !c.collected) {
        const dx = this.player.x + this.player.width / 2 - c.x;
        const dy = this.player.y + this.player.height / 2 - c.y;
        const dist = Math.hypot(dx, dy);
        if (dist < 220) {
          c.x += dx * Math.min(1, dt * 6);
          c.y += dy * Math.min(1, dt * 6);
        }
      }
    }
    this.coins = this.coins.filter((c) => !c.collected && c.x > -40);

    // update power-ups
    for (const p of this.powerUps) p.update(dt, speed);
    this.powerUps = this.powerUps.filter((p) => !p.collected && p.x > -40);

    // active power-up timer
    if (this.activePowerUp) {
      this.activePowerUp.timeLeft -= dt;
      if (this.activePowerUp.timeLeft <= 0) {
        if (this.activePowerUp.type === 'magnet') this.magnetActive = false;
        if (this.activePowerUp.type === 'speed') this.speedBoostActive = false;
        this.activePowerUp = null;
      }
    }

    this._handleCollisions();

    this.particles.update(dt);
    if (this.screenShake > 0) this.screenShake -= dt * 2.4;

    // HUD
    const powerLabel = this.activePowerUp
      ? `${this.activePowerUp.type.toUpperCase()} ${this.activePowerUp.timeLeft.toFixed(1)}s`
      : (this.player.shieldActive ? 'SHIELD ACTIVE' : null);

    this.ui.updateHUD(
      this.score, this.coinsCollected, this.highScore,
      this.difficultySpeedMultiplier, this.lives, this.maxLives, powerLabel
    );

    if (this.lives <= 0) this.endGame();
  }

  _rectsOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  _handleCollisions() {
    const playerBox = this.player.getHitbox();

    // obstacles
    for (const o of this.obstacles) {
      if (o.passed) continue;
      const box = o.getHitbox();
      if (this._rectsOverlap(playerBox, box)) {
        o.passed = true;
        const realHit = this.player.hit();
        if (realHit) {
          this.lives -= 1;
          this.screenShake = 1;
          this.particles.burst(
            this.player.x + this.player.width / 2,
            this.player.y + this.player.height / 2,
            COLORS.pink, this.settings.reducedEffects ? 6 : 20
          );
        }
      } else if (o.x + o.width < this.player.x) {
        o.passed = true; // avoided safely, no score penalty
      }
    }

    // coins
    for (const c of this.coins) {
      if (c.collected) continue;
      const box = c.getHitbox();
      if (this._rectsOverlap(playerBox, box)) {
        c.collected = true;
        this.coinsCollected += 1;
        this.score += 25;
        this.audio.playCoin();
        this.particles.burst(c.x, c.y, COLORS.yellow, this.settings.reducedEffects ? 4 : 10, { life: 0.4 });
      }
    }

    // power-ups
    for (const p of this.powerUps) {
      if (p.collected) continue;
      const box = p.getHitbox();
      if (this._rectsOverlap(playerBox, box)) {
        p.collected = true;
        this.audio.playPowerUp();
        this.particles.burst(p.x, p.y, COLORS.purple, this.settings.reducedEffects ? 6 : 16);
        this._activatePowerUp(p.type);
      }
    }
  }

  _activatePowerUp(type) {
    if (type === 'shield') {
      this.player.shieldActive = true;
      return; // shield persists until used, not shown with timer
    }
    if (type === 'magnet') {
      this.magnetActive = true;
      this.activePowerUp = { type: 'magnet', timeLeft: 7 };
    } else if (type === 'speed') {
      this.speedBoostActive = true;
      this.activePowerUp = { type: 'speed', timeLeft: 5 };
    }
  }

  /* ---------- render ---------- */

  render() {
    const ctx = this.ctx;
    ctx.save();

    if (this.screenShake > 0 && !this.settings.reducedEffects) {
      const mag = this.screenShake * 8;
      ctx.translate((Math.random() - 0.5) * mag, (Math.random() - 0.5) * mag);
    }

    ctx.clearRect(-20, -20, this.width + 40, this.height + 40);
    this.background.draw(ctx, this.width, this.height, this.groundY, this.settings.reducedEffects);

    if (this.state === STATES.PLAYING || this.state === STATES.PAUSED) {
      for (const c of this.coins) c.draw(ctx);
      for (const p of this.powerUps) p.draw(ctx);
      for (const o of this.obstacles) o.draw(ctx);
      this.player.draw(ctx);
      this.particles.draw(ctx);
    }

    ctx.restore();
  }

  /* ---------- main loop ---------- */

  _loop(time) {
    const dt = Math.min((time - this.lastTime) / 1000 || 0, 0.05);
    this.lastTime = time;

    if (this.state === STATES.PLAYING) {
      this.update(dt);
    }
    this.render();

    requestAnimationFrame((t) => this._loop(t));
  }
}

/* ============================================================
   13. BOOTSTRAP
   ============================================================ */
window.addEventListener('DOMContentLoaded', () => {
  window.game = new Game();
});