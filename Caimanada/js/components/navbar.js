export function initNavbar() {
  const mobileLinks = document.querySelectorAll('.nav-mobile__link');
  const desktopLinks = document.querySelectorAll('.nav-desktop__link');
  const actionBtn = document.getElementById('nav-mobile-create');

  function syncActiveState() {
    const rawHash = window.location.hash.trim();
    const currentHash = (rawHash && rawHash !== '#') ? rawHash : '#dashboard';
        const baseHash = currentHash.split('/')[0];

    // Actualizar links moviles
    mobileLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === baseHash) {
        link.classList.add('nav-mobile__link--active');
      } else {
        link.classList.remove('nav-mobile__link--active');
      }
    });

    // Actualiza links de escritorio
    desktopLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === baseHash) {
        link.classList.add('nav-desktop__link--active');
      } else {
        link.classList.remove('nav-desktop__link--active');
      }
    });
  }

  if (actionBtn) {
    actionBtn.addEventListener('click', (event) => {
      console.log('Acción rápida pulsada');
    });
  }
  window.addEventListener('hashchange', syncActiveState);

  syncActiveState();
}
