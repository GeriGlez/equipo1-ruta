document.addEventListener('DOMContentLoaded', () => {
  const cardServicios = document.getElementById('card-servicios');
  const cardContratos = document.getElementById('card-contratos');
  const btnVolver = document.getElementById('btn-volver-login');

  // Redirigir directamente a servicios.html
  cardServicios.addEventListener('click', () => {
    window.location.href = './servicios.html';
  });

  // Evento opcional para contratos
  cardContratos.addEventListener('click', () => {
    alert('Módulo de Contratos en desarrollo.');
  });

  // Botón volver
  btnVolver.addEventListener('click', () => {
    if (window.history.length > 1) {
      window.history.back();
    } else {
      window.location.href = '/';
    }
  });
});