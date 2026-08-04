import { initRouter } from './utils/router.js';
import { initNavbar } from './components/navbar.js';

document.addEventListener('DOMContentLoaded', () => {
  initNavbar();
  initRouter();
});