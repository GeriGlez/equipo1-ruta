import { getActiveSession } from '../auth/authService.js';

document.addEventListener('DOMContentLoaded', async () => {
  const appContainer = document.getElementById('app'); // 1. Obtener referencia del contenedor

  try {
    const sesion = await getActiveSession();

    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    const nombreUser = document.querySelector('.visitas-user-info strong');
    if (nombreUser && sesion.usuario.nombre) {
      nombreUser.textContent = sesion.usuario.nombre;
    }

    // 2. Hacer visible la pantalla tras confirmar que es administrador
    if (appContainer) {
      appContainer.style.display = 'block';
    }

    const cardServicios = document.getElementById('card-servicios');
    const cardContratos = document.getElementById('card-contratos');

    if (cardServicios) {
      cardServicios.addEventListener('click', () => {
        window.location.href = './servicios.html';
      });
    }

    if (cardContratos) {
      cardContratos.addEventListener('click', () => {
        window.location.href = './contratos.html';
      });
    }
  } catch (error) {
    console.error('Error al verificar la sesión:', error);
    window.location.href = '/';
  }
});

  // 2. Eventos de las tarjetas
  const cardServicios = document.getElementById('card-servicios');
  const cardContratos = document.getElementById('card-contratos');

  if (cardServicios) {
    cardServicios.addEventListener('click', () => {
      window.location.href = './servicios.html';
    });
  }

  if (cardContratos) {
    cardContratos.addEventListener('click', () => {
      window.location.href = './contratos.html';
    });
  }

