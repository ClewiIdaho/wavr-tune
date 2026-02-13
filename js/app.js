// ============================================
// WAVR TUNE — Main App Controller (FIXED)
//
// All interactive elements wired up:
// - 3D metallic knobs (drag to adjust)
// - Piano keyboard (click to toggle)
// - Preset chips (click to apply)
// - Preset navigation arrows
// - Bypass toggle
// - Start/Stop listening
// - Load audio file
// - Cents indicator bar
// ============================================

class WavrTuneApp {
  constructor() {
    // Audio
    this.audioContext = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.mediaStream = null;
    this.fileSource = null;

    // State
    this.isListening = false;
    this.isBypassed = false;
    this.isPlayingFile = false;

    // DSP
    this.pitchDetector = null;
    this.pitchCorrector = null;
    this.visualizer = null;

    // Knobs
    this.knobs = {};

    // Presets
    this.presetNames = ['natural', 'soft', 'modern', 'hardtune', 'tpain'];
    this.presetLabels = ['Natural', 'Soft Snap', 'Modern', 'Hard Tune', 'T-Pain'];
    this.currentPresetIndex = 2;

    // Boot
    this.init();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  init() {
    this.injectSVGGradient();
    this.initKnobs();
    this.initKeyboard();
    this.initSelectors();
    this.initPresetChips();
    this.initPresetNav();
    this.initButtons();
    this.initVisualizer();

    console.log('%c🎤 WAVR Tune ready', 'color:#c084fc;font-weight:bold;font-size:14px;');
  }

  // ---- SVG Gradient for knob rings ----
  injectSVGGradient() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    var defs = document.createElementNS(ns, 'defs');
    var grad = document.createElementNS(ns, 'linearGradient');
    grad.setAttribute('id', 'knobGradient');
    grad.setAttribute('x1', '0%');
    grad.setAttribute('y1', '0%');
    grad.setAttribute('x2', '100%');
    grad.setAttribute('y2', '100%');

    var colors = [
      { offset: '0%', color: '#c084fc' },
      { offset: '50%', color: '#a855f7' },
      { offset: '100%', color: '#7c3aed' }
    ];

    colors.forEach(function(c) {
      var stop = document.createElementNS(ns, 'stop');
      stop.setAttribute('offset', c.offset);
      stop.setAttribute('stop-color', c.color);
      grad.appendChild(stop);
    });

    defs.appendChild(grad);
    svg.appendChild(defs);
    document.body.appendChild(svg);
  }

  // ============================================
  // KNOBS
  // ============================================

  initKnobs() {
    var self = this;

    var configs = [
      {
        id: 'correctionKnob',
        valueId: 'correctionValue',
        param: 'correction',
        format: function(v) { return Math.round(v) + '%'; }
      },
      {
        id: 'speedKnob',
        valueId: 'speedValue',
        param: 'speed',
        format: function(v) { return Math.round(v * 0.5) + 'ms'; }
      },
      {
        id: 'humanizeKnob',
        valueId: 'humanizeValue',
        param: 'humanize',
        format: function(v) { return Math.round(v).toString(); }
      },
      {
        id: 'formantKnob',
        valueId: 'formantValue',
        param: 'formant',
        format: function(v) {
          var st = Math.round((v - 50) * 0.24);
          return (st >= 0 ? '+' : '') + st;
        }
      },
      {
        id: 'mixKnob',
        valueId: 'mixValue',
        param: 'mix',
        format: function(v) { return Math.round(v).toString(); }
      }
    ];

    configs.forEach(function(cfg) {
      var el = document.getElementById(cfg.id);
      if (!el) {
        console.warn('Knob not found:', cfg.id);
        return;
      }

      var valueEl = document.getElementById(cfg.valueId);

      self.knobs[cfg.id] = new WavrKnob(el, {
        onChange: function(value) {
          // Update display
          if (valueEl) {
            valueEl.textContent = cfg.format(value);
          }
          // Send to corrector
          if (self.pitchCorrector) {
            var p = {};
            p[cfg.param] = value;
            self.pitchCorrector.setParams(p);
          }
        }
      });

      // Set initial display
      if (valueEl) {
        valueEl.textContent = cfg.format(self.knobs[cfg.id].value);
      }
    });
  }

  // ============================================
  // PIANO KEYBOARD
  // ============================================

