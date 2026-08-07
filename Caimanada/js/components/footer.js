export function initGlobalFooter() {

  if (document.getElementById('app-watermark-footer')) return;

  const footer = document.createElement('footer');
  footer.id = 'app-watermark-footer';
  
  const currentYear = new Date().getFullYear();
  
  footer.innerHTML = `
    <span>© ${currentYear} Caimanada· Desarrollado por <strong>Rosavirginia Luján</strong> & <strong>Jesús Pérez</strong></span>
  `;
  
  document.body.appendChild(footer);
}