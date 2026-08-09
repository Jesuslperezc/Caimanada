import { initRouter } from './utils/router.js';
import { initNavbar, renderUserAvatar } from './components/navbar.js';
import { initSportSwitcher } from './components/sportSwitcher.js';
import { initSession } from './utils/session.js';
import { initGlobalFooter } from './components/footer.js';


document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSportSwitcher();
  initGlobalFooter();
  

  
  // === INICIALIZACIÓN DEL DROPDOWN CUSTOM HÍBRIDO ===
  initCustomSportDropdown();

  initSession(() => {
    renderUserAvatar();
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

  if (!trigger || !nativeSelect) return;

  function syncCustomDropdown() {
    dropdown.innerHTML = '';
    
    Array.from(nativeSelect.options).forEach(option => {
      const item = document.createElement('div');
      item.className = 'sport-dropdown-item' + (option.selected ? ' active' : '');
      item.textContent = option.text;
      item.dataset.value = option.value;
      
      item.addEventListener('click', (e) => {
        e.stopPropagation();
        nativeSelect.value = option.value;
        selectedText.textContent = option.text;
        nativeSelect.dispatchEvent(new Event('change', { bubbles: true }));
        dropdown.querySelectorAll('.sport-dropdown-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        closeDropdown();
      });
      
      dropdown.appendChild(item);
    });

    const selectedOption = nativeSelect.options[nativeSelect.selectedIndex];
    if (selectedOption) {
      selectedText.textContent = selectedOption.text;
    }
  }

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

  trigger.addEventListener('click', (e) => {
    e.stopPropagation();
    if (dropdown.classList.contains('open')) closeDropdown();
    else openDropdown();
  });

  document.addEventListener('click', (e) => {
    const badge = document.getElementById('active-sport-badge');
    if (badge && !badge.contains(e.target)) {
      closeDropdown();
    }
  });

  setTimeout(syncCustomDropdown, 200);
}