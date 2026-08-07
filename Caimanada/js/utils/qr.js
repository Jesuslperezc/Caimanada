// js/utils/qr.js

let mediaStream = null;
let scanning = false;
let canvasElement = null;
let canvasContext = null;

/**
 * Inicia la cámara y escanea en busca de un código QR usando jsQR
 * @param {HTMLVideoElement} videoElement - Elemento <video> donde se mostrará la cámara
 * @param {Function} onScanSuccess - Callback cuando se lee un QR (recibe el texto decodificado)
 * @param {Function} onError - Callback opcional en caso de fallar el acceso a la cámara
 */
export async function startQRScanner(videoElement, onScanSuccess, onError) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' } // Prioriza la cámara trasera
    });
    
    videoElement.srcObject = mediaStream;
    videoElement.setAttribute('playsinline', true); // Crucial para iOS Safari
    await videoElement.play();

    // Preparamos un canvas oculto para leer los píxeles del video
    canvasElement = document.createElement('canvas');
    canvasContext = canvasElement.getContext('2d', { willReadFrequently: true });
    
    scanning = true;
    scanFrame(videoElement, onScanSuccess);

  } catch (err) {
    console.error('Error al acceder a la cámara:', err);
    if (onError) onError(err);
  }
}

function scanFrame(videoElement, onScanSuccess) {
  if (!scanning || !mediaStream) return;

  // Esperar a que el video tenga dimensiones reales
  if (videoElement.readyState === videoElement.HAVE_ENOUGH_DATA) {
    canvasElement.width = videoElement.videoWidth;
    canvasElement.height = videoElement.videoHeight;
    
    // Dibujamos el frame actual del video en el canvas
    canvasContext.drawImage(videoElement, 0, 0, canvasElement.width, canvasElement.height);
    
    // Obtenemos los datos de los píxeles
    const imageData = canvasContext.getImageData(0, 0, canvasElement.width, canvasElement.height);
    
    // Usamos jsQR para buscar un QR en la imagen
    // Nota: jsQR es una variable global porque la cargamos vía CDN en el HTML
    const code = window.jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: 'dontInvert',
    });

    if (code) {
      // ¡Encontró un QR!
      stopQRScanner();
      onScanSuccess(code.data);
      return;
    }
  }

  // Si no encontró nada, sigue buscando en el siguiente frame
  requestAnimationFrame(() => scanFrame(videoElement, onScanSuccess));
}

/**
 * Detiene las pistas de video de la cámara y libera el hardware
 */
export function stopQRScanner() {
  scanning = false;
  if (mediaStream) {
    mediaStream.getTracks().forEach(track => track.stop());
    mediaStream = null;
  }
}

/**
 * Genera una estructura JSON formateada lista para codificar en un QR
 * @param {string} type - Tipo de acción ('LINK_LEAGUE', 'IMPORT_TEAM', etc.)
 * @param {Object} payload - Datos a transferir
 */
export function buildQRPayload(type, payload) {
  return JSON.stringify({
    app: 'Caimanada',
    version: '1.0',
    type,
    timestamp: Date.now(),
    payload
  });
}