  initKeyboard() {
    var keyboard = document.getElementById('noteGrid');
    if (!keyboard) return;

    var keys = keyboard.querySelectorAll('.piano-key');
    keys.forEach(function(key) {
      key.addEventListener('click', function(e) {
        e.preventDefault();
        key.classList.toggle('active');
      });
    });
  }

  updateKeyboardForScale(rootKey, scaleName) {
    var scales = {
      major: [0,2,4,5,7,9,11],
      minor: [0,2,3,5,7,8,10],
      pentatonic: [0,2,4,7,9],
      blues: [0,3,5,6,7,10],
      dorian: [0,2,3,5,7,9,10],
      mixolydian: [0,2,4,5,7,9,10],
      chromatic: [0,1,2,3,4,5,6,7,8,9,10,11]
    };

    var noteMap = {
      'C':0,'C#':1,'D':2,'D#':3,'E':4,'F':5,
      'F#':6,'G':7,'G#':8,'A':9,'A#':10,'B':11
    };

    var root = noteMap[rootKey] || 0;
    var intervals = scales[scaleName] || scales.chromatic;
    var activeNotes = intervals.map(function(i) { return (root + i) % 12; });

    var keyboard = document.getElementById('noteGrid');
    if (!keyboard) return;

    keyboard.querySelectorAll('.piano-key').forEach(function(k) {
      var note = k.dataset.note;
      var semitone = noteMap[note];
      if (activeNotes.indexOf(semitone) !== -1) {
        k.classList.add('active');
      } else {
        k.classList.remove('active');
      }
    });
  }

  // ============================================
  // KEY / SCALE SELECTORS
  // ============================================

  initSelectors() {
    var self = this;
    var keySelect = document.getElementById('keySelect');
    var scaleSelect = document.getElementById('scaleSelect');

    function onChanged() {
      var key = keySelect ? keySelect.value : 'C';
      var scale = scaleSelect ? scaleSelect.value : 'major';

      // Update large display
      var keyDisp = document.getElementById('keyDisplay');
      var scaleDisp = document.getElementById('scaleDisplay');
      if (keyDisp) keyDisp.textContent = key;
      if (scaleDisp) scaleDisp.textContent = scale;

      // Update corrector
      if (self.pitchCorrector) {
        self.pitchCorrector.setParams({ key: key, scale: scale });
      }

      // Update keyboard
      self.updateKeyboardForScale(key, scale);
    }

    if (keySelect) keySelect.addEventListener('change', onChanged);
    if (scaleSelect) scaleSelect.addEventListener('change', onChanged);
  }

  // ============================================
  // PRESET CHIPS (bottom bar)
  // ============================================

  initPresetChips() {
    var self = this;
    var chips = document.querySelectorAll('.preset-chip');

    chips.forEach(function(chip) {
      chip.addEventListener('click', function(e) {
        e.preventDefault();

        // Remove active from all
        chips.forEach(function(c) { c.classList.remove('active'); });

        // Set this one active
        chip.classList.add('active');

        // Get preset
        var presetName = chip.dataset.preset;
        var preset = PitchCorrector.presets[presetName];

        if (preset) {
          self.applyPreset(preset);
        }

        // Sync top bar
        var idx = self.presetNames.indexOf(presetName);
        if (idx !== -1) {
          self.currentPresetIndex = idx;
          self.updatePresetName();
        }
      });
    });
  }

  // ============================================
  // PRESET NAVIGATION (top bar arrows)
  // ============================================

  initPresetNav() {
    var self = this;
    var prevBtn = document.getElementById('prevPreset');
    var nextBtn = document.getElementById('nextPreset');

    if (prevBtn) {
      prevBtn.addEventListener('click', function(e) {
        e.preventDefault();
        self.currentPresetIndex = (self.currentPresetIndex - 1 + self.presetNames.length) % self.presetNames.length;
        self.selectPresetByIndex(self.currentPresetIndex);
      });
    }

    if (nextBtn) {
      nextBtn.addEventListener('click', function(e) {
        e.preventDefault();
        self.currentPresetIndex = (self.currentPresetIndex + 1) % self.presetNames.length;
        self.selectPresetByIndex(self.currentPresetIndex);
      });
    }
  }

  selectPresetByIndex(index) {
    var name = this.presetNames[index];
    var preset = PitchCorrector.presets[name];

    if (preset) this.applyPreset(preset);

    // Update chips
    document.querySelectorAll('.preset-chip').forEach(function(c) {
      if (c.dataset.preset === name) {
        c.classList.add('active');
      } else {
        c.classList.remove('active');
      }
    });

    this.updatePresetName();
  }

