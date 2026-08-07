// js/utils/session.js

export function getCurrentUser() {
  const name = localStorage.getItem('caimanada_user');
  const img = localStorage.getItem('caimanada_user_img');
  if (name) return { name, img };
  return null;
}

export function initSession(onLoginSuccess) {
  const user = getCurrentUser();

  if (!user) {
    showLoginScreen(onLoginSuccess);
  } else {
    if (onLoginSuccess) onLoginSuccess();
  }
}

function showLoginScreen(onLoginSuccess) {
  const overlay = document.createElement('div');
  overlay.className = 'auth-overlay';
  overlay.id = 'auth-overlay';
  overlay.innerHTML = `
    <div class="auth-card">
      <img src="assets/Caimanada.png" alt="Logo Caimanada" class="auth-card__logo" style="width: 100%; max-width: 250px; height: auto; margin-bottom: 1.5rem; object-fit: contain;">
      
      <h2 class="auth-card__title">Bienvenido</h2>
      <p class="auth-card__subtitle">El gestor de ligas definitivo. Identifícate para empezar a crear torneos y compartirlos.</p>
      
      <label for="auth-img-input" class="auth-avatar-wrapper" id="auth-avatar-label">
        <span class="auth-avatar__placeholder" id="auth-avatar-text">Sube tu foto</span>
        <div class="auth-avatar__edit">✎</div>
      </label>
      <input type="file" id="auth-img-input" accept="image/*" style="display: none;">

      <form id="auth-form" style="width: 100%;">
        <input type="text" id="auth-name" class="auth-card__input" placeholder="Tu nombre o apodo" required>
        <button type="submit" class="auth-card__btn">Comenzar a Caimanear</button>
      </form>
    </div>
  `;
  document.body.appendChild(overlay);

  const imgInput = document.getElementById('auth-img-input');
  const avatarLabel = document.getElementById('auth-avatar-label');
  let imageBase64 = null;

  imgInput.onchange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        imageBase64 = ev.target.result;
        avatarLabel.innerHTML = `
          <img src="${imageBase64}" alt="Foto de perfil" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
          <div class="auth-avatar__edit">✎</div>
        `;
      };
      reader.readAsDataURL(file);
    }
  };

  document.getElementById('auth-form').onsubmit = (e) => {
    e.preventDefault();
    const name = document.getElementById('auth-name').value.trim();
    if (name) {
      localStorage.setItem('caimanada_user', name);
      if (imageBase64) {
        localStorage.setItem('caimanada_user_img', imageBase64);
      } else {
        localStorage.setItem('caimanada_user_img', '');
      }
      overlay.remove();
      if (onLoginSuccess) onLoginSuccess();
    }
  };
}

export function updateUserProfile(name, img) {
  if (name) localStorage.setItem('caimanada_user', name);
  if (img !== undefined) localStorage.setItem('caimanada_user_img', img);
}

/**
 * Muestra un modal de confirmación estilizado antes de borrar todo.
 */
function showLogoutConfirmModal() {
  return new Promise((resolve) => {
    document.getElementById('dynamic-logout-modal')?.remove();
    const modalHTML = `
      <div id="dynamic-logout-modal" class="modal-overlay">
        <div class="modal-card" style="max-width: 420px; text-align: center;">
          <h2 class="modal-card__title">Cerrar Sesión</h2>
          <p style="color: #94a3b8; margin-bottom: 1.5rem; line-height: 1.6; font-size: 0.95rem;">
            ¿Estás seguro de que deseas cerrar sesión? <br><br>
            <strong style="color: #ef4444;">Se borrarán todos los datos locales</strong> (ligas, equipos, partidos) de este dispositivo. Esta acción no se puede deshacer.
          </p>
          <div class="modal-actions" style="display: flex; gap: 0.5rem; justify-content: center;">
            <button type="button" id="logout-cancel-btn" class="btn btn--secondary">Cancelar</button>
            <button type="button" id="logout-confirm-btn" class="btn btn--danger">Sí, borrar todo</button>
          </div>
        </div>
      </div>`;
    
    document.body.insertAdjacentHTML('beforeend', modalHTML);
    const modalEl = document.getElementById('dynamic-logout-modal');
    
    document.getElementById('logout-cancel-btn').onclick = () => {
      modalEl.remove();
      resolve(false);
    };
    
    // Si se hace clic fuera del modal, cerrar y cancelar
    modalEl.onclick = (e) => { 
      if (e.target === modalEl) {
        modalEl.remove();
        resolve(false);
      }
    };
    
    document.getElementById('logout-confirm-btn').onclick = () => {
      modalEl.remove();
      resolve(true);
    };
  });
}

export async function fullLogout() {
  // 1. Mostrar modal de confirmación y esperar respuesta
  const confirmed = await showLogoutConfirmModal();
  if (!confirmed) return false; // Si cancela, no hacemos nada

  // 2. Limpiar LocalStorage
  localStorage.clear();

  // 3. Borrar IndexedDB y recargar la página
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('caimanada_db');
    
    req.onsuccess = () => {
      window.location.reload(); // Recarga la app para mostrar el login
      resolve(true);
    };
    
    req.onerror = () => {
      console.error('Error al borrar la base de datos.');
      window.location.reload();
      resolve(true);
    };
    
    req.onblocked = () => {
      // A veces pasa si hay transacciones abiertas. Forzamos recarga.
      console.warn('Borrado de DB bloqueado, recargando página...');
      window.location.reload();
      resolve(true);
    };
  });
}