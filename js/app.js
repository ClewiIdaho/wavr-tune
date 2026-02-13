// ============================================
// WAVR TUNE — Main Application Controller
//
// This is the brain that connects everything:
// - Initializes audio context
// - Sets up knobs, buttons, selectors
// - Handles microphone input
// - Handles audio file loading
// - Routes audio through detection → correction
// - Updates the visualizer and UI in real time
// ============================================

class WavrTuneApp {
  constructor() {
    // ---- Audio Nodes ----
    this.audioContext = null;
    this.analyserNode = null;
    this.sourceNode = null;
    this.processorNode = null;
    this.mediaStream = null;
    this.fileSource = null;

    // ---- State ----
    this.isListening = false;
    this.isBypassed = false;
    this.isPlayingFile = false;

    // ---- DSP Engines ----
    this.pitchDetector = null;
    this.pitchCorrector = null;
    this.visualizer = null;

    // ---- Knob instances ----
    this.knobs = {};

    // ---- Audio analysis buffer ----
    this.analyserBufferSize = 2048;
    this.analyserBuffer = null;

    // ---- Boot up ----
    this.init();
  }

  // ============================================
  // INITIALIZATION
  // ============================================

  init() {
    // Add SVG gradient for knob rings (needs to be in DOM)
    this.setupSVGGradients();

    // Initialize all knob controls
    this.setupKnobs();

    // Note grid click handlers
    this.setupNoteGrid();

    // Key and scale dropdowns
    this.setupSelectors();

    // Preset buttons
    this.setupPresets();

    // Start/Stop and Load buttons
    this.setupButtons();

    // Canvas pitch visualizer
    this.visualizer = new PitchVisualizer('pitchCanvas');
    this.visualizer.startAnimation();

    console.log('%c🎤 WAVR Tune initialized', 'color: #c084fc; font-weight: bold; font-size: 14px;');
  }

  /**
   * SVG gradient used by knob ring fills
   * Must exist in DOM for CSS url(#knobGradient) to work
   */
  setupSVGGradients() {
    const svgNS = 'http://www.w3.org/2000/svg';

    const svg = document.createElementNS(svgNS, 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.style.position = 'absolute';
    svg.style.pointerEvents = 'none';

    const defs = document.createElementNS(svgNS, 'defs');

    // Main knob gradient
    const gradient = document.createElementNS(svgNS, 'linearGradient');
    gradient.setAttribute('id', 'knobGradient');
    gradient.setAttribute('x1', '0%');
    gradient.setAttribute('y1', '0%');
    gradient.setAttribute('x2', '100%');
    gradient.setAttribute('y2', '100%');

    const stop1 = document.createElementNS(svgNS, 'stop');
    stop1.setAttribute('offset', '0%');
    stop1.setAttribute('stop-color', '#c084fc');

    const stop2 = document.createElementNS(svgNS, 'stop');
    stop2.setAttribute('offset', '50%');
    stop2.setAttribute('stop-color', '#a855f7');

    const stop3 = document.createElementNS(svgNS, 'stop');
    stop3.setAttribute('offset', '100%');
    stop3.setAttribute('stop-color', '#7c3aed');

    gradient.appendChild(stop1);
    gradient.appendChild(stop2);
    gradient.appendChild(stop3);
    defs.appendChild(gradient);
    svg.appendChild(defs);

    document.body.appendChild(svg);
  }

  // ============================================
  // KNOB SETUP
  // ============================================

  setupKnobs() {
    const knobConfigs = {
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
        format: (v) => Math.round(v) + '%',
        param: 'humanize'
      },
      formantKnob: {
        valueEl: 'formantValue',
        format: (v) => {
          const st = Math.round((v - 50) * 0.24);
          return (st >= 0 ? '+' : '') + st + 'st';
        },
        param: 'formant'
      },
      mixKnob: {
        valueEl: 'mixValue',
        format: (v) => Math.round(v) + '%',
        param: 'mix'
      }
    };

    Object.entries(knobConfigs).forEach(([id, config]) => {
      const element = document.getElementById(id);
      if (!element) {
        console.warn('Knob element not found:', id);
        return;
      }

      const valueDisplay = document.getElementById(config.valueEl);

      this.knobs[id] = new WavrKnob(element, {
        onChange: (value) => {
          // Update the value label
          if (valueDisplay) {
            valueDisplay.textContent = config.format(value);
          }

          // Send to pitch corrector if active
          if (this.pitchCorrector) {
            const paramObj = {};
            paramObj[config.param] = value;
            this.pitchCorrector.setParams(paramObj);
          }
        }
      });

      // Set initial display value
      if (valueDisplay) {
        valueDisplay.textContent = config.format(this.knobs[id].value);
      }
    });
  }

