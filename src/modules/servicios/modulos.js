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