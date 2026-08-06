class CaimanToast extends HTMLElement {
  static get observedAttributes() {
    return ['title', 'message', 'type'];
  }

  constructor() {
    super();
  }

  connectedCallback() {
    this.render();
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && this.isConnected) {
      this.render();
    }
  }

  getIcon(type) {
    switch (type) {
      case 'champion': // Trofeo / Campeón de Torneo
        return `
          <svg class="cmd-toast__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
          </svg>`;
      case 'danger': // Error o Falta Grave
        return `
          <svg class="cmd-toast__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <circle cx="12" cy="12" r="10"></circle>
            <line x1="15" y1="9" x2="9" y2="15"></line>
            <line x1="9" y1="9" x2="15" y2="15"></line>
          </svg>`;
      case 'warning': // Advertencia
        return `
          <svg class="cmd-toast__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
            <line x1="12" y1="9" x2="12" y2="13"></line>
            <line x1="12" y1="17" x2="12.01" y2="17"></line>
          </svg>`;
      case 'success': // Guardado Exitoso / Gol
      default:
        return `
          <svg class="cmd-toast__svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="20 6 9 17 4 12"></polyline>
          </svg>`;
    }
  }

  render() {
    const type = this.getAttribute('type') || 'success';
    const title = this.getAttribute('title') || '¡CAIMANAZO!';
    const message = this.getAttribute('message') || 'Datos guardados correctamente';

    this.innerHTML = `
      <div class="cmd-toast cmd-toast--${type}" role="alert">
        <div class="cmd-toast__badge">
          ${this.getIcon(type)}
        </div>
        <div class="cmd-toast__body">
          <span class="cmd-toast__tag">${title}</span>
          <p class="cmd-toast__msg">${message}</p>
        </div>
        <div class="cmd-toast__lightbar"></div>
      </div>
    `;
  }
}

if (!customElements.get('caiman-toast')) {
  customElements.define('caiman-toast', CaimanToast);
}

/**
 * Servicio comercial de Alertas CaimanaDa
 */
export const AlertService = {
  playSound(type) {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const now = ctx.currentTime;

      osc.connect(gain);
      gain.connect(ctx.destination);

      if (type === 'champion') {
        // Tono épico de campeonato
        osc.type = 'square';
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(554.37, now + 0.08);
        osc.frequency.setValueAtTime(659.25, now + 0.16);
        osc.frequency.setValueAtTime(880, now + 0.24);
        gain.gain.setValueAtTime(0.08, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.7);
        osc.start(now);
        osc.stop(now + 0.7);
      } else if (type === 'danger') {
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.linearRampToValueAtTime(90, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } else if (type === 'warning') {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(350, now);
        osc.frequency.setValueAtTime(700, now + 0.1);
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } else {
        // Caimanazo estándar (Guardado limpio)
        osc.type = 'sine';
        osc.frequency.setValueAtTime(587.33, now);
        osc.frequency.setValueAtTime(880, now + 0.07);
        gain.gain.setValueAtTime(0.12, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        osc.start(now);
        osc.stop(now + 0.4);
      }
    } catch (e) {
      // Ignorar restricciones de audio del navegador
    }
  },

  show(message, title = '¡CAIMANAZO!', type = 'success', duration = 3800) {
    let container = document.getElementById('cmd-toast-container');

    if (!container) {
      container = document.createElement('div');
      container.id = 'cmd-toast-container';
      container.className = 'cmd-toast-container';
      document.body.appendChild(container);
    }

    const toast = document.createElement('caiman-toast');
    toast.setAttribute('title', title.toUpperCase());
    toast.setAttribute('message', message);
    toast.setAttribute('type', type);

    container.appendChild(toast);
    this.playSound(type);

    setTimeout(() => {
      toast.classList.add('is-leaving');
      toast.addEventListener('animationend', () => {
        toast.remove();
      });
    }, duration);
  },

  showSuccess(message, title = '¡REGISTRO EXITOSO!') {
    this.show(message, title, 'success');
  },

  showChampion(message, title = '¡CORONADOS!') {
    this.show(message, title, 'champion', 5000);
  },

  showWarning(message, title = '¡OJO AHÍ!') {
    this.show(message, title, 'warning');
  },

  showError(message, title = '¡FALTA CEMENTO!') {
    this.show(message, title, 'danger');
  }
};