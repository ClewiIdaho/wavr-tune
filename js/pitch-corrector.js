// ============================================
// WAVR TUNE — Pitch Correction Engine
//
// This handles the actual pitch shifting:
// 1. Determines what scale/key notes are valid
// 2. Finds the nearest valid note to snap to
// 3. Calculates the pitch shift ratio
// 4. Applies granular pitch shifting
// 5. Blends dry/wet signal
// ============================================

class PitchCorrector {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;

    // ---- Scale Definitions ----
    // Each array contains semitone offsets from the root note
    this.scales = {
      major:       [0, 2, 4, 5, 7, 9, 11],
      minor:       [0, 2, 3, 5, 7, 8, 10],
      pentatonic:  [0, 2, 4, 7, 9],
      blues:       [0, 3, 5, 6, 7, 10],
      dorian:      [0, 2, 3, 5, 7, 9, 10],
      mixolydian:  [0, 2, 4, 5, 7, 9, 10],
      chromatic:   [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
    };

    // ---- Note Name to Semitone Mapping ----
    this.noteToSemitone = {
      'C': 0, 'C#': 1, 'D': 2, 'D#': 3,
      'E': 4, 'F': 5, 'F#': 6, 'G': 7,
      'G#': 8, 'A': 9, 'A#': 10, 'B': 11
    };

    // ---- User Parameters ----
    this.key = 'C';
    this.scale = 'major';
    this.correctionAmount = 0.75;   // 0 = no correction, 1 = full snap
    this.speed = 25;                // ms — lower = faster correction
    this.humanize = 0.3;            // 0 = robotic, 1 = very loose
    this.formantShift = 0;          // semitones shift for formant
    this.mix = 0.85;                // 0 = all dry, 1 = all wet

    // ---- Internal Processing State ----
    this.smoothedPitch = 0;
    this.smoothedRatio = 1.0;
    this.prevDetectedFreq = 0;
    this.grainSize = 1024;
    this.hopSize = 256;

    // Crossfade buffer for smooth transitions
    this.crossfadeLength = 128;
    this.prevOutput = new Float32Array(this.crossfadeLength);
    this.hasPrevOutput = false;
  }

  /**
   * Get the active scale notes as absolute semitone indices (0-11)
   * Based on current key and scale selection
   * 
   * Example: Key=D, Scale=major → [2, 4, 6, 7, 9, 11, 1]
   */
  getScaleNotes() {
    const rootSemitone = this.noteToSemitone[this.key] || 0;
    const scaleIntervals = this.scales[this.scale] || this.scales.chromatic;
    return scaleIntervals.map(interval => (rootSemitone + interval) % 12);
  }

  /**
   * Given a detected frequency, find the target frequency
   * (nearest note in the current scale)
   * 
   * Also applies humanize (random micro-deviation)
   */
  getTargetFrequency(detectedFreq, scaleNotes) {
    if (detectedFreq <= 0) return detectedFreq;

    // Convert frequency to fractional semitone number (relative to A4=440)
    const noteNum = 12 * Math.log2(detectedFreq / 440);

    // Search for the closest note in our scale
    let bestDistance = Infinity;
    let bestNoteNum = Math.round(noteNum);

    // Check +-6 semitones (half octave each way is enough)
    for (let offset = -6; offset <= 6; offset++) {
      const candidate = Math.round(noteNum) + offset;
      const noteIndex = ((candidate % 12) + 12) % 12;

      if (scaleNotes.includes(noteIndex)) {
        const distance = Math.abs(noteNum - candidate);
        if (distance < bestDistance) {
          bestDistance = distance;
          bestNoteNum = candidate;
        }
      }
    }

    // Perfect frequency for the target note
    let targetFreq = 440 * Math.pow(2, bestNoteNum / 12);

    // Apply humanize — adds tiny random pitch variation
    // This prevents the "robotic" sound of perfect pitch
    if (this.humanize > 0) {
      const maxCentsDeviation = this.humanize * 15; // up to ±15 cents
      const randomCents = (Math.random() - 0.5) * 2 * maxCentsDeviation;
      targetFreq = targetFreq * Math.pow(2, randomCents / 1200);
    }

    return targetFreq;
  }

  /**
   * Main processing method
   * Takes audio buffer + detected frequency
   * Returns pitch-corrected audio buffer
   */
  processBuffer(inputBuffer, detectedFrequency) {
    const scaleNotes = this.getScaleNotes();
    const targetFreq = this.getTargetFrequency(detectedFrequency, scaleNotes);

    // If no valid pitch detected, pass through unchanged
    if (detectedFrequency <= 0 || targetFreq <= 0) {
      return new Float32Array(inputBuffer);
    }

    // ---- Calculate shift ratio ----
    // ratio > 1 = shift up, ratio < 1 = shift down
    const shiftRatio = targetFreq / detectedFrequency;

    // Apply correction amount
    // Blends between no shift (1.0) and full shift
    const targetRatio = 1.0 + (shiftRatio - 1.0) * this.correctionAmount;

    // ---- Smooth the ratio over time ----
    // This is what the "speed" knob controls
    // Fast speed = quick snap, slow speed = gradual glide
    const speedSamples = Math.max(1, (this.speed / 1000) * this.sampleRate);
    const smoothingFactor = Math.min(1.0, inputBuffer.length / speedSamples);

    this.smoothedRatio = this.smoothedRatio + (targetRatio - this.smoothedRatio) * smoothingFactor;

    // ---- Apply the pitch shift ----
    const shifted = this.grainShift(inputBuffer, this.smoothedRatio);

    // ---- Crossfade with previous block for click-free transitions ----
    const output = this.crossfadeBlocks(shifted);

    // ---- Apply dry/wet mix ----
    const mixed = new Float32Array(inputBuffer.length);
    for (let i = 0; i < inputBuffer.length; i++) {
      mixed[i] = inputBuffer[i] * (1.0 - this.mix) + output[i] * this.mix;
    }

    // Store tail for next crossfade
    const tailStart = Math.max(0, mixed.length - this.crossfadeLength);
    for (let i = 0; i < this.crossfadeLength; i++) {
      if (tailStart + i < mixed.length) {
        this.prevOutput[i] = mixed[tailStart + i];
      }
    }
    this.hasPrevOutput = true;

    // Update tracking
    this.prevDetectedFreq = detectedFrequency;

    return mixed;
  }

