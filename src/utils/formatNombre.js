/**
 * Formatea un nombre completo a formato estándar:
 * - Todo en mayúsculas
 * - Coma después de los apellidos (primeras 2 palabras)
 *
 * Ejemplos:
 * "koo li jaime roberto" -> "KOO LI, JAIME ROBERTO"
 * "GARAR MEJIA MARIA ISABEL" -> "GARAR MEJIA, MARIA ISABEL"
 * "SANCHEZ ESPINOZA CONSUELO" -> "SANCHEZ ESPINOZA, CONSUELO"
 *
 * @param {string} nombreCompleto - Nombre completo a formatear
 * @returns {string} Nombre formateado
 */
function formatearNombre(nombreCompleto) {
  if (!nombreCompleto || typeof nombreCompleto !== 'string') {
    return nombreCompleto;
  }

  // Convertir a mayúsculas y limpiar espacios extras
  let nombreLimpio = nombreCompleto
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ') // Reemplazar múltiples espacios por uno solo
    .replace(/,+/g, ','); // Reemplazar múltiples comas por una sola

  // Si el nombre ya tiene coma, limpiar espacios alrededor de la coma y retornar
  if (nombreLimpio.includes(',')) {
    // Limpiar espacios alrededor de las comas
    return nombreLimpio
      .split(',')
      .map(parte => parte.trim())
      .filter(parte => parte.length > 0)
      .join(', ');
  }

  // Dividir en palabras
  const palabras = nombreLimpio.split(' ');

  // Si tiene 2 o menos palabras, no agregar coma
  if (palabras.length <= 2) {
    return nombreLimpio;
  }

  // Los primeros 2 elementos son apellidos, el resto son nombres
  const apellidos = palabras.slice(0, 2).join(' ');
  const nombres = palabras.slice(2).join(' ');

  return `${apellidos}, ${nombres}`;
}

module.exports = formatearNombre;
