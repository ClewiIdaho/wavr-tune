// ============================================
// WAVR TUNE — Pitch Curve Visualizer
//
// Draws a real-time pitch curve on canvas:
// - Background note reference lines
// - Glowing purple detected pitch line
// - Dashed target pitch line
// - Animated dot at current position
// - Idle animation when not listening
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

    // Rolling history of pitch data
    this.pitchHistory = [];
    this.targetHistory = [];
    this.maxHistory = 300;

    // Note names for reference lines
    this.noteStrings = [
      'C', 'C#', 'D', 'D#', 'E', 'F',
      'F#', 'G', 'G#', 'A', 'A#', 'B'
    ];

    // Visible frequency range (covers most vocals)
    this.minFreq = 80;    // ~E2
    this.maxFreq = 800;   // ~G5

    // Animation state
    this.animationId = null;
    this.isRunning = false;

    // Initial sizing
    this.resize();

    // Re-size on window resize
    this.boundResize = () => this.resize();
    window.addEventListener('resize', this.boundResize);
  }

  /**
   * Handle canvas resizing with device pixel ratio
   * for crisp rendering on retina displays
   */
  resize() {
    const rect = this.canvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    this.canvas.width = rect.width * dpr;
    this.canvas.height = rect.height * dpr;
    this.canvas.style.width = rect.width + 'px';
    this.canvas.style.height = rect.height + 'px';

    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.scale(dpr, dpr);

    this.width = rect.width;
    this.height = rect.height;
  }

  /**
   * Convert a frequency to a Y position on the canvas
   * Uses logarithmic scale (matches how we hear pitch)
   */
  freqToY(freq) {
    if (freq <= 0) return this.height / 2;

    const clampedFreq = Math.max(this.minFreq, Math.min(this.maxFreq, freq));
    const logMin = Math.log2(this.minFreq);
    const logMax = Math.log2(this.maxFreq);
    const logFreq = Math.log2(clampedFreq);

    const normalized = (logFreq - logMin) / (logMax - logMin);

    // Invert Y (canvas 0 is top) and add padding
    return this.height - (normalized * this.height * 0.8 + this.height * 0.1);
  }

  /**
   * Get frequency for a specific note and octave
   */
  noteFreq(noteName, octave) {
    const noteIndex = this.noteStrings.indexOf(noteName);
    if (noteIndex === -1) return 0;

    const midiNote = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }

  /**
   * Push new pitch data into the rolling history
   */
  pushData(detectedFreq, targetFreq) {
    this.pitchHistory.push(detectedFreq);
    this.targetHistory.push(targetFreq);

    // Keep buffer bounded
    if (this.pitchHistory.length > this.maxHistory) {
      this.pitchHistory.shift();
      this.targetHistory.shift();
    }
  }

  /**
   * Draw horizontal reference lines for musical notes
   */
  drawNoteLines(ctx, w, h) {
    const majorNotes = ['C', 'E', 'G'];
    const allDiatonic = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    for (let octave = 2; octave <= 5; octave++) {
      for (const note of allDiatonic) {
        const freq = this.noteFreq(note, octave);
        if (freq < this.minFreq || freq > this.maxFreq) continue;

        const y = this.freqToY(freq);

        // Draw the line
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);

        if (note === 'C') {
          // C notes are brighter
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.12)';
          ctx.lineWidth = 1;
        } else {
          ctx.strokeStyle = 'rgba(139, 92, 246, 0.04)';
          ctx.lineWidth = 0.5;
        }
        ctx.stroke();

        // Label major notes
        if (majorNotes.includes(note)) {
          ctx.fillStyle = 'rgba(139, 92, 246, 0.2)';
          ctx.font = '500 9px Inter, sans-serif';
          ctx.textAlign = 'left';
          ctx.fillText(note + octave, 6, y - 3);
        }
      }
    }
  }

  /**
   * Draw a pitch line (either detected or target)
   * 
   * glow: if true, draws with purple glow effect
   * dashed: if true, draws dashed line (for target)
   */
  drawPitchLine(ctx, w, h, history, options = {}) {
    const {
      color = 'rgba(139, 92, 246, 0.2)',
      lineWidth = 2,
      glow = false,
      dashed = false
    } = options;

    if (history.length < 2) return;

    const step = w / this.maxHistory;
    const startX = w - (history.length * step);

    // Build the path
    ctx.beginPath();
    let started = false;
    let lastValidY = 0;

    for (let i = 0; i < history.length; i++) {
      const freq = history[i];
      const x = startX + i * step;

      if (freq <= 0) {
        // Gap in detection — break the line
        started = false;
        continue;
      }

      const y = this.freqToY(freq);
      lastValidY = y;

      if (!started) {
        ctx.moveTo(x, y);
        started = true;
      } else {
        // Smooth curve instead of sharp lines
        const prevFreq = history[i - 1];
        if (prevFreq > 0) {
          const prevX = startX + (i - 1) * step;
          const prevY = this.freqToY(prevFreq);
          const cpX = (prevX + x) / 2;
          ctx.quadraticCurveTo(cpX, prevY, x, y);
        } else {
          ctx.moveTo(x, y);
        }
      }
    }

    // Set line style
    if (dashed) {
      ctx.setLineDash([4, 4]);
    }

    if (glow) {
      // Layer 1: Wide soft glow
      ctx.shadowColor = 'rgba(139, 92, 246, 0.5)';
      ctx.shadowBlur = 16;
      ctx.strokeStyle = 'rgba(168, 130, 255, 0.6)';
      ctx.lineWidth = lineWidth + 1;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();

      // Layer 2: Bright core
      ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
      ctx.shadowBlur = 6;
      ctx.strokeStyle = 'rgba(216, 180, 254, 0.9)';
      ctx.lineWidth = lineWidth * 0.6;
      ctx.stroke();

      // Reset shadow
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Reset dash
    ctx.setLineDash([]);
  }

  /**
   * Draw a glowing dot at the current pitch position
   */
  drawCurrentDot(ctx, w, h) {
    if (this.pitchHistory.length === 0) return;

    const lastFreq = this.pitchHistory[this.pitchHistory.length - 1];
    if (lastFreq <= 0) return;

    const x = w - 10;
    const y = this.freqToY(lastFreq);

    // Outer glow ring
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, 25);
    glowGrad.addColorStop(0, 'rgba(139, 92, 246, 0.4)');
    glowGrad.addColorStop(0.4, 'rgba(139, 92, 246, 0.15)');
    glowGrad.addColorStop(1, 'rgba(139, 92, 246, 0)');

    ctx.beginPath();
    ctx.arc(x, y, 25, 0, Math.PI * 2);
    ctx.fillStyle = glowGrad;
    ctx.fill();

    // Pulse animation ring
    const pulseSize = 8 + Math.sin(Date.now() / 200) * 3;
    ctx.beginPath();
    ctx.arc(x, y, pulseSize, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Main dot
    ctx.beginPath();
    ctx.arc(x, y, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#c084fc';
    ctx.shadowColor = 'rgba(139, 92, 246, 0.8)';
    ctx.shadowBlur = 12;
    ctx.fill();

    // Bright center point
    ctx.beginPath();
    ctx.arc(x, y, 2, 0, Math.PI * 2);
    ctx.fillStyle = '#f5f0ff';
    ctx.shadowBlur = 6;
    ctx.fill();

    // Reset shadow
    ctx.shadowBlur = 0;
    ctx.shadowColor = 'transparent';
  }

  /**
   * Draw the target note indicator
   * Shows which note the corrector is snapping to
   */
  drawTargetIndicator(ctx, w, h) {
    if (this.targetHistory.length === 0) return;

    const lastTarget = this.targetHistory[this.targetHistory.length - 1];
    if (lastTarget <= 0) return;

    const y = this.freqToY(lastTarget);

    // Horizontal target line
    ctx.beginPath();
    ctx.moveTo(w - 60, y);
    ctx.lineTo(w, y);
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.25)';
    ctx.lineWidth = 1;
    ctx.setLineDash([2, 3]);
    ctx.stroke();
    ctx.setLineDash([]);

    // Small diamond marker
    ctx.beginPath();
    ctx.moveTo(w - 4, y - 4);
    ctx.lineTo(w, y);
    ctx.lineTo(w - 4, y + 4);
    ctx.lineTo(w - 8, y);
    ctx.closePath();
    ctx.fillStyle = 'rgba(139, 92, 246, 0.3)';
    ctx.fill();
  }

  /**
   * Idle animation when not actively processing
   * Gentle flowing wave
   */
  drawIdleAnimation(ctx, w, h) {
    const time = Date.now() / 1000;

    // Flowing wave 1
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 +
        Math.sin(x * 0.015 + time * 1.2) * 20 +
        Math.sin(x * 0.008 + time * 0.7) * 15 +
        Math.sin(x * 0.003 + time * 0.4) * 30;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.06)';
    ctx.lineWidth = 1.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Flowing wave 2 (offset)
    ctx.beginPath();
    for (let x = 0; x < w; x++) {
      const y = h / 2 +
        Math.sin(x * 0.012 + time * 0.9 + 2) * 18 +
        Math.sin(x * 0.006 + time * 0.5 + 1) * 22;

      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.strokeStyle = 'rgba(139, 92, 246, 0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();

    // Center message
    ctx.fillStyle = 'rgba(139, 92, 246, 0.15)';
    ctx.font = '500 12px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Start listening or load audio to see pitch curve', w / 2, h / 2 + 55);
    ctx.textAlign = 'left';

    // WAVR Tune watermark
    ctx.fillStyle = 'rgba(139, 92, 246, 0.06)';
    ctx.font = '800 28px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('WAVR TUNE', w / 2, h / 2 - 10);
    ctx.textAlign = 'left';
  }

  /**
   * Main draw loop — called every animation frame
   */
  draw() {
    const ctx = this.ctx;
    const w = this.width;
    const h = this.height;

    if (w === 0 || h === 0) return;

    // Clear canvas
    ctx.clearRect(0, 0, w, h);

    // Dark gradient background
    const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
    bgGrad.addColorStop(0, 'rgba(10, 6, 18, 0.95)');
    bgGrad.addColorStop(0.5, 'rgba(13, 8, 22, 0.95)');
    bgGrad.addColorStop(1, 'rgba(17, 11, 30, 0.95)');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(0, 0, w, h);

    // Subtle vignette at edges
    const vignetteGrad = ctx.createRadialGradient(
      w / 2, h / 2, Math.min(w, h) * 0.3,
      w / 2, h / 2, Math.max(w, h) * 0.7
    );
    vignetteGrad.addColorStop(0, 'transparent');
    vignetteGrad.addColorStop(1, 'rgba(0, 0, 0, 0.3)');
    ctx.fillStyle = vignetteGrad;
    ctx.fillRect(0, 0, w, h);

    // Note reference lines
    this.drawNoteLines(ctx, w, h);

    // Check if we have pitch data
    const hasData = this.pitchHistory.length > 2 &&
      this.pitchHistory.some(f => f > 0);

    if (hasData) {
      // Target pitch (dashed, subtle)
      this.drawPitchLine(ctx, w, h, this.targetHistory, {
        color: 'rgba(139, 92, 246, 0.12)',
        lineWidth: 2,
        dashed: true
      });

      // Detected pitch (glowing main line)
      this.drawPitchLine(ctx, w, h, this.pitchHistory, {
        lineWidth: 2.5,
        glow: true
      });

      // Target indicator
      this.drawTargetIndicator(ctx, w, h);

      // Current position dot
      this.drawCurrentDot(ctx, w, h);
    } else {
      // Idle state animation
      this.drawIdleAnimation(ctx, w, h);
    }
  }

  /**
   * Start the animation loop
   */
  startAnimation() {
    this.isRunning = true;

    const animate = () => {
      if (!this.isRunning) return;
      this.draw();
      this.animationId = requestAnimationFrame(animate);
    };

    animate();
  }

  /**
   * Stop the animation loop
   */
  stopAnimation() {
    this.isRunning = false;
    if (this.animationId) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  /**
   * Clear all pitch history
   */
  clear() {
    this.pitchHistory = [];
    this.targetHistory = [];
  }

  /**
   * Clean up when destroying the visualizer
   */
  destroy() {
    this.stopAnimation();
    window.removeEventListener('resize', this.boundResize);
  }
}

// Make available globally
window.PitchVisualizer = PitchVisualizer;