  // ============================================
  // NOTE GRID
  // ============================================

  setupNoteGrid() {
    const noteGrid = document.getElementById('noteGrid');
    if (!noteGrid) return;

    noteGrid.querySelectorAll('.note-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        btn.classList.toggle('active');
      });
    });
  }

  /**
   * Update note grid to match selected key/scale
   */
  updateNoteGridForScale(key, scaleName) {
    const scales = {
      major:       [0, 2, 4, 5, 7, 9, 11],
      minor:       [0, 2, 3, 5, 7, 8, 10],
      pentatonic:  [0, 2, 4, 7, 9],
      blues:       [0, 3, 5, 6, 7, 10],
      dorian:      [0, 2, 3, 5, 7, 9, 10],
      mixolydian:  [0, 2, 4, 5, 7, 9, 10],
      chromatic:   [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    };

    const noteToSemitone = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3,
      'E': 4, 'F': 5, 'F#': 6, 'G': 7,
      'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };

    const rootSemitone = noteToSemitone[key] || 0;
    const scaleIntervals = scales[scaleName] || scales.chromatic;
    const activeNotes = scaleIntervals.map(i => (rootSemitone + i) % 12);

    const noteGrid = document.getElementById('noteGrid');
    if (!noteGrid) return;

    noteGrid.querySelectorAll('.note-btn').forEach(btn => {
      const noteName = btn.dataset.note;
      const semitone = noteToSemitone[noteName];

      if (activeNotes.includes(semitone)) {
        btn.classList.add('active');
      } else {
        btn.classList.remove('active');
      }
    });
  }

  // ============================================
  // SELECTORS (Key, Scale, Input)
  // ============================================

  setupSelectors() {
    const keySelect = document.getElementById('keySelect');
    const scaleSelect = document.getElementById('scaleSelect');

    const onScaleChange = () => {
      const key = keySelect ? keySelect.value : 'C';
      const scale = scaleSelect ? scaleSelect.value : 'major';

      // Update the pitch corrector
      if (this.pitchCorrector) {
        this.pitchCorrector.setParams({ key: key, scale: scale });
      }

      // Update the note grid display
      this.updateNoteGridForScale(key, scale);
    };

    if (keySelect) keySelect.addEventListener('change', onScaleChange);
    if (scaleSelect) scaleSelect.addEventListener('change', onScaleChange);
  }

  // ============================================
  // PRESETS
  // ============================================

  setupPresets() {
    document.querySelectorAll('.preset-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        // Deactivate all preset buttons
        document.querySelectorAll('.preset-btn').forEach(b => {
          b.classList.remove('active');
        });

        // Activate clicked one
        btn.classList.add('active');

        // Get preset data
        const presetName = btn.dataset.preset;
        const preset = PitchCorrector.presets[presetName];

        if (preset) {
          this.applyPreset(preset);
        }
      });
    });
  }

  /**
   * Apply a preset — updates all knobs and the corrector
   */
  applyPreset(preset) {
    const knobMapping = {
      correction: {
        knobId: 'correctionKnob',
        valueEl: 'correctionValue',
        format: (v) => Math.round(v) + '%'
      },
      speed: {
        knobId: 'speedKnob',
        valueEl: 'speedValue',
        format: (v) => Math.round(v * 0.5) + 'ms'
      },
      humanize: {
        knobId: 'humanizeKnob',
        valueEl: 'humanizeValue',
        format: (v) => Math.round(v) + '%'
      },
      formant: {
        knobId: 'formantKnob',
        valueEl: 'formantValue',
        format: (v) => {
          const st = Math.round((v - 50) * 0.24);
          return (st >= 0 ? '+' : '') + st + 'st';
        }
      },
      mix: {
        knobId: 'mixKnob',
        valueEl: 'mixValue',
        format: (v) => Math.round(v) + '%'
      }
    };

    // Update each knob
    Object.entries(preset).forEach(([param, value]) => {
      const mapping = knobMapping[param];
      if (!mapping) return;

      const knob = this.knobs[mapping.knobId];
      if (knob) {
        knob.setValue(value);
        const valueEl = document.getElementById(mapping.valueEl);
        if (valueEl) {
          valueEl.textContent = mapping.format(value);
        }
      }
    });

    // Update the corrector engine
    if (this.pitchCorrector) {
      this.pitchCorrector.setParams(preset);
    }
  }

  // ============================================
  // BUTTONS
  // ============================================

  setupButtons() {
    // Start / Stop listening
    const startBtn = document.getElementById('startBtn');
    if (startBtn) {
      startBtn.addEventListener('click', () => this.toggleListening());
    }

    // Load audio file
    const fileBtn = document.getElementById('fileBtn');
    const fileInput = document.getElementById('audioFileInput');
    if (fileBtn && fileInput) {
      fileBtn.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadAudioFile(file);
        fileInput.value = ''; // Reset so same file can be loaded again
      });
    }

    // Bypass toggle
    const bypassBtn = document.getElementById('bypassBtn');
    if (bypassBtn) {
      bypassBtn.addEventListener('click', () => {
        this.isBypassed = !this.isBypassed;
        bypassBtn.classList.toggle('active', this.isBypassed);
        bypassBtn.textContent = this.isBypassed ? 'BYPASSED' : 'BYPASS';
      });
    }
  }

  // ============================================
  // AUDIO INITIALIZATION
  // ============================================

  async initAudio() {
    if (this.audioContext) return;

    this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
      sampleRate: 48000
    });

    // Resume context if suspended (browser autoplay policy)
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    // Create DSP engines
    this.pitchDetector = new PitchDetector(this.audioContext.sampleRate);
    this.pitchCorrector = new PitchCorrector(this.audioContext.sampleRate);

    // Create analyser for waveform data
    this.analyserNode = this.audioContext.createAnalyser();
    this.analyserNode.fftSize = this.analyserBufferSize;
    this.analyserBuffer = new Float32Array(this.analyserBufferSize);

    // Sync current knob values to the corrector
    this.syncAllParams();

    console.log('%c🔊 Audio initialized: ' + this.audioContext.sampleRate + 'Hz',
      'color: #a78bfa;');
  }

  /**
   * Push all current UI values to the pitch corrector
   */
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
  // MICROPHONE LISTENING
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

      // Stop any playing file
      this.stopFile();

      // Request microphone access
      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: false,
          noiseSuppression: false,
          autoGainControl: false,
          sampleRate: 48000
        }
      });

      // Create source from mic stream
      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);

      // ScriptProcessor for real-time processing
      // Note: ScriptProcessor is deprecated but widely supported
      // AudioWorklet would be the production upgrade
      const bufferSize = 2048;
      this.processorNode = this.audioContext.createScriptProcessor(bufferSize, 1, 1);

      // This fires for every audio buffer
      this.processorNode.onaudioprocess = (e) => {
        this.processAudioFrame(e);
      };

      // Connect: mic → processor → speakers
      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.audioContext.destination);

      this.isListening = true;
      this.updateListeningUI(true);

      console.log('%c🎤 Microphone active', 'color: #86efac;');

    } catch (err) {
      console.error('Microphone error:', err);
      alert('Could not access microphone.\n\nPlease allow microphone permission and try again.\n\nNote: HTTPS is required for microphone access.');
    }
  }

  stopListening() {
    // Disconnect audio nodes
    if (this.processorNode) {
      this.processorNode.disconnect();
      this.processorNode.onaudioprocess = null;
      this.processorNode = null;
    }
    if (this.sourceNode) {
      this.sourceNode.disconnect();
      this.sourceNode = null;
    }

    // Stop microphone stream
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    // Reset corrector state
    if (this.pitchCorrector) {
      this.pitchCorrector.reset();
    }

    this.isListening = false;
    this.updateListeningUI(false);

    // Reset display
    this.resetPitchDisplay();

    console.log('%c🔇 Microphone stopped', 'color: #fca5a5;');
  }

  // ============================================
  // AUDIO FILE LOADING
  // ============================================

  async loadAudioFile(file) {
    try {
      await this.initAudio();

      // Stop mic if active
      this.stopListening();
      this.stopFile();

      console.log('%c📂 Loading: ' + file.name, 'color: #a78bfa;');

      // Decode audio file
      const arrayBuffer = await file.arrayBuffer();
      const audioBuffer = await this.audioContext.decodeAudioData(arrayBuffer);

      // Process for visualization
      this.processFileForVisualization(audioBuffer);

      // Play the audio
      this.playFile(audioBuffer);

    } catch (err) {
      console.error('File load error:', err);
      alert('Could not load audio file.\n\nSupported formats: WAV, MP3, OGG, FLAC, AAC');
    }
  }

  /**
   * Analyze an audio file and push data to visualizer
   */
  processFileForVisualization(audioBuffer) {
    const channelData = audioBuffer.getChannelData(0);
    const chunkSize = 2048;
    const hopSize = 1024;

    // Clear previous data
    this.visualizer.clear();

    let processIndex = 0;

    const processChunk = () => {
      // Process several chunks per frame for speed
      const chunksPerFrame = 8;

      for (let c = 0; c < chunksPerFrame; c++) {
        if (processIndex >= channelData.length - chunkSize) {
          console.log('%c✅ File analysis complete', 'color: #86efac;');
          return;
        }

        const chunk = channelData.slice(processIndex, processIndex + chunkSize);

        // Detect pitch
        const detection = this.pitchDetector.detect(chunk);
        const noteInfo = this.pitchDetector.frequencyToNote(detection.frequency);

        // Get target frequency
        let targetFreq = detection.frequency;
        if (noteInfo && detection.frequency > 0) {
          const scaleNotes = this.pitchCorrector.getScaleNotes();
          targetFreq = this.pitchCorrector.getTargetFrequency(
            detection.frequency, scaleNotes
          );
        }

        // Push to visualizer
        this.visualizer.pushData(detection.frequency, targetFreq);

        // Update display with latest data
        this.updatePitchDisplay(noteInfo, detection);

        processIndex += hopSize;
      }

      requestAnimationFrame(processChunk);
    };

    processChunk();
  }

  /**
   * Play an audio buffer through speakers
   */
  playFile(audioBuffer) {
    this.fileSource = this.audioContext.createBufferSource();
    this.fileSource.buffer = audioBuffer;
    this.fileSource.connect(this.audioContext.destination);

    this.fileSource.onended = () => {
      this.isPlayingFile = false;
      console.log('%c⏹ Playback ended', 'color: #a78bfa;');
    };

    this.fileSource.start();
    this.isPlayingFile = true;
  }

  stopFile() {
    if (this.fileSource) {
      try {
        this.fileSource.stop();
      } catch (e) {
        // Already stopped
      }
      this.fileSource.disconnect();
      this.fileSource = null;
    }
    this.isPlayingFile = false;
  }

  // ============================================
  // REAL-TIME AUDIO PROCESSING
  // ============================================

  /**
   * Called for every audio buffer from ScriptProcessor
   * This is where detection and correction happen
   */
  processAudioFrame(e) {
    const inputData = e.inputBuffer.getChannelData(0);
    const outputData = e.outputBuffer.getChannelData(0);

    // Bypass mode — pass through unchanged
    if (this.isBypassed) {
      outputData.set(inputData);

      // Still detect pitch for visualization
      const detection = this.pitchDetector.detect(inputData);
      const noteInfo = this.pitchDetector.frequencyToNote(detection.frequency);
      this.visualizer.pushData(detection.frequency, detection.frequency);
      this.updatePitchDisplay(noteInfo, detection);
      return;
    }

    // ---- Step 1: Detect current pitch ----
    const detection = this.pitchDetector.detect(inputData);
    const noteInfo = this.pitchDetector.frequencyToNote(detection.frequency);

    // ---- Step 2: Get target pitch ----
    let targetFreq = detection.frequency;
    if (noteInfo && detection.frequency > 0) {
      const scaleNotes = this.pitchCorrector.getScaleNotes();
      targetFreq = this.pitchCorrector.getTargetFrequency(
        detection.frequency, scaleNotes
      );
    }

    // ---- Step 3: Apply pitch correction ----
    const corrected = this.pitchCorrector.processBuffer(
      inputData, detection.frequency
    );

    // Write corrected audio to output
    outputData.set(corrected);

    // ---- Step 4: Update visuals ----
    this.visualizer.pushData(detection.frequency, targetFreq);
    this.updatePitchDisplay(noteInfo, detection);
  }

  // ============================================
  // UI UPDATES
  // ============================================

  /**
   * Update the pitch display (note name, frequency, cents)
   */
  updatePitchDisplay(noteInfo, detection) {
    const noteEl = document.getElementById('currentNote');
    const freqEl = document.getElementById('currentFreq');
    const centsEl = document.querySelector('.cents-value');

    if (noteInfo && detection && detection.frequency > 0) {
      // Show detected note
      if (noteEl) noteEl.textContent = noteInfo.note + noteInfo.octave;
      if (freqEl) freqEl.textContent = detection.frequency.toFixed(1) + ' Hz';
      if (centsEl) {
        const sign = noteInfo.cents > 0 ? '+' : '';
        centsEl.textContent = sign + noteInfo.cents;
      }

      // Highlight the current note in the grid
      document.querySelectorAll('.note-btn').forEach(btn => {
        btn.classList.remove('current');
        if (btn.dataset.note === noteInfo.note) {
          btn.classList.add('current');
        }
      });

    } else {
      // No pitch detected
      if (noteEl) noteEl.textContent = '—';
      if (freqEl) freqEl.textContent = '— Hz';
      if (centsEl) centsEl.textContent = '0';

      document.querySelectorAll('.note-btn').forEach(btn => {
        btn.classList.remove('current');
      });
    }
  }

  /**
   * Reset the pitch display to idle state
   */
  resetPitchDisplay() {
    const noteEl = document.getElementById('currentNote');
    const freqEl = document.getElementById('currentFreq');
    const centsEl = document.querySelector('.cents-value');

    if (noteEl) noteEl.textContent = '—';
    if (freqEl) freqEl.textContent = '0 Hz';
    if (centsEl) centsEl.textContent = '0';

    document.querySelectorAll('.note-btn').forEach(btn => {
      btn.classList.remove('current');
    });
  }

  /**
   * Update the start/stop button appearance
   */
  updateListeningUI(listening) {
    const btn = document.getElementById('startBtn');
    if (!btn) return;

    if (listening) {
      btn.classList.add('listening');
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
          '<rect x="6" y="4" width="4" height="16" rx="1"/>' +
          '<rect x="14" y="4" width="4" height="16" rx="1"/>' +
        '</svg>' +
        'Stop Listening';
    } else {
      btn.classList.remove('listening');
      btn.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">' +
          '<path d="M8 5v14l11-7z"/>' +
        '</svg>' +
        'Start Listening';
    }

    // Update header status indicator
    const statusIndicator = document.querySelector('.status-indicator');
    const statusText = statusIndicator ? statusIndicator.querySelector('span:last-child') : null;

    if (statusIndicator) {
      statusIndicator.classList.toggle('active', listening);
    }
    if (statusText) {
      statusText.textContent = listening ? 'Listening' : 'Idle';
    }
  }

  // ============================================
  // CLEANUP
  // ============================================

  destroy() {
    this.stopListening();
    this.stopFile();

    if (this.visualizer) {
      this.visualizer.destroy();
    }

    // Destroy all knobs
    Object.values(this.knobs).forEach(knob => {
      if (knob.destroy) knob.destroy();
    });

    if (this.audioContext) {
      this.audioContext.close();
    }

    console.log('%c👋 WAVR Tune destroyed', 'color: #fca5a5;');
  }
}

// ============================================
// BOOT — Start the app when page loads
// ============================================

document.addEventListener('DOMContentLoaded', () => {
  window.wavrTune = new WavrTuneApp();
});