  updatePresetName() {
    var el = document.getElementById('currentPresetName');
    if (el) {
      el.textContent = this.presetLabels[this.currentPresetIndex];
    }
  }

  applyPreset(preset) {
    var self = this;

    var mapping = [
      { param: 'correction', knobId: 'correctionKnob', valueId: 'correctionValue', format: function(v) { return Math.round(v) + '%'; } },
      { param: 'speed', knobId: 'speedKnob', valueId: 'speedValue', format: function(v) { return Math.round(v * 0.5) + 'ms'; } },
      { param: 'humanize', knobId: 'humanizeKnob', valueId: 'humanizeValue', format: function(v) { return Math.round(v).toString(); } },
      { param: 'formant', knobId: 'formantKnob', valueId: 'formantValue', format: function(v) { var st = Math.round((v-50)*0.24); return (st>=0?'+':'') + st; } },
      { param: 'mix', knobId: 'mixKnob', valueId: 'mixValue', format: function(v) { return Math.round(v).toString(); } }
    ];

    mapping.forEach(function(m) {
      var val = preset[m.param];
      if (val === undefined) return;

      var knob = self.knobs[m.knobId];
      if (knob) {
        knob.setValue(val);
        var el = document.getElementById(m.valueId);
        if (el) el.textContent = m.format(val);
      }
    });

    if (this.pitchCorrector) {
      this.pitchCorrector.setParams(preset);
    }
  }

  // ============================================
  // BUTTONS
  // ============================================

