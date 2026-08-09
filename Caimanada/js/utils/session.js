// js/utils/session.js
import { openImageCropper } from '../components/imageCropper.js';

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
        <!-- EL LÁPIZ HA SIDO ELIMINADO -->
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
        // ABRIMOS EL RECORTADOR CON LA IMAGEN
        openImageCropper(ev.target.result, (croppedImage) => {
          imageBase64 = croppedImage;
          avatarLabel.innerHTML = `
            <img src="${imageBase64}" alt="Foto de perfil" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">
          `;
        });
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

export async function fullLogout() {
  localStorage.clear();
  return new Promise((resolve) => {
    const req = indexedDB.deleteDatabase('caimanada_db');
    req.onsuccess = () => { window.location.reload(); resolve(true); };
    req.onerror = () => { window.location.reload(); resolve(true); };
    req.onblocked = () => { window.location.reload(); resolve(true); };
  });
}