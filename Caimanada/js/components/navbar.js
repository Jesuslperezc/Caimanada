import { getCurrentUser, updateUserProfile, fullLogout } from '../utils/session.js';
import { AlertService } from './alert.js';

export function initNavbar() {
  const mobileLinks = document.querySelectorAll('.nav-mobile__link');
  const desktopLinks = document.querySelectorAll('.nav-desktop__link');
  const actionBtn = document.getElementById('nav-mobile-create');

  function syncActiveState() {
    const rawHash = window.location.hash.trim();
    const currentHash = (rawHash && rawHash !== '#') ? rawHash : '#dashboard';
    const baseHash = currentHash.split('/')[0];

    mobileLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === baseHash) link.classList.add('nav-mobile__link--active');
      else link.classList.remove('nav-mobile__link--active');
    });

    desktopLinks.forEach((link) => {
      const href = link.getAttribute('href');
      if (href === baseHash) link.classList.add('nav-desktop__link--active');
      else link.classList.remove('nav-desktop__link--active');
    });
  }

  if (actionBtn) {
    actionBtn.addEventListener('click', () => console.log('Acción rápida pulsada'));
  }
  
  // Delegación de eventos para el avatar
  document.addEventListener('click', (e) => {
    if (e.target && e.target.id === 'user-avatar-nav') {
      openProfileModal();
    }
  });

  window.addEventListener('hashchange', syncActiveState);
  syncActiveState();
}

export function renderUserAvatar() {
  const user = getCurrentUser();
  const headerContainer = document.querySelector('.app-header__container');

  if (user && headerContainer) {
    if (!document.getElementById('user-avatar-nav')) {
      const userAvatar = document.createElement('img');
      userAvatar.id = 'user-avatar-nav';
      userAvatar.className = 'app-header__user-avatar';
      userAvatar.title = `Sesión: ${user.name} (Click para editar)`;
      userAvatar.style.cursor = 'pointer';
      
      if (user.img) {
        userAvatar.src = user.img;
        userAvatar.alt = user.name;
      } else {
        const initial = user.name.charAt(0).toUpperCase();
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23334155'/><text x='50%' y='55%' font-family='system-ui' font-size='18' font-weight='bold' fill='%2300A86B' text-anchor='middle' dominant-baseline='middle'>${initial}</text></svg>`;
        userAvatar.src = `data:image/svg+xml;utf8,${svg}`;
      }
      
      headerContainer.appendChild(userAvatar);
    }
  }
}

function openProfileModal() {
  document.getElementById('dynamic-profile-modal')?.remove();
  const user = getCurrentUser();

  const modalHTML = `
    <div id="dynamic-profile-modal" class="modal-overlay">
      <div class="modal-card" style="max-width: 400px;">
        <h2 class="modal-card__title" style="text-align: center;">Mi Perfil</h2>
        
        <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 1.5rem;">
          <label for="profile-img-input" class="auth-avatar-wrapper" id="profile-avatar-label" style="width: 90px; height: 90px; margin-bottom: 0.5rem;">
            ${user.img ? `<img src="${user.img}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : `<span class="auth-avatar__placeholder">Cambiar</span>`}
            <div class="auth-avatar__edit">✎</div>
          </label>
          <input type="file" id="profile-img-input" accept="image/*" style="display: none;">
        </div>

        <form id="profile-form">
          <div class="form-group" style="margin-bottom: 1rem;">
            <label class="form-group__label">Nombre / Apodo</label>
            <input type="text" id="profile-name" class="form-control" value="${user.name}" required style="width: 100%; padding: 0.5rem;">
          </div>

          <div class="modal-actions" style="display: flex; flex-direction: column; gap: 0.75rem; margin-top: 1.5rem;">
            <button type="submit" class="btn btn--primary" style="width: 100%;">Guardar Cambios</button>
            <button type="button" id="btn-logout" class="btn btn-danger" style="width: 100%;">Cerrar Sesión y Borrar Datos</button>
            <button type="button" id="dyn-profile-cancel" class="btn btn--secondary" style="width: 100%;">Cancelar</button>
          </div>
        </form>
      </div>
    </div>
  `;

  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('dynamic-profile-modal');

  const imgInput = document.getElementById('profile-img-input');
  const avatarLabel = document.getElementById('profile-avatar-label');
  let newImageBase64 = user.img;

  imgInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        newImageBase64 = ev.target.result;
        avatarLabel.innerHTML = `
          <img src="${newImageBase64}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
          <div class="auth-avatar__edit">✎</div>
        `;
      };
      reader.readAsDataURL(file);
    }
  };

  document.getElementById('profile-form').onsubmit = (e) => {
    e.preventDefault();
    const newName = document.getElementById('profile-name').value.trim();
    if (newName) {
      updateUserProfile(newName, newImageBase64);
      AlertService.showSuccess('Perfil actualizado correctamente.', 'CAMBIOS GUARDADOS');
      modalEl.remove();
      
      const navAvatar = document.getElementById('user-avatar-nav');
      if (navAvatar) {
        if (newImageBase64) {
          navAvatar.src = newImageBase64;
        } else {
          const initial = newName.charAt(0).toUpperCase();
          const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23334155'/><text x='50%' y='55%' font-family='system-ui' font-size='18' font-weight='bold' fill='%2300A86B' text-anchor='middle' dominant-baseline='middle'>${initial}</text></svg>`;
          navAvatar.src = `data:image/svg+xml;utf8,${svg}`;
        }
        navAvatar.title = `Sesión: ${newName} (Click para editar)`;
      }
    }
  };

  document.getElementById('btn-logout').onclick = async () => {
    if (confirm("⚠️ ADVERTENCIA ⚠️\n\n¿Estás absolutamente seguro?\n\nAl cerrar sesión, se BORRARÁN PERMANENTEMENTE:\n- Tu usuario y preferencias\n- Todas las ligas, equipos y partidos guardados localmente en este dispositivo.\n\nEsta acción no se puede deshacer.")) {
      AlertService.showWarning('Cerrando sesión y borrando base de datos local...', 'ADIOS');
      await fullLogout();
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  document.getElementById('dyn-profile-cancel').onclick = () => modalEl.remove();
}