// ============================================
// WAVR TUNE — Glossy Knob Component
// Drag up/down to change value
// Scroll wheel support
// Double-click to reset
// ============================================

class WavrKnob {
  constructor(element, options = {}) {
    this.element = element;
    this.min = parseFloat(element.dataset.min) || 0;
    this.max = parseFloat(element.dataset.max) || 100;
    this.value = parseFloat(element.dataset.value) || 50;
    this.step = options.step || 1;
    this.onChange = options.onChange || (() => {});
    this.defaultValue = this.value;

    this.isDragging = false;
    this.startY = 0;
    this.startValue = 0;

    // DOM references
    this.innerEl = element.querySelector('.knob-inner');
    this.gripEl = element.querySelector('.knob-grip');
    this.fillEl = element.querySelector('.knob-fill');

    this.init();
    this.updateVisual();
  }

  init() {
    // Mouse events
    this.element.addEventListener('mousedown', (e) => this.onDragStart(e));
    
    // We bind to document so dragging works even if cursor leaves the knob
    this.boundDrag = (e) => this.onDragMove(e);
    this.boundDragEnd = () => this.onDragEnd();
    document.addEventListener('mousemove', this.boundDrag);
    document.addEventListener('mouseup', this.boundDragEnd);

    // Touch events for mobile
    this.element.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.boundTouchMove = (e) => this.onTouchMove(e);
    this.boundTouchEnd = () => this.onDragEnd();
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);

    // Double click resets to default
    this.element.addEventListener('dblclick', () => {
      this.value = this.defaultValue;
      this.updateVisual();
      this.onChange(this.value);
    });

    // Scroll wheel for fine control
    this.element.addEventListener('wheel', (e) => {
      e.preventDefault();
      const direction = e.deltaY > 0 ? -1 : 1;
      const increment = e.shiftKey ? this.step * 5 : this.step;
      this.value = this.clamp(this.value + (direction * increment));
      this.updateVisual();
      this.onChange(this.value);
    }, { passive: false });
  }

  onDragStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.startY = e.clientY;
    this.startValue = this.value;
    this.element.classList.add('active');
    document.body.style.cursor = 'grabbing';
    document.body.style.userSelect = 'none';
  }

  onTouchStart(e) {
    e.preventDefault();
    this.isDragging = true;
    this.startY = e.touches[0].clientY;
    this.startValue = this.value;
    this.element.classList.add('active');
  }

  onDragMove(e) {
    if (!this.isDragging) return;

    const deltaY = this.startY - e.clientY;
    const range = this.max - this.min;
    const sensitivity = e.shiftKey ? 400 : 200; // shift = fine control
    const newValue = this.startValue + (deltaY / sensitivity) * range;

    this.value = this.clamp(Math.round(newValue / this.step) * this.step);
    this.updateVisual();
    this.onChange(this.value);
  }

  onTouchMove(e) {
    if (!this.isDragging) return;
    e.preventDefault();

    const deltaY = this.startY - e.touches[0].clientY;
    const range = this.max - this.min;
    const sensitivity = 200;
    const newValue = this.startValue + (deltaY / sensitivity) * range;

    this.value = this.clamp(Math.round(newValue / this.step) * this.step);
    this.updateVisual();
    this.onChange(this.value);
  }

  onDragEnd() {
    if (!this.isDragging) return;
    this.isDragging = false;
    this.element.classList.remove('active');
    document.body.style.cursor = '';
    document.body.style.userSelect = '';
  }

  clamp(val) {
    return Math.min(this.max, Math.max(this.min, val));
  }

  updateVisual() {
    // Normalize value 0-1
    const normalized = (this.value - this.min) / (this.max - this.min);

    // Rotation: -135deg (min) to +135deg (max) = 270deg total sweep
    const angle = -135 + (normalized * 270);

    // Rotate the inner knob disc + grip indicator
    if (this.innerEl) {
      this.innerEl.style.transform = `translate(-50%, -50%) rotate(${angle}deg)`;
    }

    // Update SVG ring arc fill
    if (this.fillEl) {
      // Circle circumference = 2 * PI * r = 2 * 3.14159 * 52 ≈ 326.7
      // We only use 270/360 of it = ~245
      const totalArc = (270 / 360) * (2 * Math.PI * 52);
      const filledArc = totalArc - (normalized * totalArc);
      this.fillEl.style.strokeDasharray = `${totalArc}`;
      this.fillEl.style.strokeDashoffset = `${filledArc}`;
    }
  }

  setValue(val) {
    this.value = this.clamp(val);
    this.updateVisual();
  }

  getValue() {
    return this.value;
  }

  // Clean up event listeners if needed
  destroy() {
    document.removeEventListener('mousemove', this.boundDrag);
    document.removeEventListener('mouseup', this.boundDragEnd);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
  }
}

// Make available globally
window.WavrKnob = WavrKnob;
