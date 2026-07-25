(() => {
  "use strict";

  const $ = (selector) => document.querySelector(selector);
  const canvas = $("#gameCanvas");
  const ctx = canvas.getContext("2d", { alpha: false });
  const stage = $("#gameStage");

  const ui = {
    story: $("#storyOverlay"),
    girlPortrait: $("#girlPortrait"),
    boyPortrait: $("#boyPortrait"),
    count: $("#dialogueCount"),
    progress: $("#storyProgress"),
    speaker: $("#speakerName"),
    speakerRole: $("#speakerRole"),
    amharic: $("#dialogueAmharic"),
    english: $("#dialogueEnglish"),
    next: $("#nextButton"),
    nextLabel: $("#nextLabel"),
    skip: $("#skipButton"),
    countdown: $("#countdownOverlay"),
    countdownText: $("#countdownText"),
    hud: $("#hud"),
    score: $("#scoreValue"),
    best: $("#bestValue"),
    location: $("#locationValue"),
    dashFill: $("#dashFill"),
    pause: $("#pauseOverlay"),
    gameover: $("#gameoverOverlay"),
    finalScore: $("#finalScore"),
    finalBest: $("#finalBest"),
    sound: $("#soundButton"),
    pauseButton: $("#pauseButton"),
  };

  const dialogue = [
    {
      speaker: "girl",
      name: "ገንዘቤ",
      role: "CITY RUNNER // 01",
      am: "ዛሬ አንድ ካይጁ የአዲስ አበባን ታሪካዊ ቦታዎች ሊያጠፋ መጥቷል።",
      en: "A Kaiju has come to destroy the historic landmarks of Addis Ababa.",
    },
    {
      speaker: "boy",
      name: "ስለሺ",
      role: "SCOUT // 02",
      am: "ገንዘቤ፣ ከተማዋን እንዴት እናድናት?",
      en: "Ganzebe, what should we do? The streets are already blocked.",
    },
    {
      speaker: "girl",
      name: "ገንዘቤ",
      role: "CITY RUNNER // 01",
      am: "እንሮጣለን፣ እንዘላለን፣ ሁሉንም መሰናክል እናልፋለን!",
      en: "We run, we jump, and we overcome every obstacle in our way.",
    },
    {
      speaker: "girl",
      name: "ገንዘቤ",
      role: "CITY RUNNER // 01",
      am: "አዲስ አበባን አብረን እናድን። ዝግጁ ነህ?",
      en: "Let's save Addis Ababa together. Stay close—and don't stop running.",
    },
  ];

  const locations = [
    { at: 0, label: "ፒያሳ · PIASSA", tint: ["#241449", "#5d367c"] },
    { at: 350, label: "አራት ኪሎ · ARAT KILO", tint: ["#19254f", "#3e648a"] },
    { at: 750, label: "መስቀል አደባባይ · MESKEL", tint: ["#412044", "#a3574f"] },
    { at: 1250, label: "ሜክሲኮ · MEXICO", tint: ["#132f45", "#287d7b"] },
    { at: 1800, label: "አንድነት ፓርክ · UNITY", tint: ["#243221", "#59813c"] },
  ];

  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const lerp = (a, b, t) => a + (b - a) * t;
  const pad = (value) => String(Math.max(0, Math.floor(value))).padStart(5, "0");
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  class SoundEngine {
    constructor() {
      this.context = null;
      this.muted = false;
    }

    ensure() {
      if (this.muted) return null;
      if (!this.context) {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return null;
        this.context = new AudioContext();
      }
      if (this.context.state === "suspended") this.context.resume();
      return this.context;
    }

    tone(frequency, duration = 0.08, type = "square", gain = 0.035, slide = 0) {
      const audio = this.ensure();
      if (!audio) return;
      const oscillator = audio.createOscillator();
      const volume = audio.createGain();
      oscillator.type = type;
      oscillator.frequency.setValueAtTime(frequency, audio.currentTime);
      if (slide) oscillator.frequency.exponentialRampToValueAtTime(Math.max(40, frequency + slide), audio.currentTime + duration);
      volume.gain.setValueAtTime(gain, audio.currentTime);
      volume.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + duration);
      oscillator.connect(volume);
      volume.connect(audio.destination);
      oscillator.start();
      oscillator.stop(audio.currentTime + duration);
    }

    jump() {
      this.tone(220, 0.13, "square", 0.045, 210);
    }

    dash() {
      this.tone(140, 0.18, "sawtooth", 0.045, -60);
    }

    start() {
      this.tone(330, 0.08, "square", 0.04, 120);
      setTimeout(() => this.tone(520, 0.1, "square", 0.035, 160), 100);
    }

    crash() {
      this.tone(110, 0.35, "sawtooth", 0.07, -65);
    }

    tick() {
      this.tone(440, 0.035, "square", 0.018);
    }

    toggle() {
      this.muted = !this.muted;
      if (!this.muted) this.tick();
      return this.muted;
    }
  }

  class RunnerGame {
    constructor() {
      this.state = "story";
      this.width = 0;
      this.height = 0;
      this.dpr = 1;
      this.groundY = 0;
      this.lastTime = performance.now();
      this.elapsed = 0;
      this.distance = 0;
      this.best = Number(localStorage.getItem("addis-runner-best") || 0);
      this.speed = 305;
      this.scroll = 0;
      this.spawnTimer = 1.35;
      this.locationIndex = 0;
      this.obstacles = [];
      this.particles = [];
      this.speedLines = [];
      this.clouds = Array.from({ length: 8 }, (_, index) => ({
        x: Math.random(),
        y: 0.12 + Math.random() * 0.28,
        size: 30 + Math.random() * 70,
        speed: 0.5 + Math.random() * 0.8,
        layer: index % 2,
      }));
      this.birds = Array.from({ length: 7 }, (_, index) => ({
        x: 0,
        y: 0,
        size: 10 + Math.random() * 8,
        speed: 34 + Math.random() * 28,
        phase: Math.random() * Math.PI * 2,
        slot: index,
        ready: false,
      }));
      this.player = {
        x: 0,
        y: 0,
        w: 88,
        h: 96,
        vy: 0,
        grounded: true,
        jumpBuffer: 0,
        coyote: 0,
        dashTime: 0,
        dashCooldown: 0,
        duckTime: 0,
      };
      this.groundImage = new Image();
      this.characterImages = {
        girl: new Image(),
        boy: new Image(),
      };
      this.characterImages.girl.src = "./ሴት.png";
      this.characterImages.boy.src = "./ወንድ.png";
      this.characterVideos = {
        run: this.createCharacterVideo("./Run.mp4", true),
        jump: this.createCharacterVideo("./Jump.mp4", false),
        dash: this.createCharacterVideo("./Dash.mp4", false),
      };
      this.landmarkCanvas = document.createElement("canvas");
      this.landmarkCanvas.width = 1;
      this.landmarkCanvas.height = 1;
      this.landmarkReady = false;
      this.backgroundCanvas = document.createElement("canvas");
      this.backgroundCanvas.width = 1;
      this.backgroundCanvas.height = 1;
      this.backgroundReady = false;
      this.backgroundCacheKey = "";
      this.frameCanvas = document.createElement("canvas");
      this.frameCanvas.width = 1;
      this.frameCanvas.height = 1;
      this.frameContext = this.frameCanvas.getContext("2d", { willReadFrequently: true });
      this.groundImage.addEventListener("load", () => {
        this.buildLandmarkCache();
        this.buildBackgroundCache();
      });
      this.groundImage.src = "./ግራውንድ.png";
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.bindInput();
      ui.best.textContent = pad(this.best);
      requestAnimationFrame((time) => this.loop(time));
    }

    createCharacterVideo(source, loop) {
      const video = document.createElement("video");
      video.src = source;
      video.muted = true;
      video.loop = loop;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("aria-hidden", "true");
      video.load();
      return video;
    }

    playCharacterVideo(name, restart = false) {
      const video = this.characterVideos[name];
      if (!video) return;
      if (restart) {
        try {
          video.currentTime = name === "dash" ? 0.32 : 0;
        } catch {
          // The first decoded frame remains a safe fallback while metadata loads.
        }
      }
      if (name === "dash") {
        video.pause();
        return;
      }
      const playback = video.play();
      if (playback?.catch) playback.catch(() => {});
    }

    buildLandmarkCache() {
      if (!this.groundImage.naturalWidth) return;
      const sourceY = 490;
      const sourceH = 590;
      const targetH = 150;
      this.landmarkCanvas.width = Math.round(this.groundImage.naturalWidth * targetH / sourceH);
      this.landmarkCanvas.height = targetH;
      const landmarkContext = this.landmarkCanvas.getContext("2d", { alpha: true });
      landmarkContext.imageSmoothingEnabled = false;
      landmarkContext.clearRect(0, 0, this.landmarkCanvas.width, targetH);
      landmarkContext.drawImage(
        this.groundImage,
        0,
        sourceY,
        this.groundImage.naturalWidth,
        sourceH,
        0,
        0,
        this.landmarkCanvas.width,
        targetH,
      );
      landmarkContext.globalCompositeOperation = "source-atop";
      landmarkContext.fillStyle = "rgba(74, 48, 96, 0.27)";
      landmarkContext.fillRect(0, 0, this.landmarkCanvas.width, targetH);
      landmarkContext.globalCompositeOperation = "source-over";
      this.landmarkReady = true;
    }

    buildBackgroundCache() {
      if (!this.groundImage.naturalWidth || !this.height) return;
      const targetHeight = Math.ceil(this.height);
      const cacheKey = `${targetHeight}:sketch`;
      if (cacheKey === this.backgroundCacheKey) return;
      const targetWidth = Math.ceil(
        this.groundImage.naturalWidth * targetHeight / this.groundImage.naturalHeight,
      );
      this.backgroundCanvas.width = targetWidth;
      this.backgroundCanvas.height = targetHeight;
      const backgroundContext = this.backgroundCanvas.getContext("2d", { alpha: false });
      backgroundContext.imageSmoothingEnabled = true;
      const paper = backgroundContext.createLinearGradient(0, 0, 0, targetHeight);
      paper.addColorStop(0, "#d7d7d7");
      paper.addColorStop(0.62, "#c4c4c4");
      paper.addColorStop(1, "#8f8f8f");
      backgroundContext.fillStyle = paper;
      backgroundContext.fillRect(0, 0, targetWidth, targetHeight);
      backgroundContext.filter = "grayscale(1) contrast(1.16) brightness(1.16)";
      backgroundContext.drawImage(
        this.groundImage,
        0,
        0,
        this.groundImage.naturalWidth,
        this.groundImage.naturalHeight,
        0,
        0,
        targetWidth,
        targetHeight,
      );
      backgroundContext.filter = "none";
      backgroundContext.globalCompositeOperation = "multiply";
      backgroundContext.fillStyle = "#d4d4d4";
      backgroundContext.fillRect(0, 0, targetWidth, targetHeight);
      backgroundContext.globalCompositeOperation = "source-over";
      this.backgroundCacheKey = cacheKey;
      this.backgroundReady = true;
    }

    resize() {
      const bounds = stage.getBoundingClientRect();
      this.width = Math.max(320, bounds.width);
      this.height = Math.max(420, bounds.height);
      this.dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.round(this.width * this.dpr);
      canvas.height = Math.round(this.height * this.dpr);
      canvas.style.width = `${this.width}px`;
      canvas.style.height = `${this.height}px`;
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      this.groundY = this.height * (this.width < 680 ? 0.76 : 0.78);
      this.player.w = this.width < 560 ? 88 : 104;
      this.player.h = this.width < 560 ? 96 : 112;
      this.player.x = this.width * (this.width < 680 ? 0.27 : 0.22);
      if (this.player.grounded || this.state !== "running") this.player.y = this.groundY - this.player.h;
      for (const bird of this.birds) {
        if (!bird.ready) {
          bird.x = this.width * (0.28 + bird.slot * 0.18) + Math.random() * 90;
          bird.ready = true;
        } else {
          bird.x = clamp(bird.x, -80, this.width + 260);
        }
        bird.y = this.height * (0.31 + (bird.slot % 3) * 0.045 + Math.random() * 0.045);
      }
      this.backgroundCacheKey = "";
      this.buildBackgroundCache();
    }

    bindInput() {
      window.addEventListener("keydown", (event) => {
        if (["Space", "ArrowUp", "ArrowDown"].includes(event.code)) event.preventDefault();
        if (this.state === "story" && ["Space", "Enter"].includes(event.code)) {
          story.next();
          return;
        }
        if (this.state === "gameover" && ["Space", "Enter"].includes(event.code)) {
          this.restart();
          return;
        }
        if (event.code === "KeyP" || event.code === "Escape") {
          this.togglePause();
          return;
        }
        if (event.code === "Space" || event.code === "ArrowUp" || event.code === "KeyW") this.queueJump();
        if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "ArrowDown" || event.code === "KeyD") this.dash();
      });

      const press = (element, action) => {
        element.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          action();
        });
      };
      press($("#jumpButton"), () => this.queueJump());
      press($("#dashButton"), () => this.dash());
      canvas.addEventListener("pointerdown", (event) => {
        if (this.state === "running" && event.pointerType !== "mouse") this.queueJump();
      });
    }

    queueJump() {
      if (this.state !== "running") return;
      this.player.jumpBuffer = 0.13;
      sound.ensure();
    }

    dash() {
      if (this.state !== "running" || this.player.dashCooldown > 0) return;
      this.player.dashTime = 0.58;
      this.player.dashCooldown = 1.15;
      this.player.duckTime = this.player.grounded ? 0.58 : 0;
      this.playCharacterVideo("dash", true);
      sound.dash();
      for (let i = 0; i < 10; i += 1) {
        this.particles.push({
          x: this.player.x + Math.random() * 20,
          y: this.player.y + 25 + Math.random() * 42,
          vx: -140 - Math.random() * 240,
          vy: -30 + Math.random() * 60,
          life: 0.22 + Math.random() * 0.18,
          maxLife: 0.4,
          color: i % 2 ? "#f2f2f2" : "#777",
          size: 3 + Math.random() * 6,
        });
      }
    }

    start() {
      this.state = "running";
      this.distance = 0;
      this.speed = 305;
      this.scroll = 0;
      this.spawnTimer = 1.55;
      this.obstacles.length = 0;
      this.particles.length = 0;
      this.locationIndex = 0;
      this.player.y = this.groundY - this.player.h;
      this.player.vy = 0;
      this.player.grounded = true;
      this.player.dashTime = 0;
      this.player.dashCooldown = 0;
      this.player.duckTime = 0;
      ui.hud.classList.add("is-visible");
      ui.pause.classList.remove("is-visible");
      ui.gameover.classList.remove("is-visible");
      ui.location.textContent = locations[0].label;
      this.playCharacterVideo("run", true);
      sound.start();
    }

    restart() {
      ui.gameover.classList.remove("is-visible");
      this.start();
    }

    togglePause(force) {
      if (!["running", "paused"].includes(this.state)) return;
      const shouldPause = typeof force === "boolean" ? force : this.state === "running";
      this.state = shouldPause ? "paused" : "running";
      ui.pause.classList.toggle("is-visible", shouldPause);
      if (!shouldPause) this.lastTime = performance.now();
    }

    gameOver() {
      if (this.state !== "running") return;
      this.state = "gameover";
      sound.crash();
      this.best = Math.max(this.best, Math.floor(this.distance));
      localStorage.setItem("addis-runner-best", String(this.best));
      ui.best.textContent = pad(this.best);
      ui.finalScore.textContent = Math.floor(this.distance);
      ui.finalBest.textContent = `${this.best} M`;
      setTimeout(() => ui.gameover.classList.add("is-visible"), 260);
      for (let i = 0; i < 28; i += 1) {
        this.particles.push({
          x: this.player.x + this.player.w * 0.5,
          y: this.player.y + this.player.h * 0.5,
          vx: -250 + Math.random() * 500,
          vy: -280 + Math.random() * 330,
          life: 0.5 + Math.random() * 0.55,
          maxLife: 1.05,
          color: ["#f2f2f2", "#777", "#111"][i % 3],
          size: 3 + Math.random() * 7,
        });
      }
    }

    spawnObstacle(forcedType) {
      const pool = this.distance < 140
        ? ["rubble", "barrier"]
        : ["rubble", "barrier", "spike", "crate", "overhead"];
      const type = forcedType || pool[Math.floor(Math.random() * pool.length)];
      const config = {
        rubble: { w: 74, h: 42, breakable: false },
        barrier: { w: 62, h: 66, breakable: false },
        spike: { w: 56, h: 78, breakable: false },
        crate: { w: 62, h: 58, breakable: true },
        overhead: { w: 136, h: 58, breakable: false, overhead: true },
      }[type];
      const mobileScale = this.width < 560 ? 0.88 : 1;
      const width = config.w * mobileScale;
      const height = config.h * mobileScale;
      this.obstacles.push({
        type,
        x: this.width + 70,
        y: config.overhead ? this.groundY - this.player.h * 1.28 : this.groundY - height,
        w: width,
        h: height,
        breakable: config.breakable,
        overhead: Boolean(config.overhead),
        passed: false,
        seed: Math.random() * 10,
      });
    }

    update(dt) {
      this.elapsed += dt;
      this.updateParticles(dt);
      if (this.state !== "running") return;

      this.speed = Math.min(535, 305 + this.distance * 0.105);
      const dashBoost = this.player.dashTime > 0 ? 155 : 0;
      const worldSpeed = this.speed + dashBoost;
      this.scroll += worldSpeed * dt;
      this.distance += worldSpeed * dt * 0.075;

      this.player.jumpBuffer = Math.max(0, this.player.jumpBuffer - dt);
      this.player.dashTime = Math.max(0, this.player.dashTime - dt);
      this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
      this.player.duckTime = this.player.grounded ? Math.max(0, this.player.duckTime - dt) : 0;
      this.player.coyote = this.player.grounded ? 0.1 : Math.max(0, this.player.coyote - dt);
      this.updateBirds(dt, worldSpeed);

      if (this.player.jumpBuffer > 0 && this.player.coyote > 0) {
        this.player.jumpBuffer = 0;
        this.player.coyote = 0;
        this.player.grounded = false;
        this.player.vy = -Math.max(705, this.height * 0.98);
        this.playCharacterVideo("jump", true);
        sound.jump();
        this.makeDust(this.player.x + 20, this.groundY - 3, 8);
      }

      const gravity = Math.max(1900, this.height * 2.65);
      this.player.vy += gravity * dt;
      this.player.y += this.player.vy * dt;
      const floor = this.groundY - this.player.h;
      if (this.player.y >= floor) {
        if (!this.player.grounded && this.player.vy > 300) {
          this.makeDust(this.player.x + 24, this.groundY - 2, 6);
          this.playCharacterVideo("run");
        }
        this.player.y = floor;
        this.player.vy = 0;
        this.player.grounded = true;
      }

      this.spawnTimer -= dt;
      if (this.spawnTimer <= 0) {
        this.spawnObstacle();
        const targetGap = 465 + Math.random() * 265;
        this.spawnTimer = targetGap / this.speed;
      }

      for (const obstacle of this.obstacles) {
        obstacle.x -= worldSpeed * dt;
        if (!obstacle.passed && obstacle.x + obstacle.w < this.player.x) {
          obstacle.passed = true;
          sound.tone(680, 0.035, "square", 0.012);
        }
      }

      const ducking = this.player.duckTime > 0 && this.player.grounded;
      const playerBox = ducking
        ? {
            x: this.player.x + this.player.w * 0.16,
            y: this.groundY - this.player.h * 0.38,
            w: this.player.w * 0.66,
            h: this.player.h * 0.27,
          }
        : {
            x: this.player.x + (this.player.dashTime > 0 ? 8 : this.player.w * 0.3),
            y: this.player.y + (this.player.dashTime > 0 ? 31 : 14),
            w: this.player.dashTime > 0 ? this.player.w - 16 : this.player.w * 0.4,
            h: this.player.h - (this.player.dashTime > 0 ? 34 : 28),
          };

      for (let index = this.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = this.obstacles[index];
        if (obstacle.x + obstacle.w < -40) {
          this.obstacles.splice(index, 1);
          continue;
        }
        const obstacleLeft = obstacle.x + 7;
        const obstacleRight = obstacle.x + obstacle.w - 7;
        const horizontalOverlap = playerBox.x < obstacleRight && playerBox.x + playerBox.w > obstacleLeft;
        if (obstacle.overhead) {
          if (horizontalOverlap && !ducking) {
            this.gameOver();
            break;
          }
          continue;
        }
        const obstacleBox = {
          x: obstacleLeft,
          y: obstacle.y + 5,
          w: obstacle.w - 14,
          h: obstacle.h - 5,
        };
        const collides =
          playerBox.x < obstacleBox.x + obstacleBox.w &&
          playerBox.x + playerBox.w > obstacleBox.x &&
          playerBox.y < obstacleBox.y + obstacleBox.h &&
          playerBox.y + playerBox.h > obstacleBox.y;
        if (!collides) continue;
        if (this.player.dashTime > 0 && obstacle.breakable) {
          this.makeBurst(obstacle.x + obstacle.w / 2, obstacle.y + obstacle.h / 2);
          this.distance += 28;
          this.obstacles.splice(index, 1);
          sound.tone(180, 0.12, "square", 0.05, 240);
        } else {
          this.gameOver();
          break;
        }
      }

      const newLocationIndex = locations.reduce((value, location, index) => (this.distance >= location.at ? index : value), 0);
      if (newLocationIndex !== this.locationIndex) {
        this.locationIndex = newLocationIndex;
        this.backgroundCacheKey = "";
        this.buildBackgroundCache();
        ui.location.textContent = locations[this.locationIndex].label;
      }

      ui.score.textContent = pad(this.distance);
      ui.dashFill.style.transform = `scaleX(${1 - this.player.dashCooldown / 1.15})`;
    }

    updateBirds(dt, worldSpeed) {
      for (const bird of this.birds) {
        bird.x -= (bird.speed + worldSpeed * 0.18) * dt;
        bird.phase += dt * 8;
        if (bird.x < -80) {
          bird.x = this.width + 90 + Math.random() * 220;
          bird.y = this.height * (0.33 + Math.random() * 0.18);
          bird.size = 10 + Math.random() * 8;
          bird.speed = 34 + Math.random() * 28;
        }
      }
    }

    makeDust(x, y, count) {
      for (let i = 0; i < count; i += 1) {
        this.particles.push({
          x: x + Math.random() * 18 - 9,
          y,
          vx: -75 - Math.random() * 100,
          vy: -30 - Math.random() * 70,
          life: 0.25 + Math.random() * 0.28,
          maxLife: 0.53,
          color: i % 2 ? "#d8b87b" : "#8a6f75",
          size: 3 + Math.random() * 6,
        });
      }
    }

    makeBurst(x, y) {
      for (let i = 0; i < 18; i += 1) {
        this.particles.push({
          x,
          y,
          vx: -220 + Math.random() * 380,
          vy: -190 + Math.random() * 320,
          life: 0.3 + Math.random() * 0.45,
          maxLife: 0.75,
          color: i % 3 === 0 ? "#f2f2f2" : "#555",
          size: 3 + Math.random() * 7,
        });
      }
    }

    updateParticles(dt) {
      for (let index = this.particles.length - 1; index >= 0; index -= 1) {
        const particle = this.particles[index];
        particle.life -= dt;
        particle.x += particle.vx * dt;
        particle.y += particle.vy * dt;
        particle.vy += 360 * dt;
        if (particle.life <= 0) this.particles.splice(index, 1);
      }
    }

    loop(time) {
      const dt = Math.min(0.033, Math.max(0, (time - this.lastTime) / 1000));
      this.lastTime = time;
      this.update(dt);
      this.draw();
      requestAnimationFrame((nextTime) => this.loop(nextTime));
    }

    draw() {
      ctx.save();
      ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
      ctx.imageSmoothingEnabled = false;
      this.drawBackground();
      this.drawKaiju();
      this.drawBirds();
      this.drawRoad();
      for (const obstacle of this.obstacles) this.drawObstacle(obstacle);
      this.drawPlayer();
      this.drawParticles();
      this.drawForeground();
      ctx.restore();
    }

    drawBackground() {
      ctx.fillStyle = "#d2d2d2";
      ctx.fillRect(0, 0, this.width, this.height);

      if (this.backgroundReady) {
        const lift = Math.round(this.height * (this.width < 680 ? 0.08 : 0.1));
        const sourceOffset = (this.scroll * 0.48) % this.backgroundCanvas.width;
        const firstWidth = Math.min(this.width, this.backgroundCanvas.width - sourceOffset);
        ctx.drawImage(
          this.backgroundCanvas,
          sourceOffset,
          0,
          firstWidth,
          this.backgroundCanvas.height,
          0,
          -lift,
          firstWidth,
          this.height,
        );
        if (firstWidth < this.width) {
          ctx.drawImage(
            this.backgroundCanvas,
            0,
            0,
            this.width - firstWidth,
            this.backgroundCanvas.height,
            firstWidth,
            -lift,
            this.width - firstWidth,
            this.height,
          );
        }
      }
    }

    drawKaiju() {
      const x = -this.width * 0.09 + Math.sin(this.elapsed * 1.3) * 4;
      const y = this.groundY - Math.min(320, this.height * 0.52);
      const scale = clamp(this.height / 720, 0.7, 1.15);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(scale, scale);
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = "#111";
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(20, 285);
      ctx.lineTo(16, 160);
      ctx.lineTo(42, 127);
      ctx.lineTo(34, 86);
      ctx.lineTo(72, 103);
      ctx.lineTo(92, 50);
      ctx.lineTo(115, 105);
      ctx.lineTo(159, 77);
      ctx.lineTo(148, 129);
      ctx.lineTo(177, 161);
      ctx.lineTo(174, 285);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#242424";
      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.fillRect(75, 139, 12, 5);
      ctx.fillRect(112, 139, 12, 5);
      ctx.shadowBlur = 0;
      ctx.restore();
    }

    drawLandmarks() {
      const horizon = this.groundY - Math.min(118, this.height * 0.17);
      ctx.save();
      ctx.globalAlpha = 0.54;
      if (this.landmarkReady) {
        const sourceOffset = (this.scroll * 0.52) % this.landmarkCanvas.width;
        const firstWidth = Math.min(this.width, this.landmarkCanvas.width - sourceOffset);
        ctx.drawImage(this.landmarkCanvas, sourceOffset, 0, firstWidth, 150, 0, horizon, firstWidth, 150);
        if (firstWidth < this.width) {
          ctx.drawImage(this.landmarkCanvas, 0, 0, this.width - firstWidth, 150, firstWidth, horizon, this.width - firstWidth, 150);
        }
      }
      ctx.restore();

      const base = this.groundY - 9;
      ctx.save();
      ctx.globalAlpha = 0.31;
      ctx.fillStyle = "#181126";
      for (let i = 0; i < 18; i += 1) {
        const width = 42 + (i % 5) * 13;
        const height = 35 + ((i * 31) % 78);
        const x = ((i * 109 - this.scroll * 0.18) % (this.width + 180) + this.width + 180) % (this.width + 180) - 90;
        ctx.fillRect(x, base - height, width, height);
        ctx.fillStyle = "rgba(255,210,124,.26)";
        for (let row = 0; row < 3; row += 1) {
          for (let col = 0; col < 2; col += 1) {
            if ((row + col + i) % 3) ctx.fillRect(x + 9 + col * 17, base - height + 11 + row * 18, 5, 7);
          }
        }
        ctx.fillStyle = "#181126";
      }
      ctx.restore();
    }

    drawRoad() {
      const roadTop = this.groundY + 1;
      const roadHeight = this.height - roadTop;
      ctx.fillStyle = "#050505";
      ctx.fillRect(0, roadTop, this.width, roadHeight);
      ctx.fillStyle = "#171717";
      ctx.fillRect(0, roadTop - 4, this.width, 4);
      ctx.strokeStyle = "rgba(255,255,255,.08)";
      ctx.lineWidth = 1;
      for (let i = 0; i < 2; i += 1) {
        const y = roadTop + 20 + i * 20;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(this.width, y);
        ctx.stroke();
      }

      if (this.state === "running" && this.speed > 390) {
        ctx.globalAlpha = clamp((this.speed - 390) / 240, 0, 0.16);
        ctx.fillStyle = "#f2f2f2";
        for (let i = 0; i < 8; i += 1) {
          const x = ((i * 173 - this.scroll * 2) % (this.width + 100) + this.width + 100) % (this.width + 100);
          const y = roadTop + 18 + (i * 29) % Math.max(30, this.height - roadTop - 25);
          ctx.fillRect(x, y, 38 + (i % 3) * 18, 1);
        }
        ctx.globalAlpha = 1;
      }
    }

    drawBirds() {
      ctx.save();
      ctx.strokeStyle = "rgba(16,16,16,.78)";
      ctx.lineWidth = 2;
      ctx.lineCap = "round";
      for (const bird of this.birds) {
        const flap = Math.sin(bird.phase) * bird.size * 0.35;
        ctx.beginPath();
        ctx.moveTo(bird.x, bird.y);
        ctx.quadraticCurveTo(bird.x + bird.size * 0.55, bird.y - bird.size * 0.35 - flap, bird.x + bird.size, bird.y);
        ctx.moveTo(bird.x + bird.size, bird.y);
        ctx.quadraticCurveTo(bird.x + bird.size * 1.45, bird.y - bird.size * 0.35 + flap, bird.x + bird.size * 2, bird.y);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawCompanion() {
      const phase = this.elapsed * (this.speed / 39);
      const scale = this.width < 560 ? 0.68 : 0.78;
      ctx.save();
      ctx.globalAlpha = this.state === "story" ? 0.6 : 0.84;
      ctx.translate(this.player.x - 72, this.groundY + 2);
      ctx.scale(scale, scale);
      this.drawSuppliedCharacter("boy", phase + 1.2, 0, true);
      ctx.restore();
    }

    drawPlayer() {
      const jumpLift = this.player.y + this.player.h - this.groundY;
      const motion = this.player.dashTime > 0
        ? "dash"
        : (this.player.grounded ? "run" : "jump");
      const video = this.characterVideos[motion];
      ctx.save();
      ctx.translate(this.player.x, this.groundY + jumpLift);
      const fallbackVideo = this.characterVideos.run;
      if (motion === "dash" && video?.readyState >= 2) {
        try {
          if (Math.abs(video.currentTime - 0.32) > 0.05) video.currentTime = 0.32;
          video.pause();
        } catch {
          // Keep the last decoded slide frame if the browser is already seeking.
        }
      }
      if (video?.readyState >= 2 || fallbackVideo?.readyState >= 2) {
        this.drawVideoCharacter(video?.readyState >= 2 ? video : fallbackVideo, video?.readyState >= 2 ? motion : "run");
      } else {
        this.drawSketchRunner(motion);
      }
      ctx.restore();
    }

    drawVideoCharacter(video, motion) {
      const mobileScale = this.width < 560 ? 0.9 : 1;
      const config = {
        run: { x: -29, y: -159, width: 160, height: 171, source: [58, 6, 178, 170], threshold: 8 },
        jump: { x: -23, y: -181, width: 139, height: 184, source: [62, 0, 145, 180], threshold: 8 },
        dash: { x: -43, y: -133, width: 194, height: 140, source: [32, 30, 205, 148], threshold: 8 },
      }[motion];
      const x = config.x * mobileScale;
      const y = config.y * mobileScale;
      const width = config.width * mobileScale;
      const height = config.height * mobileScale;
      const source = config.source;
      const drawFrame = (drawX, drawY) => {
        this.frameCanvas.width = Math.max(1, Math.ceil(width));
        this.frameCanvas.height = Math.max(1, Math.ceil(height));
        const frameContext = this.frameContext;
        frameContext.setTransform(1, 0, 0, 1, 0, 0);
        frameContext.clearRect(0, 0, this.frameCanvas.width, this.frameCanvas.height);
        frameContext.imageSmoothingEnabled = true;
        if (source) {
          frameContext.drawImage(video, source[0], source[1], source[2], source[3], 0, 0, this.frameCanvas.width, this.frameCanvas.height);
        } else {
          frameContext.drawImage(video, 0, 0, this.frameCanvas.width, this.frameCanvas.height);
        }
        const frameWidth = this.frameCanvas.width;
        const frameHeight = this.frameCanvas.height;
        const frame = frameContext.getImageData(0, 0, frameWidth, frameHeight);
        const data = frame.data;
        const threshold = config.threshold;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const value = (red + green + blue) / 3;
          const strongestNonGreen = Math.max(red, blue);
          const isGreenScreen =
            green > 48 &&
            green - strongestNonGreen > 18 &&
            green > red * 1.12 &&
            green > blue * 1.12;
          if (!isGreenScreen && value > threshold) {
            const ink = clamp(value * 1.42 + 12, 0, 255);
            data[index] = ink;
            data[index + 1] = ink;
            data[index + 2] = ink;
            data[index + 3] = 255;
          } else {
            data[index + 3] = 0;
          }
        }
        frameContext.putImageData(frame, 0, 0);
        ctx.save();
        ctx.filter = "brightness(0)";
        ctx.globalAlpha = 0.95;
        ctx.drawImage(this.frameCanvas, drawX - 2, drawY, width, height);
        ctx.drawImage(this.frameCanvas, drawX + 2, drawY, width, height);
        ctx.drawImage(this.frameCanvas, drawX, drawY - 2, width, height);
        ctx.drawImage(this.frameCanvas, drawX, drawY + 2, width, height);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.drawImage(this.frameCanvas, drawX, drawY, width, height);
        ctx.restore();
      };

      ctx.save();
      ctx.globalAlpha = 1;
      drawFrame(x, y);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();
    }

    drawSketchRunner(motion) {
      const phase = this.elapsed * 12;
      const ducking = motion === "dash";
      const stride = Math.sin(phase) * 10;
      ctx.save();
      ctx.translate(this.player.w * 0.5, 0);
      ctx.translate(ducking ? 8 : 0, ducking ? -48 : -112);
      ctx.rotate(ducking ? -0.85 : 0);
      ctx.strokeStyle = "#111";
      ctx.lineWidth = 9;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(0, 78);
      ctx.moveTo(-2, 50);
      ctx.lineTo(-20, 68);
      ctx.moveTo(2, 51);
      ctx.lineTo(22, 65);
      ctx.moveTo(0, 78);
      ctx.lineTo(-18 - stride * 0.4, 112);
      ctx.moveTo(0, 78);
      ctx.lineTo(20 + stride * 0.4, 112);
      ctx.stroke();
      ctx.strokeStyle = "#f2f2f2";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(0, 34);
      ctx.lineTo(0, 78);
      ctx.moveTo(-2, 50);
      ctx.lineTo(-20, 68);
      ctx.moveTo(2, 51);
      ctx.lineTo(22, 65);
      ctx.moveTo(0, 78);
      ctx.lineTo(-18 - stride * 0.4, 112);
      ctx.moveTo(0, 78);
      ctx.lineTo(20 + stride * 0.4, 112);
      ctx.stroke();
      ctx.fillStyle = "#111";
      ctx.beginPath();
      ctx.arc(0, 20, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#f2f2f2";
      ctx.beginPath();
      ctx.arc(0, 20, 11, 0, Math.PI * 2);
      ctx.fill();
      for (let i = -4; i <= 4; i += 1) {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(0, 9);
        ctx.lineTo(i * 6, -10 - Math.abs(i) * 2);
        ctx.stroke();
      }
      ctx.restore();
    }

    drawPortraitTrail(character, phase) {
      for (let i = 3; i > 0; i -= 1) {
        ctx.save();
        ctx.globalAlpha = 0.06 + i * 0.045;
        ctx.translate(-i * 18, i * 1.5);
        this.drawSuppliedCharacter(character, phase - i * 0.35, 0, false, true, true);
        ctx.restore();
      }
    }

    drawSuppliedCharacter(character, phase, verticalVelocity, companion = false, dashing = false, isTrail = false) {
      const image = this.characterImages[character];
      const isGirl = character === "girl";
      const size = companion
        ? (this.width < 560 ? 82 : 92)
        : (this.width < 560 ? 96 : 112);
      const radius = size * 0.46;
      const centerX = size * 0.5;
      const bounce = this.state === "running" && this.player.grounded ? Math.abs(Math.sin(phase)) * 4 : 0;
      const centerY = -size * 0.5 - bounce;
      const tilt = dashing ? 0.11 : clamp(-verticalVelocity / 4600 + Math.sin(phase) * 0.025, -0.13, 0.13);
      const crop = isGirl
        ? { x: 58, y: 18, w: 890, h: 890 }
        : { x: 800, y: 88, w: 900, h: 900 };

      ctx.save();
      ctx.translate(centerX, centerY);
      ctx.rotate(tilt);

      if (!isTrail) {
        ctx.fillStyle = "rgba(5, 3, 12, 0.32)";
        ctx.beginPath();
        ctx.ellipse(0, radius + 7 + bounce, radius * 0.78, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        const glow = ctx.createRadialGradient(0, 0, radius * 0.62, 0, 0, radius * 1.22);
        glow.addColorStop(0, "rgba(67, 234, 210, 0)");
        glow.addColorStop(0.72, isGirl ? "rgba(67, 234, 210, 0.2)" : "rgba(249, 199, 79, 0.16)");
        glow.addColorStop(1, "rgba(139, 92, 246, 0)");
        ctx.fillStyle = glow;
        ctx.fillRect(-radius * 1.35, -radius * 1.35, radius * 2.7, radius * 2.7);
      }

      ctx.fillStyle = isGirl ? "#43ead2" : "#f9c74f";
      ctx.beginPath();
      ctx.arc(0, 0, radius + 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#191127";
      ctx.beginPath();
      ctx.arc(0, 0, radius + 1, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, radius - 2, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#f7f1e7";
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      if (image.complete && image.naturalWidth) {
        ctx.drawImage(
          image,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
          -radius,
          -radius,
          radius * 2,
          radius * 2,
        );
      }
      const colorWash = ctx.createLinearGradient(-radius, -radius, radius, radius);
      colorWash.addColorStop(0, isGirl ? "rgba(67, 234, 210, 0.14)" : "rgba(249, 199, 79, 0.11)");
      colorWash.addColorStop(0.5, "rgba(255,255,255,0)");
      colorWash.addColorStop(1, "rgba(139, 92, 246, 0.14)");
      ctx.globalCompositeOperation = "multiply";
      ctx.fillStyle = colorWash;
      ctx.fillRect(-radius, -radius, radius * 2, radius * 2);
      ctx.restore();

      if (!isTrail) {
        ctx.strokeStyle = "#f8f3e8";
        ctx.lineWidth = 2;
        ctx.setLineDash([5, 4]);
        ctx.beginPath();
        ctx.arc(0, 0, radius - 6, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.fillStyle = isGirl ? "#ff6b8a" : "#8b5cf6";
        ctx.fillRect(-radius - 7, -5, 8, 13);
        ctx.fillRect(radius - 1, -5, 8, 13);
        ctx.fillStyle = "#f7f3e8";
        ctx.fillRect(-radius - 5, -2, 4, 7);
        ctx.fillRect(radius + 1, -2, 4, 7);

        const footSwing = this.player.grounded ? Math.sin(phase) * 8 : verticalVelocity < 0 ? 6 : -4;
        ctx.strokeStyle = "#171020";
        ctx.lineWidth = companion ? 5 : 7;
        ctx.lineCap = "square";
        ctx.beginPath();
        ctx.moveTo(-12, radius - 2);
        ctx.lineTo(-14 - footSwing, radius + 12);
        ctx.moveTo(12, radius - 2);
        ctx.lineTo(14 + footSwing, radius + 12);
        ctx.stroke();
        ctx.strokeStyle = isGirl ? "#43ead2" : "#f9c74f";
        ctx.lineWidth = companion ? 2 : 3;
        ctx.beginPath();
        ctx.moveTo(-14 - footSwing, radius + 12);
        ctx.lineTo(-5 - footSwing, radius + 12);
        ctx.moveTo(14 + footSwing, radius + 12);
        ctx.lineTo(23 + footSwing, radius + 12);
        ctx.stroke();

        if (dashing) {
          ctx.strokeStyle = "#aafdf1";
          ctx.lineWidth = 2;
          ctx.globalAlpha = 0.8;
          ctx.beginPath();
          ctx.moveTo(-radius - 10, -24);
          ctx.lineTo(-radius - 40, -24);
          ctx.moveTo(-radius - 6, 0);
          ctx.lineTo(-radius - 50, 0);
          ctx.moveTo(-radius - 10, 24);
          ctx.lineTo(-radius - 34, 24);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawRunnerFigure(character, phase, verticalVelocity, companion = false, dashing = false) {
      const isGirl = character === "girl";
      const airborne = Math.abs(verticalVelocity) > 15 || !this.player.grounded;
      const stride = airborne ? (verticalVelocity < 0 ? 0.75 : -0.55) : Math.sin(phase);
      const arm = airborne ? -0.65 : Math.sin(phase + Math.PI);
      const lean = dashing ? 0.22 : clamp(-verticalVelocity / 5200, -0.1, 0.1);

      ctx.save();
      ctx.rotate(lean);
      if (!companion) {
        ctx.fillStyle = "rgba(5,3,12,.26)";
        ctx.beginPath();
        ctx.ellipse(24, 1, dashing ? 38 : 29, 6, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      const outline = "#161020";
      const skin = isGirl ? "#b87358" : "#9a5d48";
      const hair = isGirl ? "#20142c" : "#171321";
      const jacket = isGirl ? "#d04f73" : "#4f59a8";
      const jacketDark = isGirl ? "#7d274a" : "#28346f";
      const accent = isGirl ? "#43ead2" : "#f9c74f";

      const legSwing = stride * (airborne ? 8 : 11);
      ctx.strokeStyle = outline;
      ctx.lineWidth = 8;
      ctx.lineCap = "square";
      ctx.beginPath();
      ctx.moveTo(18, -29);
      ctx.lineTo(14 - legSwing * 0.45, -13);
      ctx.lineTo(10 - legSwing, -2);
      ctx.moveTo(31, -29);
      ctx.lineTo(34 + legSwing * 0.45, -14);
      ctx.lineTo(39 + legSwing, -2);
      ctx.stroke();
      ctx.strokeStyle = isGirl ? "#ead7b5" : "#b7c8e3";
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.moveTo(18, -28);
      ctx.lineTo(14 - legSwing * 0.45, -13);
      ctx.lineTo(10 - legSwing, -3);
      ctx.moveTo(31, -28);
      ctx.lineTo(34 + legSwing * 0.45, -14);
      ctx.lineTo(39 + legSwing, -3);
      ctx.stroke();
      ctx.fillStyle = outline;
      ctx.fillRect(3 - legSwing, -5, 14, 6);
      ctx.fillRect(33 + legSwing, -5, 15, 6);
      ctx.fillStyle = accent;
      ctx.fillRect(5 - legSwing, -4, 9, 3);
      ctx.fillRect(35 + legSwing, -4, 10, 3);

      ctx.strokeStyle = outline;
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(14, -59);
      ctx.lineTo(5 + arm * 8, -45);
      ctx.lineTo(2 + arm * 13, -31);
      ctx.moveTo(35, -58);
      ctx.lineTo(43 - arm * 8, -45);
      ctx.lineTo(46 - arm * 12, -32);
      ctx.stroke();
      ctx.strokeStyle = jacket;
      ctx.lineWidth = 5;
      ctx.stroke();
      ctx.fillStyle = skin;
      ctx.fillRect(-1 + arm * 13, -35, 7, 7);
      ctx.fillRect(43 - arm * 12, -35, 7, 7);

      ctx.fillStyle = outline;
      ctx.fillRect(10, -67, 29, 41);
      ctx.fillStyle = jacketDark;
      ctx.fillRect(13, -64, 23, 34);
      ctx.fillStyle = jacket;
      ctx.fillRect(15, -62, 19, 27);
      ctx.fillStyle = accent;
      ctx.fillRect(17, -61, 4, 24);
      ctx.fillRect(24, -45, 12, 4);
      ctx.fillStyle = outline;
      ctx.fillRect(11, -31, 28, 6);

      if (isGirl) {
        ctx.fillStyle = accent;
        const scarfWave = dashing ? 24 : 12 + Math.sin(phase * 0.7) * 4;
        ctx.fillRect(29, -64, scarfWave, 5);
        ctx.fillRect(38, -59, Math.max(7, scarfWave - 8), 4);
      } else {
        ctx.fillStyle = "#e9e4db";
        ctx.fillRect(10, -64, 8, 5);
        ctx.fillRect(32, -64, 9, 5);
      }

      ctx.fillStyle = outline;
      ctx.fillRect(14, -91, 23, 27);
      ctx.fillStyle = skin;
      ctx.fillRect(17, -87, 18, 19);
      ctx.fillStyle = hair;
      ctx.fillRect(14, -92, 24, 9);
      ctx.fillRect(14, -86, 5, 12);
      ctx.fillRect(34, -87, 5, 13);
      ctx.fillStyle = "#f8efe5";
      ctx.fillRect(21, -81, 4, 3);
      ctx.fillRect(30, -81, 4, 3);
      ctx.fillStyle = outline;
      ctx.fillRect(22, -80, 3, 2);
      ctx.fillRect(30, -80, 3, 2);

      if (isGirl) {
        const braids = [
          [-2, -91], [4, -98], [11, -101], [19, -103], [28, -102], [36, -98], [43, -91],
          [9, -108], [21, -111], [33, -107],
        ];
        for (const [x, y] of braids) {
          ctx.fillStyle = outline;
          ctx.fillRect(x - 1, y - 1, 8, 10);
          ctx.fillStyle = hair;
          ctx.fillRect(x + 1, y + 1, 5, 7);
        }
        ctx.fillStyle = hair;
        ctx.fillRect(8, -86, 7, 28);
        ctx.fillRect(37, -85, 7, 26);
        ctx.fillStyle = accent;
        ctx.fillRect(7, -86, 37, 3);
      } else {
        ctx.fillStyle = hair;
        const locks = [[11, -98], [16, -103], [22, -98], [28, -105], [34, -98], [39, -101]];
        for (const [x, y] of locks) ctx.fillRect(x, y, 7, 13);
      }

      if (dashing) {
        ctx.strokeStyle = "#aafdf1";
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.75;
        ctx.beginPath();
        ctx.moveTo(-12, -82);
        ctx.lineTo(-41, -82);
        ctx.moveTo(-8, -55);
        ctx.lineTo(-52, -55);
        ctx.moveTo(-5, -25);
        ctx.lineTo(-35, -25);
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
      ctx.restore();
    }

    drawObstacle(obstacle) {
      ctx.save();
      ctx.translate(Math.round(obstacle.x), Math.round(obstacle.y));
      const w = obstacle.w;
      const h = obstacle.h;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const poly = (points, fill, stroke = "#111", lineWidth = 2) => {
        ctx.beginPath();
        points.forEach(([px, py], index) => {
          if (index === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        });
        ctx.closePath();
        ctx.fillStyle = fill;
        ctx.fill();
        ctx.strokeStyle = stroke;
        ctx.lineWidth = lineWidth;
        ctx.stroke();
      };

      const sketchLine = (x1, y1, x2, y2, alpha = 0.5) => {
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = "#f2f2f2";
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.restore();
      };

      ctx.fillStyle = "rgba(0,0,0,.26)";
      ctx.fillRect(5, h - 3, w + 10, 6);

      if (obstacle.type === "rubble") {
        ctx.fillStyle = "#111";
        ctx.fillRect(3, h - 12, w - 3, 12);
        poly([[2, h - 8], [10, h - 28], [30, h - 34], [43, h - 20], [36, h - 5]], "#5d5d5d");
        poly([[25, h - 6], [34, h - 39], [56, h - 34], [w - 4, h - 16], [w - 18, h - 5]], "#7b7b7b");
        poly([[8, h - 3], [17, h - 22], [37, h - 20], [50, h - 7]], "#333");
        sketchLine(12, h - 25, 27, h - 30, 0.55);
        sketchLine(39, h - 34, 55, h - 28, 0.45);
      } else if (obstacle.type === "barrier") {
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 4;
        ctx.strokeRect(4, 8, w - 8, h - 16);
        ctx.fillStyle = "#ededed";
        ctx.fillRect(9, 15, w - 18, h - 30);
        ctx.fillStyle = "#2e2e2e";
        for (let x = 10; x < w - 8; x += 19) {
          ctx.beginPath();
          ctx.moveTo(x, 15);
          ctx.lineTo(x + 10, 15);
          ctx.lineTo(x - 4, h - 15);
          ctx.lineTo(x - 14, h - 15);
          ctx.fill();
        }
        ctx.fillStyle = "#151515";
        ctx.fillRect(0, h - 13, w, 9);
        ctx.fillRect(8, h - 6, 8, 8);
        ctx.fillRect(w - 16, h - 6, 8, 8);
        ctx.fillStyle = Math.sin(this.elapsed * 8 + obstacle.seed) > 0 ? "#f2f2f2" : "#777";
        ctx.fillRect(w / 2 - 4, 2, 8, 8);
      } else if (obstacle.type === "spike") {
        poly(
          [
            [0, h],
            [5, h * 0.66],
            [13, h * 0.8],
            [18, h * 0.23],
            [28, h * 0.66],
            [35, 2],
            [43, h * 0.65],
            [w, h],
          ],
          "#161616",
          "#050505",
          2.5,
        );
        sketchLine(20, h * 0.26, 24, h * 0.78, 0.42);
        sketchLine(36, 7, 40, h * 0.72, 0.42);
        ctx.fillStyle = "#f2f2f2";
        ctx.globalAlpha = 0.75;
        ctx.fillRect(5, h - 6, w - 10, 4);
        ctx.globalAlpha = 1;
      } else if (obstacle.type === "overhead") {
        const flicker = Math.sin(this.elapsed * 10 + obstacle.seed) > 0;
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, 11);
        ctx.fillRect(0, h - 13, w, 13);
        ctx.fillRect(0, 5, 9, h - 8);
        ctx.fillRect(w - 9, 5, 9, h - 8);
        ctx.strokeStyle = "#f2f2f2";
        ctx.globalAlpha = 0.34;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(17, 16);
        ctx.lineTo(17, h - 16);
        ctx.moveTo(w - 17, 16);
        ctx.lineTo(w - 17, h - 16);
        ctx.stroke();
        ctx.globalAlpha = 1;
        ctx.fillStyle = flicker ? "#f2f2f2" : "#bdbdbd";
        ctx.fillRect(18, 18, w - 36, 7);
        ctx.fillRect(27, 32, w - 54, 5);
        ctx.fillStyle = "#111";
        for (let x = 22; x < w - 18; x += 18) {
          poly([[x, h - 13], [x + 8, h - 1], [x + 16, h - 13]], "#111", "#111", 1);
        }
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(7, 3, 12, 4);
        ctx.fillRect(w - 19, h - 7, 12, 4);
      } else {
        ctx.fillStyle = "#111";
        ctx.fillRect(0, 0, w, h);
        ctx.fillStyle = "#8b8b8b";
        ctx.fillRect(5, 5, w - 10, h - 10);
        ctx.fillStyle = "#d8d8d8";
        ctx.fillRect(9, 9, w - 18, 7);
        ctx.strokeStyle = "#222";
        ctx.lineWidth = 4;
        ctx.strokeRect(6, 6, w - 12, h - 12);
        ctx.beginPath();
        ctx.moveTo(9, 9);
        ctx.lineTo(w - 9, h - 9);
        ctx.moveTo(w - 9, 9);
        ctx.lineTo(9, h - 9);
        ctx.moveTo(6, h / 2);
        ctx.lineTo(w - 6, h / 2);
        ctx.stroke();
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(w - 12, 6, 6, 6);
      }
      ctx.restore();
    }

    drawParticles() {
      ctx.save();
      for (const particle of this.particles) {
        ctx.globalAlpha = clamp(particle.life / particle.maxLife, 0, 1);
        ctx.fillStyle = particle.color;
        ctx.fillRect(Math.round(particle.x), Math.round(particle.y), Math.ceil(particle.size), Math.ceil(particle.size));
      }
      ctx.restore();
    }

    drawForeground() {
      const gradient = ctx.createLinearGradient(0, 0, this.width, 0);
      gradient.addColorStop(0, "rgba(6,3,15,.32)");
      gradient.addColorStop(0.15, "rgba(6,3,15,0)");
      gradient.addColorStop(0.85, "rgba(6,3,15,0)");
      gradient.addColorStop(1, "rgba(6,3,15,.25)");
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    snapshot() {
      return {
        state: this.state,
        distance: Math.floor(this.distance),
        speed: Math.round(this.speed),
        obstacleCount: this.obstacles.length,
        obstacles: this.obstacles.slice(0, 4).map((obstacle) => ({
          type: obstacle.type,
          x: Math.round(obstacle.x),
          w: Math.round(obstacle.w),
          breakable: obstacle.breakable,
          overhead: obstacle.overhead,
        })),
        player: {
          y: Math.round(this.player.y),
          grounded: this.player.grounded,
          dashReady: this.player.dashCooldown <= 0,
          dashActive: this.player.dashTime > 0,
          ducking: this.player.duckTime > 0 && this.player.grounded,
        },
        viewport: { width: Math.round(this.width), height: Math.round(this.height), dpr: this.dpr },
      };
    }
  }

  const sound = new SoundEngine();
  const game = new RunnerGame();

  const story = {
    index: 0,
    typingTimer: null,
    typing: false,
    fullAmharic: "",
    fullEnglish: "",

    show(index = 0) {
      this.index = clamp(index, 0, dialogue.length - 1);
      game.state = "story";
      ui.hud.classList.remove("is-visible");
      ui.pause.classList.remove("is-visible");
      ui.gameover.classList.remove("is-visible");
      ui.story.classList.remove("is-hidden");
      this.render();
    },

    render() {
      clearInterval(this.typingTimer);
      const line = dialogue[this.index];
      const isGirl = line.speaker === "girl";
      ui.girlPortrait.classList.toggle("active", isGirl);
      ui.boyPortrait.classList.toggle("active", !isGirl);
      ui.count.textContent = `${String(this.index + 1).padStart(2, "0")} / ${String(dialogue.length).padStart(2, "0")}`;
      ui.progress.style.width = `${((this.index + 1) / dialogue.length) * 100}%`;
      ui.speaker.textContent = line.name;
      ui.speakerRole.textContent = line.role;
      ui.nextLabel.textContent = this.index === dialogue.length - 1 ? "ጀምር · START" : "ቀጥል · NEXT";
      this.fullAmharic = line.am;
      this.fullEnglish = line.en;
      ui.amharic.textContent = "";
      ui.english.textContent = "";
      ui.amharic.classList.remove("is-complete");
      this.typing = true;

      if (prefersReducedMotion) {
        this.finishTyping();
        return;
      }

      const combined = `${line.am}\n${line.en}`;
      let cursor = 0;
      this.typingTimer = setInterval(() => {
        cursor += 1;
        const visible = combined.slice(0, cursor);
        const [am = "", en = ""] = visible.split("\n");
        ui.amharic.textContent = am;
        ui.english.textContent = en;
        if (cursor % 4 === 0) sound.tick();
        if (cursor >= combined.length) this.finishTyping();
      }, 22);
    },

    finishTyping() {
      clearInterval(this.typingTimer);
      this.typing = false;
      ui.amharic.textContent = this.fullAmharic;
      ui.english.textContent = this.fullEnglish;
      ui.amharic.classList.add("is-complete");
    },

    next() {
      sound.ensure();
      if (this.typing) {
        this.finishTyping();
        return;
      }
      sound.tone(520, 0.055, "square", 0.025, 55);
      if (this.index < dialogue.length - 1) {
        this.index += 1;
        this.render();
      } else {
        this.skip();
      }
    },

    skip() {
      clearInterval(this.typingTimer);
      this.typing = false;
      ui.story.classList.add("is-hidden");
      ui.countdown.classList.remove("is-visible");
      countdown.token += 1;
      game.start();
    },
  };

  const countdown = {
    token: 0,
    begin() {
      this.token += 1;
      const token = this.token;
      game.state = "countdown";
      ui.hud.classList.add("is-visible");
      ui.gameover.classList.remove("is-visible");
      ui.countdown.classList.add("is-visible");
      const steps = ["3", "2", "1", "GO!"];
      let index = 0;
      const showStep = () => {
        if (token !== this.token) return;
        ui.countdownText.textContent = steps[index];
        ui.countdownText.style.animation = "none";
        void ui.countdownText.offsetWidth;
        ui.countdownText.style.animation = "";
        sound.tone(index === 3 ? 660 : 330 + index * 70, 0.08, "square", 0.035, index === 3 ? 120 : 0);
        index += 1;
        if (index < steps.length) {
          setTimeout(showStep, index === 3 ? 640 : 700);
        } else {
          setTimeout(() => {
            if (token !== this.token) return;
            ui.countdown.classList.remove("is-visible");
            game.start();
          }, 520);
        }
      };
      showStep();
    },
  };

  ui.next.addEventListener("click", () => story.next());
  ui.skip.addEventListener("click", () => story.skip());
  $("#resumeButton").addEventListener("click", () => game.togglePause(false));
  $("#restartButton").addEventListener("click", () => game.restart());
  $("#storyAgainButton").addEventListener("click", () => story.show(0));
  ui.pauseButton.addEventListener("click", () => game.togglePause());
  ui.sound.addEventListener("click", () => {
    const muted = sound.toggle();
    ui.sound.classList.toggle("is-muted", muted);
    ui.sound.setAttribute("aria-label", muted ? "Unmute sound" : "Mute sound");
  });
  $(".brand").addEventListener("click", (event) => {
    event.preventDefault();
    story.show(0);
  });

  document.addEventListener("visibilitychange", () => {
    if (document.hidden && game.state === "running") game.togglePause(true);
  });

  window.__runnerGame = {
    snapshot: () => game.snapshot(),
    startNow: () => {
      ui.story.classList.add("is-hidden");
      ui.countdown.classList.remove("is-visible");
      countdown.token += 1;
      game.start();
    },
    spawnObstacle: (type) => game.spawnObstacle(type),
    jump: () => game.queueJump(),
    dash: () => game.dash(),
    story: () => story.show(0),
    restart: () => game.restart(),
    clearObstacles: () => {
      game.obstacles.length = 0;
    },
    holdSpawns: (seconds = 6) => {
      game.spawnTimer = seconds;
    },
  };

  story.show(0);
})();
