// ============================================
// WAVR TUNE — 3D Metallic Knob Component
// Updated for new .knob-3d HTML structure
//
// Features:
// - Click + drag up/down to change value
// - Scroll wheel
// - Shift + drag for fine control
// - Double click to reset
// - Touch support
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

    // Find elements in new structure
    // Support both old (.knob-inner) and new (.knob-3d-cap) structures
    this.capEl = element.querySelector('.knob-3d-cap') || element.querySelector('.knob-inner');
    this.bodyEl = element.querySelector('.knob-3d-body');
    this.fillEl = element.querySelector('.knob-ring-fill') || element.querySelector('.knob-fill');

    this.init();
    this.updateVisual();
  }

  init() {
    // Mouse
    this.element.addEventListener('mousedown', (e) => this.onDragStart(e));
    this.boundDrag = (e) => this.onDragMove(e);
    this.boundDragEnd = () => this.onDragEnd();
    document.addEventListener('mousemove', this.boundDrag);
    document.addEventListener('mouseup', this.boundDragEnd);

    // Touch
    this.element.addEventListener('touchstart', (e) => this.onTouchStart(e), { passive: false });
    this.boundTouchMove = (e) => this.onTouchMove(e);
    this.boundTouchEnd = () => this.onDragEnd();
    document.addEventListener('touchmove', this.boundTouchMove, { passive: false });
    document.addEventListener('touchend', this.boundTouchEnd);

    // Double click reset
    this.element.addEventListener('dblclick', () => {
      this.value = this.defaultValue;
      this.updateVisual();
      this.onChange(this.value);
    });

    // Scroll wheel
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
    e.stopPropagation();
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
    const sensitivity = e.shiftKey ? 400 : 150;
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
    const sensitivity = 150;
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
    const normalized = (this.value - this.min) / (this.max - this.min);

    // Rotate: -135° to +135° (270° sweep)
    const angle = -135 + (normalized * 270);

    // Rotate the cap/body that holds the indicator
    if (this.capEl) {
      this.capEl.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'deg)';
    }

    // If there's a separate body element, rotate that too
    // (for the 3D structure where cap is inside body)
    if (this.bodyEl && !this.capEl) {
      this.bodyEl.style.transform = 'translate(-50%, -50%) rotate(' + angle + 'deg)';
    }

    // Update SVG ring fill
    if (this.fillEl) {
      var totalArc = (270 / 360) * (2 * Math.PI * 52); // ~245
      var filledArc = totalArc - (normalized * totalArc);
      this.fillEl.style.strokeDasharray = totalArc;
      this.fillEl.style.strokeDashoffset = filledArc;
    }
  }

  setValue(val) {
    this.value = this.clamp(val);
    this.updateVisual();
  }

  getValue() {
    return this.value;
  }

  destroy() {
    document.removeEventListener('mousemove', this.boundDrag);
    document.removeEventListener('mouseup', this.boundDragEnd);
    document.removeEventListener('touchmove', this.boundTouchMove);
    document.removeEventListener('touchend', this.boundTouchEnd);
  }
}

window.WavrKnob = WavrKnob;
