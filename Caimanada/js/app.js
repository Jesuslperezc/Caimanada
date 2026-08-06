import { initRouter } from './utils/router.js';
import { initNavbar } from './components/navbar.js';
import { initSportSwitcher } from './components/sportSwitcher.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initSportSwitcher(); 
  initRouter(); 
});