class Game {
  constructor(app, helpers = {}) {
    this.app = app;
    this.storage = typeof localStorage !== 'undefined' ? localStorage : { getItem: () => 0, setItem: () => {} };

    // External helpers with safe fallbacks for easier testing.
    this.createSprite = helpers.createSprite || ((id, opts = {}) => ({ id, ...opts, anchor: { set() {} }, scale: { x: 1, y: 1, set(v) { this.x = v; this.y = v; } } }));
    this.createTilingSprite = helpers.createTilingSprite || this.createSprite;
    this.createText = helpers.createText || ((text, style = {}, opts = {}) => ({ text, style, visible: true, anchor: { set() {} }, ...opts }));
    this.randomRange = helpers.randomRange || ((min, max) => Math.random() * (max - min) + min);

    // Game constants
    this.STATE = {
      START: 'START_SCREEN',
      PLAYING: 'PLAYING',
      GAME_OVER: 'GAME_OVER',
      PAUSED: 'PAUSED',
    };

    this.gameState = this.STATE.START;
    this.score = 0;
    this.bestScore = Number(this.storage.getItem('sky_hopper_best') || 0);

    this.baseSpeed = 3;
    this.currentSpeed = this.baseSpeed;
    this.maxSpeed = 10;
    this.gravity = 0.65;
    this.jumpPower = -15;
    this.groundY = 0;

    this.obstacles = [];
    this.jumpEffects = [];
    this.passedObstacles = new Set();

    // Spawn pacing
    this.spawnCooldown = 0;
    this.spawnDelayMin = 40;
    this.spawnDelayMax = 80;

    // Double jump improves casual gameplay feeling.
    this.maxJumps = 2;
    this.jumpsUsed = 0;
  }

