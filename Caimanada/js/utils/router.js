// Detecta el hash y ejecuta la vista
export function handleRoute() {
  const rawHash = window.location.hash.trim();
  const currentHash = (rawHash && rawHash !== '#') ? rawHash : '#dashboard';
  
  const baseHash = currentHash.split('/')[0];
  const cleanName = baseHash.replace('#', '');
  const targetSectionId = `${cleanName}-section`;

  const sections = document.querySelectorAll('.view-section');
  let found = false;

  sections.forEach((section) => {
    if (section.id === targetSectionId) {
      section.classList.remove('is-hidden');
      found = true;
    } else {
      section.classList.add('is-hidden');
    }
  });

  if (!found) {
    const defaultSection = document.getElementById('dashboard-section');
    if (defaultSection) {
      defaultSection.classList.remove('is-hidden');
    }
  }
}

// Inicializa el enrutador
export function initRouter() {
  window.addEventListener('hashchange', handleRoute);
  handleRoute();
}