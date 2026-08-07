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
  initSession(() => {
    renderUserAvatar();
    startTutorialIfNeeded();
    initRouter(); 
  });
});