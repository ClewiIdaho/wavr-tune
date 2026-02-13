// ============================================
// WAVR TUNE — Orbital Pitch Visualizer
//
// Inspired by PolyTune's circular orb display
// Draws concentric rings showing pitch accuracy
// with a glowing center orb that reacts to voice
// ============================================

class PitchVisualizer {
  constructor(canvasId) {
    this.canvas = document.getElementById(canvasId);
    if (!this.canvas) {
      console.error('PitchVisualizer: canvas not found:', canvasId);
      return;
    }
    this.ctx = this.canvas.getContext('2d');
    this.width = 0;
    this.height = 0;
    this.centerX = 0;
    this.centerY = 0;
    this.radius = 0;

    // Pitch data
    this.pitchHistory = [];
    this.targetHistory = [];
    this.maxHistory = 300;

    // Current state
    this.currentFreq = 0;
    this.currentTarget = 0;
    this.currentCents = 0;
    this.currentClarity = 0;
    this.energy = 0;
    this.smoothedEnergy = 0;

    // Orb animation
    this.orbPhase = 0;
    this.orbPulse = 0;
    this.particles = [];
    this.initParticles();

    // Frequency range
    this.noteStrings = ['C','C#','D','D#','E','F','F#','G','G#','A','A#','B'];
    this.minFreq = 80;
    this.maxFreq = 800;

    // Animation
    this.animationId = null;
    this.isRunning = false;

    this.resize();
    this.boundResize = () => this.resize();
    window.addEventListener('resize', this.boundResize);
  }

  // ---- Setup ----

  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const size = Math.min(rect.width, rect.height);

