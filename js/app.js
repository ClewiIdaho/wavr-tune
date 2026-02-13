// ============================================
// WAVR TUNE — Main App Controller (Redesigned)
//
// Updated to work with the new layout:
// - Metallic 3D knobs
// - Orbital pitch orb
// - Piano keyboard
// - Preset chips + top bar navigation
// ============================================

class WavrTuneApp {
  constructor() {
    this.audioContext = null;
    this.analyserNode = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.mediaStream = null;
    this.fileSource = null;

    this.isListening = false;
    this.isBypassed = false;
    this.isPlayingFile = false;

    this.pitchDetector = null;
    this.pitchCorrector = null;
    this.visualizer = null;

    this.knobs = {};
    this.analyserBufferSize = 2048;

    // Preset navigation
    this.presetNames = ['natural', 'soft', 'modern', 'hardtune', 'tpain'];
    this.presetLabels = ['Natural', 'Soft Snap', 'Modern', 'Hard Tune', 'T-Pain'];
    this.currentPresetIndex = 2; // Modern

    this.init();
  }

  init() {
    this.setupSVGGradients();
    this.setupKnobs();
    this.setupKeyboard();
    this.setupSelectors();
    this.setupPresets();
    this.setupPresetNav();
    this.setupButtons();

    this.visualizer = new PitchVisualizer('pitchCanvas');
    this.visualizer.startAnimation();

    console.log('%c🎤 WAVR Tune initialized', 'color: #c084fc; font-weight: bold; font-size: 14px;');
  }

  // ============================================
  // SVG GRADIENT
  // ============================================