  setup() {
    const { app } = this;

    this.background = this.createSprite('background');
    this.background.anchor.set?.(0, 1);
    this.background.y = app.screen.height;
    app.stage.addChildAt?.(this.background, 0);

    this.floor = this.createTilingSprite('floor_texture', app.screen.width, 100);
    this.floor.anchor.set?.(0, 1);
    this.floor.y = app.screen.height;
    app.stage.addChild?.(this.floor);

    this.player = this.createSprite('player', { x: 150, height: 80 });
    this.player.anchor.set?.(0.5, 1);
    this.player.velocity = { x: 0, y: 0 };
    this.player.width = this.player.width || 80;
    this.player.isJumping = false;
    this.groundY = this.floor.y;
    this.player.y = this.groundY;
    app.stage.addChild?.(this.player);

    const titleStyle = { fontSize: 60, fill: 0x333333, fontFamily: 'Arial', align: 'center' };
    this.titleText = this.createText('Sky Hopper+', titleStyle, {
      x: app.screen.width / 2,
      y: app.screen.height / 3,
      anchor: 0.5,
    });

    const instructionStyle = { fontSize: 28, fill: 0x555555, fontFamily: 'Arial', align: 'center' };
    this.instructionText = this.createText('Tap / Space to Start', instructionStyle, {
      x: app.screen.width / 2,
      y: app.screen.height / 2,
      anchor: 0.5,
    });

    const scoreStyle = { fontSize: 32, fill: 0x333333, fontFamily: 'Arial' };
    this.scoreText = this.createText('Score: 0', scoreStyle, { x: 20, y: 20, anchor: 0 });
    this.bestText = this.createText(`Best: ${this.bestScore}`, scoreStyle, { x: 20, y: 58, anchor: 0 });

    app.stage.interactive = true;
    app.stage.on?.('pointerdown', this.handlePointerDown, this);

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        e.preventDefault();
        this.handlePointerDown();
      }
      if (e.code === 'KeyP' && this.gameState !== this.STATE.START) {
        this.togglePause();
      }
    });

    this.setupGameState();
  }

  setupGameState() {
    this.titleText.visible = this.gameState === this.STATE.START || this.gameState === this.STATE.GAME_OVER || this.gameState === this.STATE.PAUSED;
    this.instructionText.visible = this.titleText.visible;
    this.scoreText.visible = this.gameState === this.STATE.PLAYING || this.gameState === this.STATE.PAUSED;
    this.bestText.visible = this.scoreText.visible || this.gameState === this.STATE.START;
    this.player.visible = this.gameState !== this.STATE.START;
    this.floor.visible = this.gameState !== this.STATE.START;

    if (this.gameState === this.STATE.START) {
      this.titleText.text = 'Sky Hopper+';
      this.instructionText.text = 'Tap / Space to Start';
      this.resetRunObjects();
    }

    if (this.gameState === this.STATE.PAUSED) {
      this.titleText.text = 'Paused';
      this.instructionText.text = 'Press P to Resume';
    }

    if (this.gameState === this.STATE.GAME_OVER) {
      this.titleText.text = `Game Over\nScore: ${this.score}`;
      this.titleText.style.fontSize = 50;
      this.instructionText.text = 'Tap / Space to Restart';
    }
  }

  resetRunObjects() {
    this.obstacles.forEach((obs) => this.app.stage.removeChild?.(obs));
    this.obstacles = [];

    this.jumpEffects.forEach((vfx) => this.app.stage.removeChild?.(vfx));
    this.jumpEffects = [];

    this.passedObstacles.clear();
    this.spawnCooldown = 0;
  }

  resetPlayer() {
    this.player.y = this.groundY;
    this.player.velocity.y = 0;
    this.player.isJumping = false;
    this.jumpsUsed = 0;
  }

  startGame() {
    this.gameState = this.STATE.PLAYING;
    this.score = 0;
    this.currentSpeed = this.baseSpeed;
    this.scoreText.text = 'Score: 0';
    this.bestText.text = `Best: ${this.bestScore}`;
    this.resetRunObjects();
    this.resetPlayer();
    this.setupGameState();
  }

  handlePointerDown() {
    if (this.gameState === this.STATE.START) {
      this.startGame();
      return;
    }

    if (this.gameState === this.STATE.PLAYING) {
      this.jump();
      return;
    }

    if (this.gameState === this.STATE.GAME_OVER) {
      this.gameState = this.STATE.START;
      this.resetPlayer();
      this.setupGameState();
    }
  }

  togglePause() {
    if (this.gameState === this.STATE.PLAYING) {
      this.gameState = this.STATE.PAUSED;
      this.setupGameState();
    } else if (this.gameState === this.STATE.PAUSED) {
      this.gameState = this.STATE.PLAYING;
      this.setupGameState();
    }
  }

  jump() {
    if (this.jumpsUsed < this.maxJumps) {
      this.player.velocity.y = this.jumpPower;
      this.player.isJumping = true;
      this.jumpsUsed += 1;
      this.createJumpEffect();
    }
  }

  createJumpEffect() {
    const vfx = this.createSprite('jump_vfx', {
      x: this.player.x,
      y: this.player.y - 10,
      width: 60,
    });
    vfx.anchor.set?.(0.5, 0.5);
    vfx.alpha = 0.8;
    vfx.scale = vfx.scale || { x: 1, y: 1, set(v) { this.x = v; this.y = v; } };
    this.app.stage.addChild?.(vfx);
    this.jumpEffects.push(vfx);
  }

  spawnObstacle() {
    if (this.spawnCooldown > 0) {
      this.spawnCooldown -= 1;
      return;
    }

    const obstacle = this.createSprite('obstacle', {
      x: this.app.screen.width + 60,
      height: this.randomRange(70, 130),
      width: this.randomRange(40, 70),
    });

    obstacle.anchor.set?.(0.5, 1);
    obstacle.y = this.groundY;
    this.app.stage.addChild?.(obstacle);
    this.obstacles.push(obstacle);

    const speedFactor = Math.max(0.7, 1 - this.score * 0.01);
    this.spawnCooldown = Math.floor(this.randomRange(this.spawnDelayMin, this.spawnDelayMax) * speedFactor);
  }

  updatePlayer(delta) {
    this.player.velocity.y += this.gravity * delta;
    this.player.y += this.player.velocity.y * delta;

    if (this.player.y >= this.groundY) {
      this.player.y = this.groundY;
      this.player.velocity.y = 0;
      this.player.isJumping = false;
      this.jumpsUsed = 0;
    }
  }

  intersects(a, b) {
    const aLeft = a.x - a.width / 2;
    const aRight = a.x + a.width / 2;
    const aTop = a.y - a.height;
    const aBottom = a.y;

    const bLeft = b.x - b.width / 2;
    const bRight = b.x + b.width / 2;
    const bTop = b.y - b.height;
    const bBottom = b.y;

    return aLeft < bRight && aRight > bLeft && aTop < bBottom && aBottom > bTop;
  }

  updateObstacles(delta) {
    const player = this.player;

    this.obstacles = this.obstacles.filter((obstacle) => {
      obstacle.x -= this.currentSpeed * delta;

      if (this.intersects(player, obstacle)) {
        this.gameOver();
        return false;
      }

      if (obstacle.x + obstacle.width / 2 < player.x - player.width / 2 && !this.passedObstacles.has(obstacle)) {
        this.passedObstacles.add(obstacle);
        this.score += 1;
        this.scoreText.text = `Score: ${this.score}`;
        this.currentSpeed = Math.min(this.maxSpeed, this.baseSpeed + this.score * 0.12);
      }

      if (obstacle.x < -120) {
        this.app.stage.removeChild?.(obstacle);
        return false;
      }

      return true;
    });
  }

  updateJumpEffects(delta) {
    this.jumpEffects = this.jumpEffects.filter((vfx) => {
      vfx.alpha -= 0.03 * delta;
      vfx.y -= 1.2 * delta;
      vfx.scale.set?.(vfx.scale.x + 0.02 * delta);

      if (vfx.alpha <= 0) {
        this.app.stage.removeChild?.(vfx);
        return false;
      }

      return true;
    });
  }

  updateEnvironment(delta) {
    // Small parallax/scroll feedback.
    if (this.floor && typeof this.floor.tilePosition?.x === 'number') {
      this.floor.tilePosition.x -= this.currentSpeed * delta;
    }
  }

  gameOver() {
    this.gameState = this.STATE.GAME_OVER;

    if (this.score > this.bestScore) {
      this.bestScore = this.score;
      this.storage.setItem('sky_hopper_best', String(this.bestScore));
    }

    this.bestText.text = `Best: ${this.bestScore}`;
    this.setupGameState();
  }

  update(delta = 1) {
    if (this.gameState !== this.STATE.PLAYING) return;

    this.updatePlayer(delta);
    this.updateObstacles(delta);
    this.spawnObstacle();
    this.updateJumpEffects(delta);
    this.updateEnvironment(delta);
  }
}

module.exports = { Game };