  /**
   * Granular pitch shifting using resampling + overlap-add
   * 
   * How it works:
   * - To shift pitch UP: read through the input FASTER (skip samples)
   * - To shift pitch DOWN: read through the input SLOWER (stretch samples)
   * - Use linear interpolation for smooth sub-sample reading
   * - Apply Hann window at edges to prevent clicks
   */
  grainShift(input, ratio) {
    const length = input.length;
    const output = new Float32Array(length);

    // If ratio is very close to 1.0, just copy (no shift needed)
    if (Math.abs(ratio - 1.0) < 0.001) {
      output.set(input);
      return output;
    }

    // Resample the input at the shifted rate
    for (let i = 0; i < length; i++) {
      // Where to read from in the original signal
      const readPos = i * ratio;
      const readIndex = Math.floor(readPos);
      const fraction = readPos - readIndex;

      // Linear interpolation between two samples
      if (readIndex >= 0 && readIndex < length - 1) {
        output[i] = input[readIndex] * (1.0 - fraction) + input[readIndex + 1] * fraction;
      } else if (readIndex >= 0 && readIndex < length) {
        output[i] = input[readIndex];
      } else {
        output[i] = 0;
      }
    }

    // Apply Hann window fade at edges to prevent clicks
    const fadeLength = Math.min(64, Math.floor(length / 4));

    for (let i = 0; i < fadeLength; i++) {
      // Hann window: 0.5 * (1 - cos(PI * i / N))
      const fade = 0.5 * (1.0 - Math.cos(Math.PI * i / fadeLength));
      output[i] *= fade;                        // Fade in
      output[length - 1 - i] *= fade;           // Fade out
    }

    return output;
  }

  /**
   * Crossfade between current and previous block
   * Eliminates clicks at block boundaries
   */
  crossfadeBlocks(current) {
    if (!this.hasPrevOutput) return current;

    const output = new Float32Array(current);
    const fadeLen = Math.min(this.crossfadeLength, current.length);

    for (let i = 0; i < fadeLen; i++) {
      const fadeIn = i / fadeLen;
      const fadeOut = 1.0 - fadeIn;
      output[i] = current[i] * fadeIn + this.prevOutput[i] * fadeOut;
    }

    return output;
  }

  /**
   * Update parameters from UI controls
   * 
   * params: {
   *   key: 'C',           // Root note
   *   scale: 'major',     // Scale type
   *   correction: 75,     // 0-100 correction strength
   *   speed: 25,          // 0-100 mapped to ms
   *   humanize: 30,       // 0-100 randomization
   *   formant: 50,        // 0-100 (50 = no shift)
   *   mix: 85             // 0-100 dry/wet
   * }
   */
  setParams(params) {
    if (params.key !== undefined) {
      this.key = params.key;
    }
    if (params.scale !== undefined) {
      this.scale = params.scale;
    }
    if (params.correction !== undefined) {
      this.correctionAmount = params.correction / 100;
    }
    if (params.speed !== undefined) {
      // Map 0-100 to 0-50ms
      this.speed = params.speed * 0.5;
    }
    if (params.humanize !== undefined) {
      this.humanize = params.humanize / 100;
    }
    if (params.formant !== undefined) {
      // Map 0-100 to -12 to +12 semitones (50 = center = 0)
      this.formantShift = (params.formant - 50) * 0.24;
    }
    if (params.mix !== undefined) {
      this.mix = params.mix / 100;
    }
  }

  /**
   * Get current parameters (for saving state)
   */
  getParams() {
    return {
      key: this.key,
      scale: this.scale,
      correction: Math.round(this.correctionAmount * 100),
      speed: Math.round(this.speed * 2),
      humanize: Math.round(this.humanize * 100),
      formant: Math.round((this.formantShift / 0.24) + 50),
      mix: Math.round(this.mix * 100)
    };
  }

  /**
   * Reset smoothing state
   * Call this when switching tracks or restarting
   */
  reset() {
    this.smoothedRatio = 1.0;
    this.smoothedPitch = 0;
    this.prevDetectedFreq = 0;
    this.hasPrevOutput = false;
    this.prevOutput.fill(0);
  }
}

// ============================================
// PRESET DEFINITIONS
// ============================================

PitchCorrector.presets = {
  natural: {
    correction: 40,
    speed: 50,
    humanize: 60,
    formant: 50,
    mix: 70
  },
  soft: {
    correction: 65,
    speed: 35,
    humanize: 40,
    formant: 50,
    mix: 80
  },
  modern: {
    correction: 75,
    speed: 25,
    humanize: 30,
    formant: 50,
    mix: 85
  },
  hardtune: {
    correction: 95,
    speed: 5,
    humanize: 5,
    formant: 50,
    mix: 95
  },
  tpain: {
    correction: 100,
    speed: 0,
    humanize: 0,
    formant: 42,
    mix: 100
  }
};

// Make available globally
window.PitchCorrector = PitchCorrector;
