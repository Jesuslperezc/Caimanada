import { AlertService } from '../components/alert.js'; // Asegúrate de que la ruta sea correcta

export async function renderHelpView() {
  const container = document.getElementById('help-content-target');
  if (!container) return;

  container.innerHTML = `
    <article class="info-card">
      <div class="help-content">
        <h3 class="help-section-title">1. Configuración Inicial</h3>
        <p>Selecciona tu deporte en la barra superior. Ve a la pestaña <strong>Ligas</strong> y presiona "Crear Nueva Liga". Completa los datos y actívala.</p>
        
        <h3 class="help-section-title">2. Equipos y Plantillas</h3>
        <p>Ve a la pestaña <strong>Equipos</strong>. Registra el club y agrégale sus jugadores. Luego, puedes generar un Código QR de tu equipo en el botón "Compartir QR" para enviárselo al organizador de la liga.</p>
        
        <h3 class="help-section-title">3. Generar Fixture</h3>
        <p>En la pestaña <strong>Ligas</strong>, presiona "Partidos" en tu liga para generar el calendario. Ajusta las fechas y horas según la duración del torneo.</p>
        
        <h3 class="help-section-title">4. Sincronización P2P (Sin Internet)</h3>
        <p>CaimanaDa no usa internet para guardar datos, sino códigos QR:</p>
        <ul class="help-list">
          <li><strong>Organizador (Host):</strong> Presiona "📤 Exportar" en su liga para generar el QR inicial.</li>
          <li><strong>Invitado (Guest):</strong> Presiona "📥 Importar Liga" y escanea el QR del organizador.</li>
          <li><strong>Actualizar Resultados:</strong> Tras jugar partidos, el Host presiona "📤 Sync" y el Guest escanea ese QR en "🔄 Actualizar".</li>
        </ul>
        
        <h3 class="help-section-title">5. Jugar Partidos en Vivo</h3>
        <p>En la pestaña <strong>Partidos</strong>, presiona "VS" en el encuentro pendiente. Usa el cronómetro, registra goles/puntos, tarjetas y cambios. Al finalizar, se actualizará la tabla de posiciones automáticamente.</p>
      </div>

      <footer class="info-card__footer" style="margin-top: 2rem; text-align: center; border-top: 1px solid var(--border-subtle); padding-top: 1.5rem;">
        <p style="color: var(--text-muted); font-size: 0.85rem; margin-bottom: 1rem;">¿Necesitas ayuda con algún error o tienes alguna sugerencia?</p>
        
        <div style="display: flex; flex-direction: column; gap: 0.75rem; align-items: center;">
          <button type="button" id="contact-support-btn" class="btn btn--primary" style="max-width: 300px; width: 100%;">
            📧 Enviar Correo
          </button>
          <button type="button" id="copy-email-btn" class="btn btn--secondary" style="max-width: 300px; width: 100%;">
            📋 Copiar Correo
          </button>
          <p style="color: var(--text-secondary); font-size: 0.9rem; font-weight: bold; margin-top: 0.5rem;">caimanada.app@gmail.com</p>
        </div>
      </footer>
    </article>
  `;

  // Intentar abrir la app de correo nativa
  const contactBtn = document.getElementById('contact-support-btn');
  if (contactBtn) {
    contactBtn.addEventListener('click', () => {
      window.location.href = 'mailto:caimanada.app@gmail.com?subject=Soporte%20Técnico%20CaimanaDa';
    });
  }

  // Fallback: Copiar al portapapeles
  const copyBtn = document.getElementById('copy-email-btn');
  if (copyBtn) {
    copyBtn.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText('caimanada.app@gmail.com');
        AlertService.showSuccess('Correo copiado al portapapeles. Pégalo en tu app de correo favorita.');
      } catch (err) {
        AlertService.showError('No se pudo copiar automáticamente. Anótalo: caimanada.app@gmail.com');
      }
    });
  }
}