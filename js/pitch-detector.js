// ============================================
// WAVR TUNE — YIN Pitch Detection Algorithm
// 
// The YIN algorithm is one of the most accurate
// methods for detecting pitch in audio signals.
// It works by finding the fundamental frequency
// through autocorrelation with cumulative mean
// normalized difference.
//
// Reference: "YIN, a fundamental frequency estimator
// for speech and music" - de Cheveigné & Kawahara
// ============================================

class PitchDetector {
  constructor(sampleRate = 48000) {
    this.sampleRate = sampleRate;
    this.bufferSize = 2048;
    this.threshold = 0.15; // YIN threshold — lower = more selective

    // All 12 chromatic note names
    this.noteStrings = [
      'C', 'C#', 'D', 'D#', 'E', 'F',
      'F#', 'G', 'G#', 'A', 'A#', 'B'
    ];

    // Pre-allocate buffers for performance
    this.yinBuffer = new Float32Array(Math.floor(this.bufferSize / 2));
  }

  /**
   * Main detection method
   * Takes a Float32Array of audio samples
   * Returns { frequency, clarity }
   *   frequency: detected pitch in Hz (-1 if none)
   *   clarity: confidence 0-1 (higher = more certain)
   */
  detect(audioBuffer) {
    const buffer = audioBuffer;
    const bufferSize = buffer.length;
    const halfBuffer = Math.floor(bufferSize / 2);

    // ---- STEP 1: Check signal energy ----
    // If the signal is too quiet, skip detection
    let rms = 0;
    for (let i = 0; i < bufferSize; i++) {
      rms += buffer[i] * buffer[i];
    }
    rms = Math.sqrt(rms / bufferSize);

    if (rms < 0.01) {
      return { frequency: -1, clarity: 0 };
    }

    // ---- STEP 2: Difference function ----
    // For each lag tau, compute the squared difference
    // between the signal and its shifted version
    const yinBuffer = this.yinBuffer;

    for (let tau = 0; tau < halfBuffer; tau++) {
      yinBuffer[tau] = 0;
      for (let i = 0; i < halfBuffer; i++) {
        const delta = buffer[i] - buffer[i + tau];
        yinBuffer[tau] += delta * delta;
      }
    }

    // ---- STEP 3: Cumulative mean normalized difference ----
    // Normalize each value by the running average
    // This prevents the function from always choosing tau=0
    yinBuffer[0] = 1;
    let runningSum = 0;

    for (let tau = 1; tau < halfBuffer; tau++) {
      runningSum += yinBuffer[tau];
      yinBuffer[tau] *= tau / runningSum;
    }

    // ---- STEP 4: Absolute threshold ----
    // Find the first dip below the threshold
    // Then walk forward to find the true minimum
    let tauEstimate = -1;

    for (let tau = 2; tau < halfBuffer; tau++) {
      if (yinBuffer[tau] < this.threshold) {
        // Walk to the bottom of this dip
        while (tau + 1 < halfBuffer && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        tauEstimate = tau;
        break;
      }
    }

    // No pitch found
    if (tauEstimate === -1) {
      return { frequency: -1, clarity: 0 };
    }

    // ---- STEP 5: Parabolic interpolation ----
    // Refine the tau estimate for sub-sample accuracy
    // Fits a parabola through 3 points around the minimum
    let betterTau;
    const x0 = tauEstimate < 1 ? tauEstimate : tauEstimate - 1;
    const x2 = tauEstimate + 1 < halfBuffer ? tauEstimate + 1 : tauEstimate;

    if (x0 === tauEstimate) {
      betterTau = yinBuffer[tauEstimate] <= yinBuffer[x2] ? tauEstimate : x2;
    } else if (x2 === tauEstimate) {
      betterTau = yinBuffer[tauEstimate] <= yinBuffer[x0] ? tauEstimate : x0;
    } else {
      const s0 = yinBuffer[x0];
      const s1 = yinBuffer[tauEstimate];
      const s2 = yinBuffer[x2];

      // Parabolic fit
      betterTau = tauEstimate + (s2 - s0) / (2 * (2 * s1 - s2 - s0));
    }

    // ---- STEP 6: Convert tau to frequency ----
    const frequency = this.sampleRate / betterTau;
    const clarity = 1 - yinBuffer[tauEstimate];

    // Sanity check: human voice + instrument range
    // Below 50Hz or above 1200Hz is likely noise
    if (frequency < 50 || frequency > 1200) {
      return { frequency: -1, clarity: 0 };
    }

    return {
      frequency: frequency,
      clarity: Math.max(0, Math.min(1, clarity))
    };
  }

  /**
   * Convert a frequency (Hz) to musical note info
   * Returns null if frequency is invalid
   * 
   * Returns {
   *   note: 'A',        // Note name
   *   octave: 4,        // Octave number
   *   cents: -12,       // Cents deviation from perfect pitch
   *   frequency: 440,   // Input frequency
   *   targetFrequency: 440, // Perfect pitch for this note
   *   noteIndex: 9,     // 0-11 chromatic index (C=0)
   *   midiNote: 69      // MIDI note number
   * }
   */
  frequencyToNote(frequency) {
    if (frequency <= 0) return null;

    // How many semitones from A4 (440Hz)
    const noteNum = 12 * Math.log2(frequency / 440);
    const roundedNote = Math.round(noteNum);

    // How many cents off from the nearest note
    const cents = Math.round((noteNum - roundedNote) * 100);

    // Note name (0 = C, 1 = C#, etc.)
    const noteIndex = ((roundedNote % 12) + 12) % 12;

    // Octave number
    const octave = Math.floor((roundedNote + 69) / 12) - 1;

    // The perfect frequency for this note
    const targetFrequency = 440 * Math.pow(2, roundedNote / 12);

    // MIDI note number (A4 = 69)
    const midiNote = roundedNote + 69;

    return {
      note: this.noteStrings[noteIndex],
      octave: octave,
      cents: cents,
      frequency: frequency,
      targetFrequency: targetFrequency,
      noteIndex: noteIndex,
      midiNote: midiNote
    };
  }

  /**
   * Find the nearest note that belongs to a given scale
   * 
   * scaleNotes: array of note indices (0-11) that are in the scale
   * Example: C major = [0, 2, 4, 5, 7, 9, 11]
   * 
   * Returns {
   *   frequency: target frequency,
   *   noteIndex: 0-11,
   *   midiNote: MIDI number,
   *   centsOff: how far the input was from this note
   * }
   */
  getNearestScaleNote(frequency, scaleNotes) {
    if (frequency <= 0 || !scaleNotes || scaleNotes.length === 0) {
      return null;
    }

    const noteNum = 12 * Math.log2(frequency / 440);
    let bestDistance = Infinity;
    let bestNoteNum = Math.round(noteNum);

    // Search nearby notes (one octave each direction is plenty)
    for (let offset = -12; offset <= 12; offset++) {
      const candidateNoteNum = Math.round(noteNum) + offset;
      const noteIndex = ((candidateNoteNum % 12) + 12) % 12;

      // Is this note in our scale?
      if (scaleNotes.includes(noteIndex)) {
        const candidateFreq = 440 * Math.pow(2, candidateNoteNum / 12);
        // Distance in cents
        const distance = Math.abs(1200 * Math.log2(frequency / candidateFreq));

        if (distance < bestDistance) {
          bestDistance = distance;
          bestNoteNum = candidateNoteNum;
        }
      }
    }

    return {
      frequency: 440 * Math.pow(2, bestNoteNum / 12),
      noteIndex: ((bestNoteNum % 12) + 12) % 12,
      midiNote: bestNoteNum + 69,
      centsOff: bestDistance
    };
  }

  /**
   * Set detection sensitivity
   * Lower threshold = more selective (fewer false detections)
   * Higher threshold = more sensitive (catches quieter notes)
   * Recommended range: 0.05 - 0.30
   */
  setThreshold(value) {
    this.threshold = Math.max(0.01, Math.min(0.5, value));
  }

  /**
   * Get frequency for a specific note and octave
   * Useful for reference / calibration
   */
  noteToFrequency(noteName, octave) {
    const noteIndex = this.noteStrings.indexOf(noteName);
    if (noteIndex === -1) return 0;

    const midiNote = (octave + 1) * 12 + noteIndex;
    return 440 * Math.pow(2, (midiNote - 69) / 12);
  }
}

// Make available globally
window.PitchDetector = PitchDetector;
