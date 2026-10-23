import { getActiveSession } from '../auth/authService.js';

document.addEventListener('DOMContentLoaded', async () => {
  // 1. Validar sesión y rol de administrador
  try {
    const sesion = await getActiveSession();

    if (!sesion?.usuario || sesion.usuario.rol !== 'administrador') {
      window.location.href = '/';
      return;
    }

    // Actualizar nombre del usuario en el header
    const nombreUser = document.querySelector('.visitas-user-info strong');
    if (nombreUser && sesion.usuario.nombre) {
      nombreUser.textContent = sesion.usuario.nombre;
    }
  } catch (error) {
    console.error('Error al verificar la sesión:', error);
    window.location.href = '/';
    return;
  }

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
});

document.addEventListener('DOMContentLoaded', () => {
  const cardServicios = document.getElementById('card-servicios');
  const cardContratos = document.getElementById('card-contratos');

  // Redirigir directamente a servicios.html
  cardServicios.addEventListener('click', () => {
    window.location.href = './servicios.html';
  });


cardContratos.addEventListener('click', () => {
  window.location.href = './contratos.html';
});
});