import { getCurrentUser, updateUserProfile, fullLogout } from '../utils/session.js';
import { AlertService } from './alert.js';
import { openImageCropper } from './imageCropper.js';

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
      
      if (user.img) {
        userAvatar.src = user.img;
        userAvatar.alt = user.name;
      } else {
        const initial = user.name.charAt(0).toUpperCase();
        const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23102420'/><text x='50%' y='55%' font-family='system-ui' font-size='18' font-weight='bold' fill='%2300ff9d' text-anchor='middle' dominant-baseline='middle'>${initial}</text></svg>`;
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
      <div class="modal-card modal-card--form">
        <h2 class="modal-card__title">Mi Perfil</h2>
        
        <div style="display: flex; flex-direction: column; align-items: center; margin-bottom: 1.5rem;">
          <label for="profile-img-input" class="auth-avatar-wrapper" id="profile-avatar-label" style="width: 100px; height: 100px; margin-bottom: 0; cursor: pointer;">
            ${user.img ? `<img src="${user.img}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">` : `<span class="auth-avatar__placeholder">Cambiar</span>`}
            <!-- EL LÁPIZ HA SIDO ELIMINADO -->
          </label>
          <input type="file" id="profile-img-input" accept="image/*" class="is-hidden">
        </div>

        <form id="profile-form">
          <div class="form-group">
            <label class="form-group__label">Nombre / Apodo</label>
            <input type="text" id="profile-name" class="form-control" value="${user.name}" required>
          </div>

          <div class="modal-actions">
            <button type="button" id="dyn-profile-cancel" class="btn btn--secondary">Cancelar</button>
            <button type="submit" class="btn btn--primary">Guardar</button>
          </div>
          
          <div style="margin-top: 1.5rem;">
            <button type="button" id="btn-logout" class="btn btn--danger" style="width: 100%;">Cerrar Sesión y Borrar Datos</button>
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
    e.target.value = ''; 
    
    if (file) {
      console.log('Foto seleccionada:', file.name);
      const reader = new FileReader();
      reader.onload = (ev) => {
        console.log('Imagen leída, abriendo recortador...');
        openImageCropper(ev.target.result, (croppedImage) => {
          newImageBase64 = croppedImage;
          avatarLabel.innerHTML = `
            <img src="${newImageBase64}" alt="Avatar" style="width:100%; height:100%; object-fit:cover; border-radius:50%;">
          `;
        });
      };
      reader.onerror = (err) => {
        console.error('Error al leer el archivo:', err);
        AlertService.showError('No se pudo leer el archivo de imagen.');
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
          const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40' viewBox='0 0 40 40'><rect width='40' height='40' fill='%23102420'/><text x='50%' y='55%' font-family='system-ui' font-size='18' font-weight='bold' fill='%2300ff9d' text-anchor='middle' dominant-baseline='middle'>${initial}</text></svg>`;
          navAvatar.src = `data:image/svg+xml;utf8,${svg}`;
        }
        navAvatar.title = `Sesión: ${newName} (Click para editar)`;
      }
    }
  };

  document.getElementById('btn-logout').onclick = async () => {
    const wasLoggedOut = await fullLogout();
    if (wasLoggedOut) {
      AlertService.showWarning('Cerrando sesión y borrando base de datos local...', 'ADIOS');
      setTimeout(() => window.location.reload(), 1000);
    }
  };

  document.getElementById('dyn-profile-cancel').onclick = () => modalEl.remove();
}