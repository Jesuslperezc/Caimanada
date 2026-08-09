import { AlertService } from './alert.js';

export function openImageCropper(imageSrc, callback) {
  // Buscamos la librería globalmente
  const CroppieLib = window.Croppie || (typeof Croppie !== 'undefined' ? Croppie : null);
  
  if (!CroppieLib) {
    AlertService.showError('La librería de recorte no se cargó. Revisa tu conexión.');
    console.error('Croppie no está definido globalmente.');
    return;
  }

  document.getElementById('cropper-modal')?.remove();
  
  const modalHTML = `
    <div id="cropper-modal" class="modal-overlay" style="z-index: 10001;">
      <div class="modal-card" style="max-width: 400px; text-align: center;">
        <h2 class="modal-card__title">Ajustar Foto</h2>
        <div id="croppie-container" style="width: 250px; height: 250px; margin: 0 auto 1.5rem auto; background: #000; border-radius: 12px; overflow: hidden;"></div>
        <div class="modal-actions">
          <button id="cropper-cancel" class="btn btn--secondary">Cancelar</button>
          <button id="cropper-confirm" class="btn btn--primary">Confirmar</button>
        </div>
      </div>
    </div>
  `;
  
  document.body.insertAdjacentHTML('beforeend', modalHTML);
  const modalEl = document.getElementById('cropper-modal');
  const container = document.getElementById('croppie-container');
  
  let croppie;
  try {
    croppie = new CroppieLib(container, {
      viewport: { width: 200, height: 200, type: 'circle' },
      boundary: { width: 250, height: 250 },
      showZoomer: true
    });
    
    croppie.bind({ url: imageSrc }).catch(err => {
      console.error('Error al vincular imagen en Croppie:', err);
      AlertService.showError('No se pudo cargar la imagen en el recortador.');
      modalEl.remove();
    });
  } catch (err) {
    console.error('Error al iniciar Croppie:', err);
    AlertService.showError('Error al abrir el editor de imagen.');
    modalEl.remove();
    return;
  }
  
  document.getElementById('cropper-cancel').onclick = () => {
    if (croppie) croppie.destroy();
    modalEl.remove();
  };
  
  modalEl.onclick = (e) => { 
    if (e.target === modalEl) {
      if (croppie) croppie.destroy();
      modalEl.remove();
    }
  };
  
  document.getElementById('cropper-confirm').onclick = async () => {
    try {
      const dataUrl = await croppie.result({
        type: 'base64',
        size: 'viewport',
        format: 'jpeg',
        quality: 0.85
      });
      
      callback(dataUrl);
      croppie.destroy();
      modalEl.remove();
    } catch (err) {
      console.error('Error al generar el recorte:', err);
      AlertService.showError('Hubo un problema al guardar el recorte.');
    }
  };
}