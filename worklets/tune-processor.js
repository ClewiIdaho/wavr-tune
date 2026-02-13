// ============================================
// WAVR TUNE — AudioWorklet Processor
//
// This is a future upgrade path from ScriptProcessor.
// AudioWorklet runs on a dedicated audio thread
// for lower latency and better performance.
//
// Currently the app uses ScriptProcessor (wider support)
// but this file is ready for when you want to upgrade.
//
// To activate: 
//   await audioContext.audioWorklet.addModule('worklets/tune-processor.js');
//   const node = new AudioWorkletNode(audioContext, 'tune-processor');
// ============================================

class TuneProcessor extends AudioWorkletProcessor {
  constructor() {
    super();

    // ---- State ----
    this.bypassed = false;
    this.correctionAmount = 0.75;
    this.speed = 25;
    this.mix = 0.85;
    this.smoothedRatio = 1.0;

    // Ring buffer for pitch detection
    this.bufferSize = 2048;
    this.inputRing = new Float32Array(this.bufferSize);
    this.writeIndex = 0;
    this.samplesCollected = 0;

    // ---- Listen for messages from main thread ----
    this.port.onmessage = (event) => {
      this.handleMessage(event.data);
    };

    // Let main thread know we're ready
    this.port.postMessage({ type: 'ready' });
  }

  /**
   * Handle messages from the main thread
   */
  handleMessage(data) {
    switch (data.type) {
      case 'setParams':
        if (data.correction !== undefined) {
          this.correctionAmount = data.correction / 100;
        }
        if (data.speed !== undefined) {
          this.speed = data.speed;
        }
        if (data.mix !== undefined) {
          this.mix = data.mix / 100;
        }
        break;

      case 'bypass':
        this.bypassed = data.value;
        break;

      case 'reset':
        this.smoothedRatio = 1.0;
        this.inputRing.fill(0);
        this.writeIndex = 0;
        this.samplesCollected = 0;
        break;
    }
  }

  /**
   * Main audio processing callback
   * Called for every 128-sample block
   *
   * inputs[0][0] = first input, first channel (mono)
   * outputs[0][0] = first output, first channel
   */
  process(inputs, outputs, parameters) {
    const input = inputs[0];
    const output = outputs[0];

    // No input connected
    if (!input || !input[0] || input[0].length === 0) {
      return true;
    }

    const inputChannel = input[0];
    const outputChannel = output[0];

    // Bypass mode — pass through
    if (this.bypassed) {
      outputChannel.set(inputChannel);
      this.sendAudioData(inputChannel);
      return true;
    }

    // Write incoming samples to ring buffer
    for (let i = 0; i < inputChannel.length; i++) {
      this.inputRing[this.writeIndex] = inputChannel[i];
      this.writeIndex = (this.writeIndex + 1) % this.bufferSize;
      this.samplesCollected++;
    }

    // For now pass through audio
    // Full pitch correction would happen here using the ring buffer
    // The main thread handles correction via ScriptProcessor currently
    for (let i = 0; i < inputChannel.length; i++) {
      outputChannel[i] = inputChannel[i] * this.mix + inputChannel[i] * (1.0 - this.mix);
    }

    // Send audio data to main thread for visualization
    // Only send every N samples to avoid flooding
    if (this.samplesCollected >= this.bufferSize) {
      this.sendAudioData(this.inputRing);
      this.samplesCollected = 0;
    }

    return true; // Keep processor alive
  }

  /**
   * Send audio data to main thread for pitch detection + visualization
   */
  sendAudioData(buffer) {
    // Copy buffer since it will be reused
    const copy = new Float32Array(buffer.length);
    copy.set(buffer);

    this.port.postMessage({
      type: 'audioData',
      buffer: copy
    }, [copy.buffer]); // Transfer ownership for performance
  }

  /**
   * Static getter for parameter descriptors
   * These can be automated by the Web Audio API
   */
  static get parameterDescriptors() {
    return [
      {
        name: 'correction',
        defaultValue: 75,
        minValue: 0,
        maxValue: 100,
        automationRate: 'k-rate'
      },
      {
        name: 'speed',
        defaultValue: 25,
        minValue: 0,
        maxValue: 100,
        automationRate: 'k-rate'
      },
      {
        name: 'mix',
        defaultValue: 85,
        minValue: 0,
        maxValue: 100,
        automationRate: 'k-rate'
      }
    ];
  }
}

// Register the processor
registerProcessor('tune-processor', TuneProcessor);
