class LoadingState extends HTMLElement {
  static get observedAttributes() {
    return ['message'];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'message' && oldValue !== newValue) {
      const textNode = this.querySelector('.loading-state__text');
      if (textNode) {
        textNode.textContent = newValue || this.getDefaultMessage();
      }
    }
  }

  getDefaultMessage() {
    return 'Cargando datos del torneo...';
  }

  render() {
    this.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'loading-state';

    const spinner = document.createElement('div');
    spinner.className = 'loading-state__spinner';

    const text = document.createElement('p');
    text.className = 'loading-state__text';
    text.textContent = this.getAttribute('message') || this.getDefaultMessage();

    container.appendChild(spinner);
    container.appendChild(text);
    this.appendChild(container);
  }
}

if (!customElements.get('loading-state')) {
  customElements.define('loading-state', LoadingState);
}