    this.canvas.width = size * dpr;
    this.canvas.height = size * dpr;
    this.canvas.style.width = size + 'px';
    this.canvas.style.height = size + 'px';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.width = size;
    this.height = size;
    this.centerX = size / 2;
    this.centerY = size / 2;
    this.radius = size / 2 - 10;
  }

  initParticles() {
    this.particles = [];
    for (let i = 0; i < 40; i++) {
      this.particles.push({
        angle: Math.random() * Math.PI * 2,
        radius: 0.3 + Math.random() * 0.6,
        speed: 0.002 + Math.random() * 0.008,
        size: 0.5 + Math.random() * 1.5,
        opacity: 0.1 + Math.random() * 0.4,
        phase: Math.random() * Math.PI * 2
      });
    }
  }

  // ---- Data Input ----

  pushData(detectedFreq, targetFreq) {
    this.pitchHistory.push(detectedFreq);
    this.targetHistory.push(targetFreq);

    if (this.pitchHistory.length > this.maxHistory) {
      this.pitchHistory.shift();
      this.targetHistory.shift();
    }

    this.currentFreq = detectedFreq;
    this.currentTarget = targetFreq;

    // Calculate cents deviation
    if (detectedFreq > 0 && targetFreq > 0) {
      this.currentCents = 1200 * Math.log2(detectedFreq / targetFreq);
      this.energy = 1;
    } else {
      this.currentCents = 0;
      this.energy = 0;
    }
  }

  setClarity(clarity) {
    this.currentClarity = clarity;
  }

  // ---- Drawing ----

  draw() {
    const ctx = this.ctx;
    const cx = this.centerX;
    const cy = this.centerY;
    const r = this.radius;
    const time = Date.now() / 1000;

    ctx.clearRect(0, 0, this.width, this.height);

    // Smooth energy for animations
    this.smoothedEnergy += (this.energy - this.smoothedEnergy) * 0.1;
    this.energy *= 0.95;
    this.orbPhase += 0.02;

    // ---- Background ----
    this.drawBackground(ctx, cx, cy, r);

    // ---- Outer rings ----
    this.drawOuterRings(ctx, cx, cy, r, time);

    // ---- Pitch accuracy ring ----
    this.drawAccuracyRing(ctx, cx, cy, r, time);

    // ---- Floating particles ----
    this.drawParticles(ctx, cx, cy, r, time);

    // ---- Center orb ----
    this.drawCenterOrb(ctx, cx, cy, r, time);

    // ---- Pitch history trail ----
    this.drawPitchTrail(ctx, cx, cy, r);

    // ---- Idle state ----
    if (this.smoothedEnergy < 0.05 && this.pitchHistory.length < 3) {
      this.drawIdleState(ctx, cx, cy, r, time);
    }
  }

  drawBackground(ctx, cx, cy, r) {
    // Dark circular gradient
    const bgGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    bgGrad.addColorStop(0, '#151520');
    bgGrad.addColorStop(0.6, '#111118');
    bgGrad.addColorStop(1, '#0d0d14');

    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = bgGrad;
    ctx.fill();

    // Subtle border
    ctx.beginPath();
    ctx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  drawOuterRings(ctx, cx, cy, r, time) {
    // Concentric reference rings
    const ringRadii = [0.9, 0.72, 0.55, 0.38];

    ringRadii.forEach((ratio, i) => {
      const ringR = r * ratio;
      const alpha = 0.03 + (this.smoothedEnergy * 0.02);

      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(168, 85, 247, ${alpha})`;
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    // Rotating tick marks on outer ring
    const tickCount = 24;
    const outerR = r * 0.92;
    const innerR = r * 0.87;

    for (let i = 0; i < tickCount; i++) {
      const angle = (i / tickCount) * Math.PI * 2 - Math.PI / 2;
      const isMajor = i % 2 === 0;

      const startR = isMajor ? innerR - 2 : innerR;
      const x1 = cx + Math.cos(angle) * startR;
      const y1 = cy + Math.sin(angle) * startR;
      const x2 = cx + Math.cos(angle) * outerR;
      const y2 = cy + Math.sin(angle) * outerR;

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = isMajor
        ? 'rgba(168, 85, 247, 0.12)'
        : 'rgba(255, 255, 255, 0.03)';
      ctx.lineWidth = isMajor ? 1 : 0.5;
      ctx.stroke();
    }

    // Note labels around outer ring
    const noteLabels = ['C', '', 'D', '', 'E', 'F', '', 'G', '', 'A', '', 'B'];
    const labelR = r * 0.82;

    noteLabels.forEach((label, i) => {
      if (!label) return;
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const x = cx + Math.cos(angle) * labelR;
      const y = cy + Math.sin(angle) * labelR;

      ctx.fillStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.font = '500 8px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, x, y);
    });
  }

  drawAccuracyRing(ctx, cx, cy, r, time) {
    if (this.smoothedEnergy < 0.05) return;

    // The accuracy ring shows how close to target pitch
    // Full ring = perfect pitch, partial = off pitch
    const accuracy = Math.max(0, 1 - Math.abs(this.currentCents) / 50);
    const ringR = r * 0.65;
    const arcLength = accuracy * Math.PI * 2;

    // Glow ring
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + arcLength);
    ctx.strokeStyle = `rgba(168, 85, 247, ${0.15 + accuracy * 0.35})`;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    ctx.shadowColor = 'rgba(168, 85, 247, 0.4)';
    ctx.shadowBlur = 8;
    ctx.stroke();
    ctx.shadowBlur = 0;

    // Bright core of ring
    ctx.beginPath();
    ctx.arc(cx, cy, ringR, -Math.PI / 2, -Math.PI / 2 + arcLength);
    ctx.strokeStyle = `rgba(216, 180, 254, ${0.2 + accuracy * 0.5})`;
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Dot at end of arc
    if (arcLength > 0.1) {
      const dotAngle = -Math.PI / 2 + arcLength;
      const dotX = cx + Math.cos(dotAngle) * ringR;
      const dotY = cy + Math.sin(dotAngle) * ringR;

      ctx.beginPath();
      ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(216, 180, 254, ${0.5 + accuracy * 0.5})`;
      ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
      ctx.shadowBlur = 6;
      ctx.fill();
      ctx.shadowBlur = 0;
    }
  }

  drawParticles(ctx, cx, cy, r, time) {
    const particleEnergy = this.smoothedEnergy;

    this.particles.forEach(p => {
      p.angle += p.speed * (1 + particleEnergy * 2);
      p.phase += 0.01;

      const wobble = Math.sin(p.phase) * 0.05;
      const pRadius = r * (p.radius + wobble) * (0.3 + particleEnergy * 0.3);

      const x = cx + Math.cos(p.angle) * pRadius;
      const y = cy + Math.sin(p.angle) * pRadius;

      const alpha = p.opacity * (0.3 + particleEnergy * 0.7);

      ctx.beginPath();
      ctx.arc(x, y, p.size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(168, 85, 247, ${alpha})`;
      ctx.fill();
    });
  }

  drawCenterOrb(ctx, cx, cy, r, time) {
    const orbR = r * 0.22;
    const pulse = Math.sin(this.orbPhase) * 0.08 * this.smoothedEnergy;
    const currentR = orbR * (1 + pulse);

    // Outer glow
    const glowR = currentR * 2.5;
    const glowGrad = ctx.createRadialGradient(cx, cy, currentR * 0.5, cx, cy, glowR);
    glowGrad.addColorStop(0, `rgba(168, 85, 247, ${0.08 + this.smoothedEnergy * 0.15})`);
    glowGrad.addColorStop(0.5, `rgba(88, 28, 135, ${0.03 + this.smoothedEnergy * 0.05})`);
    glowGrad.addColorStop(1, 'rgba(88, 28, 135, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Main orb body
    const orbGrad = ctx.createRadialGradient(
      cx - currentR * 0.2, cy - currentR * 0.3, 0,
      cx, cy, currentR
    );

    if (this.smoothedEnergy > 0.1) {
      // Active — purple orb
      const accuracy = Math.max(0, 1 - Math.abs(this.currentCents) / 50);
      const greenMix = accuracy * this.smoothedEnergy;

      orbGrad.addColorStop(0, `rgba(${180 - greenMix * 40}, ${100 + greenMix * 80}, ${247 - greenMix * 50}, 0.9)`);
      orbGrad.addColorStop(0.5, `rgba(${120 - greenMix * 30}, ${60 + greenMix * 50}, ${200 - greenMix * 40}, 0.7)`);
      orbGrad.addColorStop(1, `rgba(${60 - greenMix * 20}, ${20 + greenMix * 30}, ${130 - greenMix * 30}, 0.5)`);
    } else {
      // Idle — dark subtle orb
      orbGrad.addColorStop(0, 'rgba(60, 50, 80, 0.5)');
      orbGrad.addColorStop(0.5, 'rgba(40, 30, 60, 0.4)');
      orbGrad.addColorStop(1, 'rgba(25, 18, 40, 0.3)');
    }

    ctx.beginPath();
    ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
    ctx.fillStyle = orbGrad;
    ctx.fill();

    // Orb border ring
    ctx.beginPath();
    ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(168, 85, 247, ${0.1 + this.smoothedEnergy * 0.25})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Highlight / gloss on orb
    const shineGrad = ctx.createRadialGradient(
      cx - currentR * 0.25, cy - currentR * 0.35, 0,
      cx, cy, currentR
    );
    shineGrad.addColorStop(0, 'rgba(255, 255, 255, 0.08)');
    shineGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.02)');
    shineGrad.addColorStop(1, 'rgba(255, 255, 255, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, currentR, 0, Math.PI * 2);
    ctx.fillStyle = shineGrad;
    ctx.fill();

    // Inner bright core
    const coreR = currentR * 0.25;
    const coreGrad = ctx.createRadialGradient(cx, cy, 0, cx, cy, coreR);
    coreGrad.addColorStop(0, `rgba(220, 200, 255, ${0.1 + this.smoothedEnergy * 0.3})`);
    coreGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');

    ctx.beginPath();
    ctx.arc(cx, cy, coreR, 0, Math.PI * 2);
    ctx.fillStyle = coreGrad;
    ctx.fill();
  }

  drawPitchTrail(ctx, cx, cy, r) {
    // Draw recent pitch as a trail around the orb
    const trailLength = Math.min(60, this.pitchHistory.length);
    if (trailLength < 2) return;

    const trailR = r * 0.48;
    const startIdx = this.pitchHistory.length - trailLength;

    ctx.beginPath();
    let started = false;

    for (let i = 0; i < trailLength; i++) {
      const freq = this.pitchHistory[startIdx + i];
      if (freq <= 0) {
        started = false;
        continue;
      }

      // Map frequency to angle
      const noteNum = 12 * Math.log2(freq / 440);
      const notePos = ((noteNum % 12) + 12) % 12;
      const angle = (notePos / 12) * Math.PI * 2 - Math.PI / 2;

      // Slight spiral inward for older points
      const ageRatio = i / trailLength;
      const pointR = trailR * (0.85 + ageRatio * 0.15);

      const x = cx + Math.cos(angle) * pointR;
      const y = cy + Math.sin(angle) * pointR;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        ctx.lineTo(x, y);
      }
    }

    if (started) {
      ctx.strokeStyle = 'rgba(168, 85, 247, 0.15)';
      ctx.lineWidth = 1.5;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Dot at current position
    if (this.pitchHistory.length > 0) {
      const lastFreq = this.pitchHistory[this.pitchHistory.length - 1];
      if (lastFreq > 0) {
        const noteNum = 12 * Math.log2(lastFreq / 440);
        const notePos = ((noteNum % 12) + 12) % 12;
        const angle = (notePos / 12) * Math.PI * 2 - Math.PI / 2;

        const dotX = cx + Math.cos(angle) * trailR;
        const dotY = cy + Math.sin(angle) * trailR;

        // Glow
        ctx.beginPath();
        ctx.arc(dotX, dotY, 6, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(168, 85, 247, 0.2)';
        ctx.fill();

        // Dot
        ctx.beginPath();
        ctx.arc(dotX, dotY, 3, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(216, 180, 254, 0.8)';
        ctx.shadowColor = 'rgba(168, 85, 247, 0.6)';
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
      }
    }
  }

  drawIdleState(ctx, cx, cy, r, time) {
    // Gentle breathing animation when idle
    const breathe = Math.sin(time * 0.8) * 0.5 + 0.5;

    // Soft ring pulse
    const pulseR = r * (0.45 + breathe * 0.05);
    ctx.beginPath();
    ctx.arc(cx, cy, pulseR, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(168, 85, 247, ${0.03 + breathe * 0.03})`;
    ctx.lineWidth = 1;
    ctx.stroke();

    // Scanning line
    const scanAngle = time * 0.5;
    const scanR = r * 0.65;
    const scanX = cx + Math.cos(scanAngle) * scanR;
    const scanY = cy + Math.sin(scanAngle) * scanR;

    const scanGrad = ctx.createRadialGradient(scanX, scanY, 0, scanX, scanY, 15);
    scanGrad.addColorStop(0, 'rgba(168, 85, 247, 0.06)');
    scanGrad.addColorStop(1, 'rgba(168, 85, 247, 0)');

    ctx.beginPath();
    ctx.arc(scanX, scanY, 15, 0, Math.PI * 2);
    ctx.fillStyle = scanGrad;
    ctx.fill();
  }

  // ---- Animation Control ----

  startAnimation() {
    this.isRunning = true;
    const animate = () => {
      if (!this.isRunning) return;
      this.draw();
      this.animationId = requestAnimationFrame(animate);
    };
    animate();
  }

  stopAnimation() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  clear() {
    this.pitchHistory = [];
    this.targetHistory = [];
    this.currentFreq = 0;
    this.currentTarget = 0;
    this.currentCents = 0;
    this.energy = 0;
  }

  destroy() {
    this.stopAnimation();
    window.removeEventListener('resize', this.boundResize);
  }
}

window.PitchVisualizer = PitchVisualizer;
