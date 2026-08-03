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
      name: "Kobi",
      role: "CITY RUNNER // 01",
      am: "ዛሬ አንድ ካይጁ የአዲስ አበባን ታሪካዊ ቦታዎች ሊያጠፋ መጥቷል።",
      en: "A Kaiju has come to destroy the historic landmarks of Addis Ababa.",
    },
    {
      speaker: "boy",
      name: "Thomas",
      role: "SCOUT // 02",
      am: "ገንዘቤ፣ ከተማዋን እንዴት እናድናት?",
      en: "Kobi, what should we do? The streets are already blocked.",
    },
    {
      speaker: "girl",
      name: "Kobi",
      role: "CITY RUNNER // 01",
      am: "እንሮጣለን፣ እንዘላለን፣ ሁሉንም መሰናክል እናልፋለን!",
      en: "We run, we jump, and we overcome every obstacle in our way.",
    },
    {
      speaker: "girl",
      name: "Kobi",
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
      this.slideHeld = false;
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
      this.monster = {
        x: 0,
        y: 0,
        w: 128,
        h: 142,
        bob: 0,
      };
      this.groundImage = new Image();
      this.characterImages = {
        girl: new Image(),
        boy: new Image(),
      };
      this.dashFrameImage = new Image();
      this.obstacleImages = {};
      this.characterImages.girl.src = "./girl.png";
      this.characterImages.boy.src = "./boy.png";
      this.dashFrameImage.src = "./dash-frame.png";
      this.characterVideos = {
        run: this.createCharacterVideo("./Run.mp4", true),
        jump: this.createCharacterVideo("./Jump.mp4", false),
        dash: this.createCharacterVideo("./Dash.mp4", false, 0.34),
      };
      this.monsterVideo = this.createCharacterVideo("./monster.mp4", true);
      Object.entries({
        plane: "./obstacle-plane.png",
        truck: "./obstacle-truck.png",
        tower: "./obstacle-tower.png",
        car: "./obstacle-car.png",
        bus: "./obstacle-bus.png",
      }).forEach(([name, source]) => {
        const image = new Image();
        image.src = source;
        this.obstacleImages[name] = image;
      });
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
      this.groundImage.src = "./ground.png";
      this.resize();
      window.addEventListener("resize", () => this.resize());
      this.bindInput();
      ui.best.textContent = pad(this.best);
      requestAnimationFrame((time) => this.loop(time));
    }

    createCharacterVideo(source, loop, warmFrame = 0) {
      const video = document.createElement("video");
      video.src = source;
      video.muted = true;
      video.loop = loop;
      video.playsInline = true;
      video.preload = "auto";
      video.setAttribute("aria-hidden", "true");
      if (warmFrame > 0) {
        video.addEventListener("loadedmetadata", () => {
          try {
            video.currentTime = warmFrame;
          } catch {}
        }, { once: true });
      }
      video.load();
      return video;
    }

    playCharacterVideo(name, restart = false) {
      const video = this.characterVideos[name];
      if (!video) return;
      if (restart) {
        try {
          video.currentTime = name === "dash" ? 0.34 : 0;
        } catch {}
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

    ensureBackgroundReady() {
      if (!this.groundImage.naturalWidth) return;
      if (!this.landmarkReady) this.buildLandmarkCache();
      if (!this.backgroundReady) this.buildBackgroundCache();
    }

    preloadMap() {
      if (this.mapReadyPromise) return this.mapReadyPromise;
      this.mapReadyPromise = new Promise((resolve) => {
        const finish = () => {
          this.backgroundCacheKey = "";
          this.backgroundReady = false;
          this.buildLandmarkCache();
          this.buildBackgroundCache();
          resolve();
        };
        if (this.groundImage.complete && this.groundImage.naturalWidth) {
          if (this.groundImage.decode) {
            this.groundImage.decode().catch(() => {}).then(finish);
          } else {
            finish();
          }
          return;
        }
        this.groundImage.addEventListener("load", () => {
          if (this.groundImage.decode) {
            this.groundImage.decode().catch(() => {}).then(finish);
          } else {
            finish();
          }
        }, { once: true });
        this.groundImage.addEventListener("error", finish, { once: true });
      });
      return this.mapReadyPromise;
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
      this.monster.w = this.width < 560 ? 112 : 148;
      this.monster.h = this.width < 560 ? 124 : 164;
      if (this.player.grounded || this.state !== "running") this.player.y = this.groundY - this.player.h;
      if (this.state !== "running") {
        this.monster.x = this.player.x - this.monster.w * 0.9;
        this.monster.y = this.groundY - this.monster.h;
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
        if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "ArrowDown" || event.code === "KeyD") {
          this.slideHeld = true;
          this.dash();
        }
      });

      window.addEventListener("keyup", (event) => {
        if (event.code === "ShiftLeft" || event.code === "ShiftRight" || event.code === "ArrowDown" || event.code === "KeyD") {
          this.slideHeld = false;
        }
      });

      const press = (element, action) => {
        element.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          action();
        });
      };
      press($("#jumpButton"), () => this.queueJump());
      const dashButton = $("#dashButton");
      dashButton.addEventListener("pointerdown", (event) => {
        event.preventDefault();
        this.slideHeld = true;
        this.dash();
      });
      dashButton.addEventListener("pointerup", () => {
        this.slideHeld = false;
      });
      dashButton.addEventListener("pointercancel", () => {
        this.slideHeld = false;
      });
      canvas.addEventListener("pointerdown", (event) => {
        if (this.state === "running" && event.pointerType !== "mouse") this.queueJump();
      });
    }

    queueJump() {
      if (this.state !== "running") return;
      if (this.player.grounded || this.player.coyote > 0) {
        this.performJump();
        return;
      }
      this.player.jumpBuffer = 0.13;
      sound.ensure();
    }

    performJump() {
      this.slideHeld = false;
      this.player.jumpBuffer = 0;
      this.player.coyote = 0;
      this.player.duckTime = 0;
      this.player.grounded = false;
      this.player.vy = -Math.max(720, this.height * 0.84);
      this.playCharacterVideo("jump", true);
      sound.jump();
      this.makeDust(this.player.x + 20, this.groundY - 3, 8);
    }

    dash() {
      if (this.state !== "running" || !this.player.grounded) return;
      if (this.player.dashCooldown > 0) {
        this.player.duckTime = Math.max(this.player.duckTime, 0.26);
        this.holdDashPose();
        return;
      }
      this.player.dashTime = 1.16;
      this.player.dashCooldown = 1.08;
      this.player.duckTime = 1.16;
      this.holdDashPose();
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
      this.slideHeld = false;
      this.player.y = this.groundY - this.player.h;
      this.player.vy = 0;
      this.player.grounded = true;
      this.player.dashTime = 0;
      this.player.dashCooldown = 0;
      this.player.duckTime = 0;
      this.monster.x = this.player.x - this.monster.w * 0.94;
      this.monster.y = this.groundY - this.monster.h;
      this.ensureBackgroundReady();
      this.refreshBackgroundAfterStart();
      ui.hud.classList.add("is-visible");
      ui.pause.classList.remove("is-visible");
      ui.gameover.classList.remove("is-visible");
      ui.location.textContent = locations[0].label;
      this.playCharacterVideo("run", true);
      try {
        this.monsterVideo.currentTime = 0;
      } catch {}
      const monsterPlayback = this.monsterVideo.play();
      if (monsterPlayback?.catch) monsterPlayback.catch(() => {});
      sound.start();
    }

    refreshBackgroundAfterStart() {
      [80, 280, 700, 1200].forEach((delay) => {
        setTimeout(() => {
          if (!["running", "paused", "gameover"].includes(this.state)) return;
          if (!this.groundImage.naturalWidth) return;
          this.backgroundCacheKey = "";
          this.backgroundReady = false;
          this.buildLandmarkCache();
          this.buildBackgroundCache();
        }, delay);
      });
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
      for (const video of Object.values(this.characterVideos)) {
        video.pause();
      }
      this.monsterVideo.pause();
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
        ? ["car", "truck", "tower"]
        : ["car", "truck", "bus", "tower", "plane"];
      const requestedType = forcedType === "spike" ? "tower" : forcedType;
      const type = requestedType || pool[Math.floor(Math.random() * pool.length)];
      const config = {
        car: { w: 126, h: 70, breakable: false, image: true, inset: 18, collisionTop: 14, collisionBottom: 12 },
        truck: { w: 142, h: 76, breakable: false, image: true, inset: 18, collisionTop: 14, collisionBottom: 10 },
        bus: { w: 176, h: 82, breakable: false, image: true, inset: 20, collisionTop: 12, collisionBottom: 10 },
        tower: { w: 84, h: 132, breakable: false, image: true, inset: 14, collisionTop: 8, collisionBottom: 8 },
        plane: { w: 206, h: 76, breakable: false, overhead: true, image: true, inset: 28 },
        rubble: { w: 88, h: 50, breakable: false },
        barrier: { w: 82, h: 74, breakable: false },
        blockade: { w: 96, h: 72, breakable: false },
        crate: { w: 74, h: 64, breakable: true },
        overhead: { w: 146, h: 60, breakable: false, overhead: true },
      }[type];
      const mobileScale = this.width < 560 ? 0.82 : 1;
      const width = config.w * mobileScale;
      const height = config.h * mobileScale;
      this.obstacles.push({
        type,
        x: this.width + 70,
        y: config.overhead ? this.groundY - this.player.h * 1.38 : this.groundY - height,
        w: width,
        h: height,
        breakable: config.breakable,
        overhead: Boolean(config.overhead),
        imageKey: config.image ? type : "",
        inset: config.inset,
        collisionTop: config.collisionTop,
        collisionBottom: config.collisionBottom,
        passed: false,
        seed: Math.random() * 10,
      });
    }

    update(dt) {
      this.elapsed += dt;
      if (this.state === "gameover") return;
      this.updateParticles(dt);
      if (this.state !== "running") return;

      this.speed = Math.min(535, 305 + this.distance * 0.105);
      const dashBoost = this.player.dashTime > 0 ? 70 : 0;
      const worldSpeed = this.speed + dashBoost;
      this.scroll += worldSpeed * dt;
      this.distance += worldSpeed * dt * 0.075;

      this.player.jumpBuffer = Math.max(0, this.player.jumpBuffer - dt);
      const wasDucking = this.player.duckTime > 0 && this.player.grounded;
      this.player.dashTime = Math.max(0, this.player.dashTime - dt);
      this.player.dashCooldown = Math.max(0, this.player.dashCooldown - dt);
      this.player.duckTime = this.player.grounded ? Math.max(0, this.player.duckTime - dt) : 0;
      if (this.slideHeld && this.player.grounded) {
        this.player.duckTime = Math.max(this.player.duckTime, 0.18);
      }
      this.player.coyote = this.player.grounded ? 0.1 : Math.max(0, this.player.coyote - dt);
      const dashVideo = this.characterVideos.dash;
      if (this.player.duckTime > 0 && this.player.grounded && dashVideo?.readyState >= 2) {
        this.holdDashPose();
      } else if (wasDucking && this.player.grounded) {
        this.playCharacterVideo("run", true);
      }

      if (this.player.jumpBuffer > 0 && this.player.coyote > 0) {
        this.performJump();
      }

      const gravity = Math.max(1350, this.height * 1.6);
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
      this.updateMonster(dt);

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
      const airborne = !this.player.grounded;
      const playerBox = ducking
        ? {
            x: this.player.x - this.player.w * 0.04,
            y: this.groundY - this.player.h * 0.39,
            w: this.player.w * 1.2,
            h: this.player.h * 0.3,
          }
        : airborne
          ? {
              x: this.player.x + this.player.w * 0.32,
              y: this.player.y + this.player.h * 0.13,
              w: this.player.w * 0.62,
              h: this.player.h * 0.54,
            }
          : {
            x: this.player.x + this.player.w * 0.2,
            y: this.player.y + this.player.h * 0.08,
            w: this.player.w * 0.92,
            h: this.player.h * 0.86,
          };

      for (let index = this.obstacles.length - 1; index >= 0; index -= 1) {
        const obstacle = this.obstacles[index];
        if (obstacle.x + obstacle.w < -40) {
          this.obstacles.splice(index, 1);
          continue;
        }
        const horizontalInset = obstacle.inset ?? (obstacle.overhead ? 22 : 10);
        const obstacleLeft = obstacle.x + horizontalInset;
        const obstacleRight = obstacle.x + obstacle.w - horizontalInset;
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
          y: obstacle.y + (obstacle.collisionTop ?? 13),
          w: Math.max(8, obstacle.w - horizontalInset * 2),
          h: Math.max(8, obstacle.h - (obstacle.collisionTop ?? 13) - (obstacle.collisionBottom ?? 5)),
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

    updateMonster(dt) {
      const dashPull = this.player.dashTime > 0 ? 26 : 0;
      const jumpPull = this.player.grounded ? 0 : 18;
      const tension = clamp(this.distance / 900, 0, 1) * 20;
      const targetX = this.player.x - this.monster.w * 0.78 - 52 + dashPull + jumpPull + tension;
      const targetY = this.groundY - this.monster.h + Math.sin(this.elapsed * 8.5) * 4;
      const chase = clamp(dt * (3.1 + tension * 0.04), 0, 1);
      this.monster.x = lerp(this.monster.x || targetX, targetX, chase);
      this.monster.y = lerp(this.monster.y || targetY, targetY, clamp(dt * 9, 0, 1));
    }

    holdDashPose() {
      const dashVideo = this.characterVideos.dash;
      if (!dashVideo) return;
      try {
        if (Math.abs(dashVideo.currentTime - 0.34) > 0.04 || dashVideo.ended) dashVideo.currentTime = 0.34;
        dashVideo.pause();
      } catch {}
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
      this.drawRoad();
      for (const obstacle of this.obstacles) this.drawObstacle(obstacle);
      this.drawMonster();
      this.drawPlayer();
      this.drawParticles();
      this.drawForeground();
      ctx.restore();
    }

    drawBackground() {
      ctx.fillStyle = "#d2d2d2";
      ctx.fillRect(0, 0, this.width, this.height);
      this.ensureBackgroundReady();

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

    drawMonster() {
      const video = this.monsterVideo;
      const x = Math.round(this.monster.x);
      const y = Math.round(this.monster.y);
      const w = this.monster.w;
      const h = this.monster.h;
      ctx.save();
      ctx.globalAlpha = this.state === "running" ? 0.94 : 0.72;
      ctx.fillStyle = "rgba(0,0,0,.34)";
      ctx.beginPath();
      ctx.ellipse(x + w * 0.5, this.groundY + 7, w * 0.42, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.translate(x, y);
      if (video?.readyState >= 2) {
        ctx.save();
        ctx.shadowColor = "rgba(0,0,0,.38)";
        ctx.shadowBlur = 12;
        ctx.drawImage(video, 0, 0, w, h);
        ctx.restore();
      } else {
        ctx.fillStyle = "#333";
        ctx.strokeStyle = "#111";
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(w * 0.2, h);
        ctx.lineTo(w * 0.42, h * 0.18);
        ctx.lineTo(w * 0.62, h * 0.18);
        ctx.lineTo(w * 0.86, h);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = "#0f0f0f";
        ctx.fillRect(w * 0.42, h * 0.05, w * 0.18, h * 0.2);
        ctx.fillStyle = "#f2f2f2";
        ctx.fillRect(w * 0.45, h * 0.3, w * 0.12, h * 0.04);
      }
      ctx.restore();
    }

    drawPlayer() {
      const jumpLift = this.player.y + this.player.h - this.groundY;
      const ducking = this.player.duckTime > 0 && this.player.grounded;
      const motion = ducking
        ? "dash"
        : (this.player.grounded ? "run" : "jump");
      const video = this.characterVideos[motion];
      ctx.save();
      ctx.translate(this.player.x, this.groundY + jumpLift);
      const fallbackVideo = this.characterVideos.run;
      if (motion === "dash") {
        const drewDashVideo = video?.readyState >= 2 ? this.drawVideoCharacter(video, "dash") : false;
        if (!drewDashVideo) this.drawDuckFallback();
      } else if (video?.readyState >= 2 || fallbackVideo?.readyState >= 2) {
        this.drawVideoCharacter(video?.readyState >= 2 ? video : fallbackVideo, video?.readyState >= 2 ? motion : "run");
      }
      ctx.restore();
    }

    drawVideoCharacter(video, motion) {
      const mobileScale = this.width < 560 ? 0.9 : 1;
      const config = {
        run: { x: -48, y: -211, height: 222, source: [58, 6, 178, 170], highSource: [250, 35, 560, 640] },
        jump: { x: -44, y: -240, height: 256, source: [62, 0, 145, 180], highSource: [300, 0, 700, 980] },
        dash: { x: -64, y: -136, height: 138, source: [32, 30, 205, 148], highSource: [230, 230, 600, 390] },
      }[motion];
      const source = video.videoWidth > 500 && config.highSource ? config.highSource : config.source;
      const sourceAspect = source ? source[2] / source[3] : (video.videoWidth || 1) / (video.videoHeight || 1);
      const x = config.x * mobileScale;
      const y = config.y * mobileScale;
      const height = config.height * mobileScale;
      const width = height * sourceAspect;
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
        let visiblePixels = 0;
        for (let index = 0; index < data.length; index += 4) {
          const red = data[index];
          const green = data[index + 1];
          const blue = data[index + 2];
          const value = (red + green + blue) / 3;
          const strongestNonGreen = Math.max(red, blue);
          const isGreenScreen =
            green > 40 &&
            green - strongestNonGreen > 10 &&
            green > red * 1.04 &&
            green > blue * 1.04;
          if (!isGreenScreen) {
            const ink = clamp(value * 1.04, 0, 255);
            data[index] = ink;
            data[index + 1] = ink;
            data[index + 2] = ink;
            data[index + 3] = 255;
            if (value < 248) visiblePixels += 1;
          } else {
            data[index + 3] = 0;
          }
        }
        if (visiblePixels < Math.max(80, frameWidth * frameHeight * 0.012)) return false;
        frameContext.putImageData(frame, 0, 0);
        ctx.save();
        if (motion !== "dash") {
          ctx.filter = "brightness(0)";
          ctx.globalAlpha = 0.55;
          ctx.drawImage(this.frameCanvas, drawX - 1, drawY, width, height);
          ctx.drawImage(this.frameCanvas, drawX + 1, drawY, width, height);
          ctx.drawImage(this.frameCanvas, drawX, drawY - 1, width, height);
          ctx.drawImage(this.frameCanvas, drawX, drawY + 1, width, height);
          ctx.filter = "none";
        }
        ctx.globalAlpha = 1;
        ctx.drawImage(this.frameCanvas, drawX, drawY, width, height);
        ctx.restore();
        return true;
      };

      ctx.save();
      ctx.globalAlpha = 1;
      const didDraw = drawFrame(x, y);
      ctx.filter = "none";
      ctx.globalAlpha = 1;
      ctx.restore();
      return didDraw;
    }

    drawDuckFallback() {
      const image = this.dashFrameImage;
      if (image?.complete && image.naturalWidth > 0) {
        const mobileScale = this.width < 560 ? 0.9 : 1;
        const height = 138 * mobileScale;
        const width = height * (image.naturalWidth / image.naturalHeight);
        const x = -64 * mobileScale;
        const y = -136 * mobileScale;
        ctx.save();
        ctx.filter = "brightness(0)";
        ctx.globalAlpha = 0.55;
        ctx.drawImage(image, x - 1, y, width, height);
        ctx.drawImage(image, x + 1, y, width, height);
        ctx.drawImage(image, x, y - 1, width, height);
        ctx.drawImage(image, x, y + 1, width, height);
        ctx.filter = "none";
        ctx.globalAlpha = 1;
        ctx.drawImage(image, x, y, width, height);
        ctx.restore();
        return;
      }

      ctx.save();
      ctx.translate(-15, -93);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#111";
      ctx.fillStyle = "#f4f4f4";
      ctx.lineWidth = 7;

      ctx.beginPath();
      ctx.ellipse(50, 62, 40, 18, -0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#111";
      ctx.fillRect(54, 50, 38, 12);
      ctx.fillStyle = "#f4f4f4";
      ctx.fillRect(22, 49, 31, 18);
      ctx.strokeRect(22, 49, 31, 18);

      ctx.beginPath();
      ctx.arc(84, 41, 17, 0, Math.PI * 2);
      ctx.fillStyle = "#f4f4f4";
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#111";
      for (let i = 0; i < 9; i += 1) {
        const angle = -2.8 + i * 0.35;
        ctx.beginPath();
        ctx.moveTo(82, 30);
        ctx.lineTo(82 + Math.cos(angle) * (20 + (i % 3) * 4), 30 + Math.sin(angle) * 22);
        ctx.stroke();
      }

      ctx.strokeStyle = "#111";
      ctx.lineWidth = 8;
      ctx.beginPath();
      ctx.moveTo(54, 69);
      ctx.lineTo(22, 88);
      ctx.lineTo(2, 82);
      ctx.moveTo(58, 72);
      ctx.lineTo(92, 91);
      ctx.lineTo(113, 85);
      ctx.moveTo(79, 58);
      ctx.lineTo(106, 50);
      ctx.moveTo(35, 57);
      ctx.lineTo(8, 62);
      ctx.stroke();

      ctx.lineWidth = 3;
      ctx.strokeStyle = "#f4f4f4";
      ctx.beginPath();
      ctx.moveTo(31, 54);
      ctx.lineTo(48, 65);
      ctx.moveTo(64, 58);
      ctx.lineTo(84, 64);
      ctx.stroke();
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

    drawImageObstacle(image, obstacle, w, h) {
      const wobble = Math.sin(this.elapsed * 4 + obstacle.seed) * (obstacle.overhead ? 2 : 0.8);
      ctx.save();
      ctx.translate(0, wobble);
      ctx.shadowColor = "rgba(0,0,0,.24)";
      ctx.shadowBlur = 8;
      ctx.shadowOffsetY = 3;
      ctx.drawImage(image, 0, 0, w, h);
      ctx.restore();
      if (obstacle.overhead) {
        ctx.save();
        ctx.globalAlpha = 0.7 + Math.sin(this.elapsed * 10 + obstacle.seed) * 0.16;
        ctx.strokeStyle = "#f2f2f2";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(10, h + 6);
        ctx.lineTo(w - 12, h + 6);
        ctx.stroke();
        ctx.restore();
      }
    }

    drawObstacle(obstacle) {
      ctx.save();
      ctx.translate(Math.round(obstacle.x), Math.round(obstacle.y));
      const w = obstacle.w;
      const h = obstacle.h;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      const image = obstacle.imageKey ? this.obstacleImages[obstacle.imageKey] : null;
      if (image?.complete && image.naturalWidth > 0) {
        ctx.fillStyle = "rgba(0,0,0,.26)";
        ctx.fillRect(6, h - 4, w + 8, 7);
        this.drawImageObstacle(image, obstacle, w, h);
        ctx.restore();
        return;
      }

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
        ctx.fillRect(0, h - 12, w, 12);
        poly([[4, h - 11], [16, h - 34], [34, h - 40], [50, h - 23], [42, h - 6]], "#4c4c4c", "#111", 3);
        poly([[31, h - 8], [42, h - 43], [66, h - 38], [w - 3, h - 19], [w - 18, h - 5]], "#777", "#111", 3);
        poly([[11, h - 4], [22, h - 26], [42, h - 24], [58, h - 7]], "#2d2d2d", "#111", 2.5);
        ctx.strokeStyle = "#ededed";
        ctx.lineWidth = 2;
        sketchLine(14, h - 29, 31, h - 35, 0.5);
        sketchLine(45, h - 38, 64, h - 31, 0.45);
        sketchLine(w - 31, h - 24, w - 14, h - 18, 0.35);
      } else if (obstacle.type === "barrier") {
        poly([[5, 18], [w - 8, 10], [w - 2, h - 15], [1, h - 6]], "#111", "#111", 2);
        poly([[11, 23], [w - 15, 17], [w - 12, h - 24], [9, h - 17]], "#dcdcdc", "#111", 3);
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(11, 23);
        ctx.lineTo(w - 15, 17);
        ctx.lineTo(w - 12, h - 24);
        ctx.lineTo(9, h - 17);
        ctx.closePath();
        ctx.clip();
        ctx.fillStyle = "#2c2c2c";
        for (let x = -8; x < w + 18; x += 22) {
          ctx.beginPath();
          ctx.moveTo(x, 17);
          ctx.lineTo(x + 10, 17);
          ctx.lineTo(x - 7, h - 14);
          ctx.lineTo(x - 18, h - 14);
          ctx.fill();
        }
        ctx.restore();
        ctx.fillStyle = "#111";
        ctx.fillRect(0, h - 14, w, 10);
        ctx.fillRect(7, h - 6, 13, 8);
        ctx.fillRect(w - 22, h - 6, 13, 8);
        ctx.fillStyle = Math.sin(this.elapsed * 8 + obstacle.seed) > 0 ? "#f2f2f2" : "#888";
        ctx.fillRect(w / 2 - 5, 5, 10, 8);
      } else if (obstacle.type === "blockade") {
        poly([[4, 20], [w - 5, 15], [w - 1, h - 12], [1, h - 6]], "#101010", "#111", 2);
        poly([[10, 25], [w - 14, 22], [w - 13, h - 24], [9, h - 18]], "#6f6f6f", "#111", 3);
        ctx.fillStyle = "#2f2f2f";
        ctx.fillRect(15, 34, w - 30, h - 58);
        ctx.fillStyle = "#bdbdbd";
        ctx.fillRect(16, 28, w - 34, 7);
        ctx.fillRect(16, h - 31, w - 34, 6);
        ctx.fillStyle = "#ededed";
        ctx.fillRect(22, 43, w - 44, 3);
        ctx.fillRect(25, 51, w - 50, 3);
        ctx.fillStyle = "#111";
        ctx.fillRect(0, h - 13, w, 10);
        ctx.fillRect(10, h - 6, 12, 8);
        ctx.fillRect(w - 22, h - 6, 12, 8);
        sketchLine(16, 39, w - 16, 36, 0.42);
        sketchLine(18, h - 40, w - 18, h - 42, 0.32);
      } else if (obstacle.type === "overhead") {
        const flicker = Math.sin(this.elapsed * 10 + obstacle.seed) > 0;
        poly([[0, 4], [w - 6, 0], [w, 18], [7, 22]], "#111", "#111", 2);
        poly([[8, 19], [w - 12, 15], [w - 18, h - 7], [2, h - 3]], "#3a3a3a", "#111", 3);
        ctx.fillStyle = flicker ? "#ededed" : "#bdbdbd";
        ctx.fillRect(20, 25, w - 48, 7);
        ctx.fillStyle = "#111";
        ctx.fillRect(13, 25, 7, h - 27);
        ctx.fillRect(w - 23, 22, 7, h - 27);
        ctx.fillStyle = "#dcdcdc";
        for (let x = 29; x < w - 32; x += 25) {
          ctx.beginPath();
          ctx.moveTo(x, 27);
          ctx.lineTo(x + 9, 27);
          ctx.lineTo(x - 9, h - 8);
          ctx.lineTo(x - 18, h - 8);
          ctx.fill();
        }
        ctx.fillStyle = "#111";
        ctx.fillRect(0, h - 10, w - 16, 9);
        ctx.fillRect(w - 31, h - 14, 24, 10);
        ctx.fillStyle = "#ededed";
        ctx.fillRect(8, 8, 13, 4);
        ctx.fillRect(w - 26, 5, 13, 4);
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

  }

  const sound = new SoundEngine();
  ui.story.style.visibility = "hidden";
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
      ui.story.style.display = "";
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
      ui.story.style.display = "none";
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

  game.preloadMap().then(() => {
    ui.story.style.visibility = "";
    if (game.state === "story") story.show(0);
  });
})();
