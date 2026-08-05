/**
 * Utilidades para manejo de cámara y escaneo de códigos QR
 */

let mediaStream = null;

/**
 * Inicia la cámara y la escucha de cuadros para detectar un QR
 * @param {HTMLVideoElement} videoElement - Elemento <video> donde se mostrará la cámara
 * @param {Function} onScanSuccess - Callback cuando se lee un QR (recibe el texto decodificado)
 * @param {Function} onError - Callback opcional en caso de fallar el acceso a la cámara
 */
export async function startQRScanner(videoElement, onScanSuccess, onError) {
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' } // Prioriza la cámara trasera en móviles
    });
    
    videoElement.srcObject = mediaStream;
    await videoElement.play();

    const scanFrame = async () => {
      if (!mediaStream) return; // Si fue detenido, detiene la animación

      if ('BarcodeDetector' in window) {
        try {
          const detector = new BarcodeDetector({ formats: ['qr_code'] });
          const barcodes = await detector.detect(videoElement);
          
          if (barcodes.length > 0) {
            const rawValue = barcodes[0].rawValue;
            stopQRScanner();
            onScanSuccess(rawValue);
            return;
          }
        } catch (e) {
          // Frame sin detección de código, continúa el ciclo
        }
      }

      requestAnimationFrame(scanFrame);
    };

    requestAnimationFrame(scanFrame);
  } catch (err) {
    console.error('Error al acceder a la cámara:', err);
    if (onError) onError(err);
  }
}

/**
 * Detiene las pistas de video de la cámara y libera el hardware
 */
export function stopQRScanner() {
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
    app: 'CaimanaDa',
    version: '1.0',
    type,
    timestamp: Date.now(),
    payload
  });
}