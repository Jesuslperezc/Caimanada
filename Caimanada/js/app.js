import { initRouter } from './utils/router.js';
import { initNavbar, renderUserAvatar } from './components/navbar.js';
import { initSportSwitcher } from './components/sportSwitcher.js';
import { initSession } from './utils/session.js';
import { startTutorialIfNeeded } from './components/tutorial.js';
import { initGlobalFooter } from './components/footer.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSportSwitcher();
  initGlobalFooter();
  
  // === INICIALIZACIÓN DEL DROPDOWN CUSTOM HÍBRIDO ===
  initCustomSportDropdown();

  initSession(() => {
    renderUserAvatar();
    startTutorialIfNeeded();
    initRouter(); 
  });
});

/**
 * Puente entre el <select> nativo y el Custom Dropdown visual.
 * Evita modificar la lógica de sportSwitcher.js.
 */
function initCustomSportDropdown() {
  const trigger = document.getElementById('sport-badge-trigger');
  const dropdown = document.getElementById('sportDropdown');
  const arrow = document.getElementById('sportArrow');
  const selectedText = document.getElementById('selectedSport');
  const nativeSelect = document.getElementById('active-sport-selector');

  // Si no existen los elementos (ej. en otra vista), no hacemos nada
  if (!trigger || !nativeSelect) return;

  // Función para sincronizar el visual con el nativo
  function syncCustomDropdown() {
    dropdown.innerHTML = ''; // Limpiar menú visual
    
    Array.from(nativeSelect.options).forEach(option => {
      const item = document.createElement('div');
      item.className = 'sport-dropdown-item' + (option.selected ? ' active' : '');
      item.textContent = option.text;
      item.dataset.value = option.value;
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        nativeSelect.value = option.value; // Actualizar select nativo
        selectedText.textContent = option.text; // Actualizar texto visual
        
        // Disparar evento change para que sportSwitcher.js reaccione
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        
        // Actualizar clase activa visual
        dropdown.querySelectorAll('.sport-dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        
        closeDropdown();
      });
      
      dropdown.appendChild(item);
    });

    // Actualizar texto inicial mostrado
    const selectedOption = nativeSelect.options[nativeSelect.selectedIndex];
    if (selectedOption) {
      selectedText.textContent = selectedOption.text;
    }
  }

  // Observar cambios en el select nativo (por si sportSwitcher inyecta opciones dinámicamente)
  const observer = new MutationObserver(syncCustomDropdown);
  observer.observe(nativeSelect, { childList: true, attributes: true, subtree: true });

  function openDropdown() {
    dropdown.classList.add('open');
    arrow.classList.add('open');
  }

  function closeDropdown() {
    dropdown.classList.remove('open');
    arrow.classList.remove('open');
  }

  // Toggle al hacer clic en la pastilla
  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) closeDropdown();
    else openDropdown();
  });

  // Cerrar al hacer clic fuera
  document.addEventListener('click', (e) => {
    const badge = document.getElementById('active-sport-badge');
    if (badge && !badge.contains(e.target)) {
      closeDropdown();
    }
  });

  // Sincronizar por primera vez (con un pequeño delay por si la DB tarda inyectando)
  setTimeout(syncCustomDropdown, 200);
}