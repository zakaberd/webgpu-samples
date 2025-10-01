export interface NumberControlOptions {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number;
  format?: (value: number) => string;
  onChange(value: number): void;
}

export interface NumberControlHandle {
  setValue(value: number): void;
}

export class ControlsPanel {
  readonly element: HTMLElement;
  private readonly list: HTMLElement;

  constructor(title?: string) {
    const container = document.createElement('section');
    container.className = 'controls-panel';

    if (title) {
      const heading = document.createElement('header');
      heading.className = 'controls-panel__header';
      heading.textContent = title;
      container.appendChild(heading);
    }

    this.list = document.createElement('div');
    this.list.className = 'controls-panel__list';
    container.appendChild(this.list);

    this.element = container;
  }

  addNumberControl(options: NumberControlOptions): NumberControlHandle {
    const field = document.createElement('label');
    field.className = 'controls-panel__field';

    const caption = document.createElement('span');
    caption.className = 'controls-panel__label';
    caption.textContent = options.label;
    field.appendChild(caption);

    const input = document.createElement('input');
    input.type = 'number';
    input.className = 'controls-panel__input';
    input.value = this.formatValue(options, options.value);
    if (typeof options.min === 'number') input.min = String(options.min);
    if (typeof options.max === 'number') input.max = String(options.max);
    if (typeof options.step === 'number') input.step = String(options.step);

    const handleInput = () => {
      const next = Number.parseFloat(input.value);
      if (Number.isFinite(next)) {
        options.onChange(next);
        input.value = this.formatValue(options, next);
      }
    };

    input.addEventListener('change', handleInput);
    input.addEventListener('blur', handleInput);

    field.appendChild(input);
    this.list.appendChild(field);

    return {
      setValue(value: number) {
        input.value = String(value);
      },
    };
  }

  private formatValue(options: NumberControlOptions, value: number): string {
    if (options.format) {
      return options.format(value);
    }
    const step = options.step ?? 0.01;
    const decimals = Math.max(0, Math.ceil(Math.log10(1 / step)));
    return value.toFixed(Math.min(decimals, 6));
  }

  appendCustomField(field: HTMLElement): void {
    this.list.appendChild(field);
  }
}