  initButtons() {
    var self = this;

    // Start / Stop
    var startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', function(e) {
        e.preventDefault();
        self.toggleListening();
      });
    }

    // Load file
    var fileBtn = document.getElementById('fileBtn');
    var fileInput = document.getElementById('audioFileInput');
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', function(e) {
        e.preventDefault();
        fileInput.click();
      });
      fileInput.addEventListener('change', function(e) {
        var file = e.target.files[0];
        if (file) self.loadAudioFile(file);
        fileInput.value = '';
      });
    }

    // Bypass
    var bypassBtn = document.getElementById('bypassBtn');
    if (bypassBtn) {
      bypassBtn.addEventListener('click', function(e) {
        e.preventDefault();
        self.isBypassed = !self.isBypassed;
        bypassBtn.classList.toggle('active', self.isBypassed);
      });
    }
  }

  // ============================================
  // VISUALIZER
  // ============================================

  initVisualizer() {
    this.visualizer = new PitchVisualizer('pitchCanvas');
    this.visualizer.startAnimation();
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

    this.syncAllParams();
  }

  syncAllParams() {
    if (!this.pitchCorrector) return;

    var keySelect = document.getElementById('keySelect');
    var scaleSelect = document.getElementById('scaleSelect');

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
          autoGainControl: false
        }
      });

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      var bufferSize = 2048;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      var self = this;
      this.processorNode.onaudioprocess = function(e) {
        self.processFrame(e);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isListening = true;
      this.updateButtonUI(true);

    } catch (err) {
      console.error('Mic error:', err);
      alert('Could not access microphone.\nAllow permission and use HTTPS.');
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
      this.mediaStream.getTracks().forEach(function(t) { t.stop(); });
      this.mediaStream = null;
    }
    if (this.pitchCorrector) {
      this.pitchCorrector.reset();
    }

    this.isListening = false;
    this.updateButtonUI(false);
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

      var arrayBuf = await file.arrayBuffer();
      var audioBuffer = await this.audioContext.decodeAudioData(arrayBuf);

      this.processFileViz(audioBuffer);
      this.playFile(audioBuffer);

    } catch (err) {
      console.error('File error:', err);
      alert('Could not load audio file.');
    }
  }

  processFileViz(audioBuffer) {
    var data = audioBuffer.getChannelData(0);
    var chunkSize = 2048;
    var hopSize = 1024;
    var self = this;

    this.visualizer.clear();
    var idx = 0;

    function process() {
      for (var c = 0; c < 8; c++) {
        if (idx >= data.length - chunkSize) return;

        var chunk = data.slice(idx, idx + chunkSize);
        var det = self.pitchDetector.detect(chunk);
        var noteInfo = self.pitchDetector.frequencyToNote(det.frequency);

        var target = det.frequency;
        if (noteInfo && det.frequency > 0) {
          var scaleNotes = self.pitchCorrector.getScaleNotes();
          target = self.pitchCorrector.getTargetFrequency(det.frequency, scaleNotes);
        }

        self.visualizer.pushData(det.frequency, target);
        self.updateDisplay(noteInfo, det);
        idx += hopSize;
      }
      requestAnimationFrame(process);
    }

    process();
  }

  playFile(audioBuffer) {
    this.fileSource = this.audioContext.createBufferSource();
    this.fileSource.buffer = audioBuffer;
    this.fileSource.connect(this.audioContext.destination);
    var self = this;
    this.fileSource.onended = function() { self.isPlayingFile = false; };
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
    var input = e.inputBuffer.getChannelData(0);
    var output = e.outputBuffer.getChannelData(0);

    var det = this.pitchDetector.detect(input);
    var noteInfo = this.pitchDetector.frequencyToNote(det.frequency);

    var target = det.frequency;
    if (noteInfo && det.frequency > 0) {
      var scaleNotes = this.pitchCorrector.getScaleNotes();
      target = this.pitchCorrector.getTargetFrequency(det.frequency, scaleNotes);
    }

    if (this.isBypassed) {
      output.set(input);
    } else {
      var corrected = this.pitchCorrector.processBuffer(input, det.frequency);
      output.set(corrected);
    }

    this.visualizer.pushData(det.frequency, target);
    if (this.visualizer.setClarity) {
      this.visualizer.setClarity(det.clarity);
    }
    this.updateDisplay(noteInfo, det);
  }

  // ============================================
  // DISPLAY UPDATES
  // ============================================

  updateDisplay(noteInfo, detection) {
    var noteEl = document.getElementById('currentNote');
    var freqEl = document.getElementById('currentFreq');
    var centsEl = document.getElementById('centsValue');
    var centsInd = document.getElementById('centsIndicator');

    if (noteInfo && detection && detection.frequency > 0) {
      if (noteEl) noteEl.textContent = noteInfo.note + noteInfo.octave;
      if (freqEl) freqEl.textContent = detection.frequency.toFixed(1) + ' Hz';

      if (centsEl) {
        var sign = noteInfo.cents > 0 ? '+' : '';
        centsEl.textContent = sign + noteInfo.cents;
      }

      // Cents indicator position (map -50..+50 to 0%..100%)
      if (centsInd) {
        var clamped = Math.max(-50, Math.min(50, noteInfo.cents));
        var pct = ((clamped + 50) / 100) * 100;
        centsInd.style.left = pct + '%';
      }

      // Highlight current piano key
      document.querySelectorAll('.piano-key').forEach(function(k) {
        k.classList.remove('current');
        if (k.dataset.note === noteInfo.note) {
          k.classList.add('current');
        }
      });

    } else {
      if (noteEl) noteEl.textContent = '—';
      if (freqEl) freqEl.textContent = '— Hz';
      if (centsEl) centsEl.textContent = '0';
      if (centsInd) centsInd.style.left = '50%';
      document.querySelectorAll('.piano-key').forEach(function(k) {
        k.classList.remove('current');
      });
    }
  }

  resetDisplay() {
    var noteEl = document.getElementById('currentNote');
    var freqEl = document.getElementById('currentFreq');
    var centsEl = document.getElementById('centsValue');
    var centsInd = document.getElementById('centsIndicator');

    if (noteEl) noteEl.textContent = '—';
    if (freqEl) freqEl.textContent = '0 Hz';
    if (centsEl) centsEl.textContent = '0';
    if (centsInd) centsInd.style.left = '50%';

    document.querySelectorAll('.piano-key').forEach(function(k) {
      k.classList.remove('current');
    });
  }

  updateButtonUI(listening) {
    var btn = document.getElementById('startBtn');
    var led = document.getElementById('statusLed');

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
      if (listening) {
        led.classList.add('active');
      } else {
        led.classList.remove('active');
      }
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  destroy() {
    this.stopListening();
    this.stopFile();
    if (this.visualizer) this.visualizer.destroy();
    var knobs = this.knobs;
    Object.keys(knobs).forEach(function(k) {
      if (knobs[k].destroy) knobs[k].destroy();
    });
    if (this.audioContext) this.audioContext.close();
  }
}

// ============================================
// BOOT
// ============================================
document.addEventListener('DOMContentLoaded', function() {
  window.wavrTune = new WavrTuneApp();
});
