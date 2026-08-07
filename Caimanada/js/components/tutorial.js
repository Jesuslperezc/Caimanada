// js/components/tutorial.js

const TUTORIAL_STEPS = [
  {
    target: '#active-sport-badge',
    text: '¡Bienvenido a Caimanada! Primero, selecciona el deporte que vas a gestionar.',
    event: 'change'
  },
  {
    target: '#btn-create-league',
    text: 'Para empezar, presiona este botón para ir a crear tu primera liga.',
    event: 'click'
  },
  {
    target: '#btn-open-create-modal',
    text: 'Ahora presiona aquí para registrar los datos de tu nuevo torneo.',
    event: 'click'
  },
  {
    target: '#nav-mobile-teams, #nav-desktop-teams',
    text: '¡Excelente! Ahora vamos a la sección de Equipos para registrar a los participantes.',
    event: 'click'
  },
  {
    target: '#btn-add-team',
    text: 'Finalmente, presiona aquí para agregar tu primer equipo. ¡Ya serás un Caimanero oficial!',
    event: 'click'
  }
];

let currentStep = 0;

export function startTutorialIfNeeded() {
  const tutorialDone = localStorage.getItem('caimanada_tutorial_done');
  if (tutorialDone !== 'true') {
    currentStep = 0;
    showStep();
  }
}

function showStep() {
  // Limpiar pasos anteriores
  document.querySelectorAll('.tutorial-highlight').forEach(el => el.classList.remove('tutorial-highlight'));
  const oldTooltip = document.getElementById('tutorial-tooltip');
  if (oldTooltip) oldTooltip.remove();

  if (currentStep >= TUTORIAL_STEPS.length) {
    localStorage.setItem('caimanada_tutorial_done', 'true');
    return;
  }

  const step = TUTORIAL_STEPS[currentStep];
  
  const tryShow = () => {
    // Buscar el elemento visible (por si hay versiones móvil/escritorio)
    const selectors = step.target.split(',').map(s => s.trim());
    let targetEl = null;
    
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      // Verificamos si el elemento existe y está visible en pantalla
      if (el && el.offsetParent !== null) {
        targetEl = el;
        break;
      }
    }

    if (targetEl) {
      targetEl.classList.add('tutorial-highlight');
      targetEl.scrollIntoView({ behavior: 'smooth', block: 'center' });

      const tooltip = document.createElement('div');
      tooltip.className = 'tutorial-tooltip';
      tooltip.id = 'tutorial-tooltip';
      tooltip.textContent = step.text;
      document.body.appendChild(tooltip);
      tooltip.style.display = 'block';

      // Posicionar el tooltip de forma inteligente
      setTimeout(() => {
        const rect = targetEl.getBoundingClientRect();
        
        // Si el botón está en la mitad inferior de la pantalla (ej. navbar móvil), el texto va arriba
        if (rect.top > window.innerHeight / 2) {
          tooltip.style.bottom = `${window.innerHeight - rect.top + 15}px`;
          tooltip.style.top = 'auto';
        } else {
          // Si está arriba (ej. navbar desktop o botón superior), el texto va abajo
          tooltip.style.top = `${rect.bottom + 15}px`;
          tooltip.style.bottom = 'auto';
        }
        
        // Centrar horizontalmente sin salirse de la pantalla
        let left = rect.left + (rect.width / 2) - (tooltip.offsetWidth / 2);
        if (left < 10) left = 10;
        if (left + tooltip.offsetWidth > window.innerWidth - 10) {
          left = window.innerWidth - tooltip.offsetWidth - 10;
        }
        tooltip.style.left = `${left}px`;
      }, 100);

      const advance = () => {
        targetEl.classList.remove('tutorial-highlight');
        tooltip.remove();
        currentStep++;
        // Esperar medio segundo a que la nueva vista cargue si hubo navegación
        setTimeout(showStep, 500);
      };

      // Escuchar el evento correcto para avanzar
      if (step.event === 'change') {
        targetEl.addEventListener('change', advance, { once: true });
      } else {
        targetEl.addEventListener('click', advance, { once: true });
      }

    } else {
      // Si el botón no existe en esta vista (ej. cambió de página), reintentar en 100ms
      setTimeout(tryShow, 100);
    }
  };
  
  tryShow();
}