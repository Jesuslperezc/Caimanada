class ErrorState extends HTMLElement {
  static get observedAttributes() {
    return ['message'];
  }

  constructor() {
    super();
    this.onRetryCallback = null;
  }

  static get defaultMessage() {
    return 'Ocurrió un error al cargar la información del torneo.';
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (name === 'message' && oldValue !== newValue) {
      const textNode = this.querySelector('.error-state__text');
      if (textNode) {
        textNode.textContent = newValue || ErrorState.defaultMessage;
      }
    }
  }

  /**
   * Método público para configurar mensaje y callback de reintento dinámicamente
   * @param {string} message - Mensaje de error
   * @param {Function} [onRetry] - Callback a ejecutar al presionar 'Reintentar'
   */
  setError(message, onRetry) {
    if (message) this.setAttribute('message', message);
    if (typeof onRetry === 'function') this.onRetryCallback = onRetry;
    this.render();
  }

  render() {
    this.innerHTML = '';

    const container = document.createElement('div');
    container.className = 'error-state';

    const icon = document.createElement('div');
    icon.className = 'error-state__icon';
    icon.setAttribute('aria-hidden', 'true');
    icon.textContent = '⚠️';

    const text = document.createElement('p');
    text.className = 'error-state__text';
    text.textContent = this.getAttribute('message') || ErrorState.defaultMessage;

    container.appendChild(icon);
    container.appendChild(text);

    if (this.onRetryCallback) {
      const retryBtn = document.createElement('button');
      retryBtn.type = 'button';
      retryBtn.className = 'btn btn--primary error-state__btn';
      retryBtn.textContent = 'Reintentar';

      retryBtn.addEventListener('click', () => {
        // Disparar CustomEvent por si la vista escucha el evento dinámicamente
        this.dispatchEvent(new CustomEvent('retry', { bubbles: true }));
        
        // Ejecutar callback directo
        if (this.onRetryCallback) {
          this.onRetryCallback();
        }
      });

      container.appendChild(retryBtn);
    }

    this.appendChild(container);
  }
}

if (!customElements.get('error-state')) {
  customElements.define('error-state', ErrorState);
}