  setupSVGGradients() {
    const svgNS = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    const defs = document.createElementNS(svgNS, 'defs');
    const gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.setAttribute('id', 'knobGradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stops = [
      { offset: '0%', color: '#c084fc' },
      { offset: '50%', color: '#a855f7' },
      { offset: '100%', color: '#7c3aed' }
    ];

    stops.forEach(s => {
      const stop = document.createElementNS(svgNS, 'stop');
      stop.setAttribute('offset', s.offset);
      stop.setAttribute('stop-color', s.color);
      gradient.appendChild(stop);
    });

    defs.appendChild(gradient);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  // ============================================
  // KNOBS — Updated for new 3D metallic knobs
  // ============================================

  setupKnobs() {
    const configs = {
      correctionKnob: {
        valueEl: 'correctionValue',
        format: (v) => Math.round(v) + '%',
        param: 'correction'
      },
      speedKnob: {
        valueEl: 'speedValue',
        format: (v) => Math.round(v * 0.5) + 'ms',
        param: 'speed'
      },
      humanizeKnob: {
        valueEl: 'humanizeValue',
        format: (v) => Math.round(v).toString(),
        param: 'humanize'
      },
      formantKnob: {
        valueEl: 'formantValue',
        format: (v) => {
          const st = Math.round((v - 50) * 0.24);
          return (st >= 0 ? '+' : '') + st;
        },
        param: 'formant'
      },
      mixKnob: {
        valueEl: 'mixValue',
        format: (v) => Math.round(v).toString(),
        param: 'mix'
      }
    };

    Object.entries(configs).forEach(([id, config]) => {
      const el = document.getElementById(id);
      if (!el) return;

      const valueEl = document.getElementById(config.valueEl);

      this.knobs[id] = new WavrKnob(el, {
        onChange: (value) => {
          if (valueEl) valueEl.textContent = config.format(value);
          if (this.pitchCorrector) {
            const p = {};
            p[config.param] = value;
            this.pitchCorrector.setParams(p);
          }
        }
      });

      if (valueEl) valueEl.textContent = config.format(this.knobs[id].value);
    });
  }

  // ============================================
  // PIANO KEYBOARD
  // ============================================

  setupKeyboard() {
    const keyboard = document.getElementById('noteGrid');
    if (!keyboard) return;

    keyboard.querySelectorAll('.piano-key').forEach(key => {
      key.addEventListener('click', () => {
        key.classList.toggle('active');
      });
    });
  }

  updateKeyboardForScale(key, scaleName) {
    const scales = {
      major: [0,2,4,5,7,9,11],
      minor: [0,2,3,5,7,8,10],
      pentatonic: [0,2,4,7,9],
      blues: [0,3,5,6,7,10],
      dorian: [0,2,3,5,7,9,10],
      mixolydian: [0,2,4,5,7,9,10],
      chromatic: [0,1,2,3,4,5,6,7,8,9,10,11]
    };

    const noteMap = {
      'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
      'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11
    };

    const root = noteMap[key] || 0;
    const intervals = scales[scaleName] || scales.chromatic;
    const activeNotes = intervals.map(i => (root + i) % 12);

    const keyboard = document.getElementById('noteGrid');
    if (!keyboard) return;

    keyboard.querySelectorAll('.piano-key').forEach(k => {
      const note = k.dataset.note;
      const semitone = noteMap[note];
      if (activeNotes.includes(semitone)) {
        k.classList.add('active');
      } else {
        k.classList.remove('active');
      }
    });
  }

  // ============================================
  // SELECTORS
  // ============================================

  setupSelectors() {
    const keySelect = document.getElementById('keySelect');
    const scaleSelect = document.getElementById('scaleSelect');

    const onChange = () => {
      const key = keySelect ? keySelect.value : 'C';
      const scale = scaleSelect ? scaleSelect.value : 'major';

      // Update displays
      const keyDisplay = document.getElementById('keyDisplay');
      const scaleDisplay = document.getElementById('scaleDisplay');
      if (keyDisplay) keyDisplay.textContent = key;
      if (scaleDisplay) scaleDisplay.textContent = scale;

      if (this.pitchCorrector) {
        this.pitchCorrector.setParams({ key: key, scale: scale });
      }

      this.updateKeyboardForScale(key, scale);
    };

    if (keySelect) keySelect.addEventListener('change', onChange);
    if (scaleSelect) scaleSelect.addEventListener('change', onChange);
  }

  // ============================================
  // PRESETS — Chips + Top Bar Navigation
  // ============================================

  setupPresets() {
    document.querySelectorAll('.preset-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.preset-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        const name = btn.dataset.preset;
        const preset = PitchCorrector.presets[name];
        if (preset) this.applyPreset(preset);

        // Sync top bar
        const idx = this.presetNames.indexOf(name);
        if (idx !== -1) {
          this.currentPresetIndex = idx;
          this.updatePresetDisplay();
        }
      });
    });
  }

  setupPresetNav() {
    const prevBtn = document.getElementById('prevPreset');
    const nextBtn = document.getElementById('nextPreset');

    if (prevBtn) {
      prevBtn.addEventListener('click', () => {
        this.currentPresetIndex = (this.currentPresetIndex - 1 + this.presetNames.length) % this.presetNames.length;
        this.activatePresetByIndex(this.currentPresetIndex);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', () => {
        this.currentPresetIndex = (this.currentPresetIndex + 1) % this.presetNames.length;
        this.activatePresetByIndex(this.currentPresetIndex);
      });
    }
  }

  activatePresetByIndex(index) {
    const name = this.presetNames[index];
    const preset = PitchCorrector.presets[name];

    if (preset) this.applyPreset(preset);

    // Update chip highlight
    document.querySelectorAll('.preset-chip').forEach(b => {
      b.classList.toggle('active', b.dataset.preset === name);
    });

    this.updatePresetDisplay();
  }

  updatePresetDisplay() {
    const nameEl = document.getElementById('currentPresetName');
    if (nameEl) {
      nameEl.textContent = this.presetLabels[this.currentPresetIndex];
    }
  }

  applyPreset(preset) {
    const mapping = {
      correction: { knobId: 'correctionKnob', valueEl: 'correctionValue', format: (v) => Math.round(v) + '%' },
      speed: { knobId: 'speedKnob', valueEl: 'speedValue', format: (v) => Math.round(v * 0.5) + 'ms' },
      humanize: { knobId: 'humanizeKnob', valueEl: 'humanizeValue', format: (v) => Math.round(v).toString() },
      formant: { knobId: 'formantKnob', valueEl: 'formantValue', format: (v) => { const st = Math.round((v-50)*0.24); return (st>=0?'+':'') + st; }},
      mix: { knobId: 'mixKnob', valueEl: 'mixValue', format: (v) => Math.round(v).toString() }
    };

    Object.entries(preset).forEach(([param, value]) => {
      const m = mapping[param];
      if (!m) return;

      const knob = this.knobs[m.knobId];
      if (knob) {
        knob.setValue(value);
        const el = document.getElementById(m.valueEl);
        if (el) el.textContent = m.format(value);
      }
    });

    if (this.pitchCorrector) {
      this.pitchCorrector.setParams(preset);
    }
  }

  // ============================================
  // BUTTONS
  // ============================================

  setupButtons() {
    const startBtn = document.getElementById('startBtn');
    const fileBtn = document.getElementById('fileBtn');
    const fileInput = document.getElementById('audioFileInput');
    const bypassBtn = document.getElementById('bypassBtn');

    if (startBtn) startBtn.addEventListener('click', () => this.toggleListening());

    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadAudioFile(file);
        fileInput.value = '';
      });
    }

    if (bypassBtn) {
      bypassBtn.addEventListener('click', () => {
        this.isBypassed = !this.isBypassed;
        bypassBtn.classList.toggle('active', this.isBypassed);
      });
    }
  }

  // ============================================
  // AUDIO ENGINE
  // ============================================

  async initAudio() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000
    });

    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.pitchDetector = new PitchDetector(this.audioContext.sampleRate);
    this.pitchCorrector = new PitchCorrector(this.audioContext.sampleRate);

    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = this.analyserBufferSize;

    this.syncAllParams();
  }

  syncAllParams() {
    if (!this.pitchCorrector) return;
    const keySelect = document.getElementById('keySelect');
    const scaleSelect = document.getElementById('scaleSelect');

    this.pitchCorrector.setParams({
      key: keySelect ? keySelect.value : 'C',
      scale: scaleSelect ? scaleSelect.value : 'major',
      correction: this.knobs.correctionKnob ? this.knobs.correctionKnob.getValue() : 75,
      speed: this.knobs.speedKnob ? this.knobs.speedKnob.getValue() : 25,
      humanize: this.knobs.humanizeKnob ? this.knobs.humanizeKnob.getValue() : 30,
      formant: this.knobs.formantKnob ? this.knobs.formantKnob.getValue() : 50,
      mix: this.knobs.mixKnob ? this.knobs.mixKnob.getValue() : 85
    });
  }

  // ============================================
  // MICROPHONE
  // ============================================

  async toggleListening() {
    if (this.isListening) {
      this.stopListening();
    } else {
      await this.startListening();
    }
  }

  async startListening() {
    try {
      await this.initAudio();
      this.stopFile();

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        }
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      this.processorNode = this.audioContext.createScriptProcessor(2048, 1, 1);

      this.processorNode.onaudioprocess = (e) => this.processFrame(e);

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isListening = true;
      this.updateUI(true);

    } catch (err) {
      console.error('Mic error:', err);
      alert('Could not access microphone. Please allow permission and use HTTPS.');
    }
  }

  stopListening() {
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(t => t.stop());
      this.mediaStream = null;
    }
    if (this.pitchCorrector) this.pitchCorrector.reset();

    this.isListening = false;
    this.updateUI(false);
    this.resetDisplay();
  }

  // ============================================
  // FILE LOADING
  // ============================================

  async loadAudioFile(file) {
    try {
      await this.initAudio();
      this.stopListening();
      this.stopFile();

      const buffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(buffer);

      this.processFileViz(audioBuffer);
      this.playFile(audioBuffer);

    } catch (err) {
      console.error('File error:', err);
      alert('Could not load audio file.');
    }
  }

  processFileViz(audioBuffer) {
    const data = audioBuffer.getChannelData(0);
    const chunkSize = 2048;
    const hopSize = 1024;

    this.visualizer.clear();
    let idx = 0;

    const process = () => {
      for (let c = 0; c < 8; c++) {
        if (idx >= data.length - chunkSize) return;

        const chunk = data.slice(idx, idx + chunkSize);
        const det = this.pitchDetector.detect(chunk);
        const noteInfo = this.pitchDetector.frequencyToNote(det.frequency);

        let target = det.frequency;
        if (noteInfo && det.frequency > 0) {
          const scale = this.pitchCorrector.getScaleNotes();
          target = this.pitchCorrector.getTargetFrequency(det.frequency, scale);
        }

        this.visualizer.pushData(det.frequency, target);
        this.updateDisplay(noteInfo, det);
        idx += hopSize;
      }
      requestAnimationFrame(process);
    };
    process();
  }

  playFile(audioBuffer) {
    this.fileSource = this.audioContext.createBufferSource();
    this.fileSource.buffer = audioBuffer;
    this.fileSource.connect(this.audioContext.destination);
    this.fileSource.onended = () => { this.isPlayingFile = false; };
    this.fileSource.start();
    this.isPlayingFile = true;
  }

  stopFile() {
    if (this.fileSource) {
      try { this.fileSource.stop(); } catch(e) {}
      this.fileSource.disconnect();
      this.fileSource = null;
    }
    this.isPlayingFile = false;
  }

  // ============================================
  // REAL-TIME PROCESSING
  // ============================================

  processFrame(e) {
    const input = e.inputBuffer.getChannelData(0);
    const output = e.outputBuffer.getChannelData(0);

    const det = this.pitchDetector.detect(input);
    const noteInfo = this.pitchDetector.frequencyToNote(det.frequency);

    let target = det.frequency;
    if (noteInfo && det.frequency > 0) {
      const scale = this.pitchCorrector.getScaleNotes();
      target = this.pitchCorrector.getTargetFrequency(det.frequency, scale);
    }

    if (this.isBypassed) {
      output.set(input);
    } else {
      const corrected = this.pitchCorrector.processBuffer(input, det.frequency);
      output.set(corrected);
    }

    this.visualizer.pushData(det.frequency, target);
    this.visualizer.setClarity(det.clarity);
    this.updateDisplay(noteInfo, det);
  }

  // ============================================
  // UI UPDATES
  // ============================================

  updateDisplay(noteInfo, detection) {
    const noteEl = document.getElementById('currentNote');
    const freqEl = document.getElementById('currentFreq');
    const centsEl = document.getElementById('centsValue');
    const centsIndicator = document.getElementById('centsIndicator');

    if (noteInfo && detection && detection.frequency > 0) {
      if (noteEl) noteEl.textContent = noteInfo.note + noteInfo.octave;
      if (freqEl) freqEl.textContent = detection.frequency.toFixed(1) + ' Hz';
      if (centsEl) {
        const sign = noteInfo.cents > 0 ? '+' : '';
        centsEl.textContent = sign + noteInfo.cents;
      }

      // Move cents indicator (map -50 to +50 cents → 0% to 100%)
      if (centsIndicator) {
        const pct = Math.max(0, Math.min(100, (noteInfo.cents + 50) / 100 * 100));
        centsIndicator.style.left = pct + '%';
      }

      // Highlight piano key
      document.querySelectorAll('.piano-key').forEach(k => {
        k.classList.remove('current');
        if (k.dataset.note === noteInfo.note) k.classList.add('current');
      });

    } else {
      if (noteEl) noteEl.textContent = '—';
      if (freqEl) freqEl.textContent = '— Hz';
      if (centsEl) centsEl.textContent = '0';
      if (centsIndicator) centsIndicator.style.left = '50%';
      document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('current'));
    }
  }

  resetDisplay() {
    const noteEl = document.getElementById('currentNote');
    const freqEl = document.getElementById('currentFreq');
    const centsEl = document.getElementById('centsValue');
    const centsIndicator = document.getElementById('centsIndicator');

    if (noteEl) noteEl.textContent = '—';
    if (freqEl) freqEl.textContent = '0 Hz';
    if (centsEl) centsEl.textContent = '0';
    if (centsIndicator) centsIndicator.style.left = '50%';
    document.querySelectorAll('.piano-key').forEach(k => k.classList.remove('current'));
  }

  updateUI(listening) {
    const btn = document.getElementById('startBtn');
    const led = document.getElementById('statusLed');

    if (btn) {
      if (listening) {
        btn.classList.add('listening');
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
          '<rect x="6" y="4" width="4" height="16" rx="1"/>' +
          '<rect x="14" y="4" width="4" height="16" rx="1"/>' +
          '</svg>Stop';
      } else {
        btn.classList.remove('listening');
        btn.innerHTML =
          '<svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M8 5v14l11-7z"/>' +
          '</svg>Start';
      }
    }

    if (led) {
      led.classList.toggle('active', listening);
    }
  }

  destroy() {
    this.stopListening();
    this.stopFile();
    if (this.visualizer) this.visualizer.destroy();
    Object.values(this.knobs).forEach(k => { if (k.destroy) k.destroy(); });
    if (this.audioContext) this.audioContext.close();
  }
}

// ============================================
// BOOT
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  window.wavrTune = new WavrTuneApp();
});
