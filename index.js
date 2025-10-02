const FiltroService = require('./src/services/filtroService');

/**
 * Script principal para ejecutar el sistema desde línea de comandos
 */
async function main() {
  const filtroService = new FiltroService();

  // Obtener RUC desde argumentos de línea de comandos
  const ruc = process.argv[2];

  if (!ruc) {
    console.log('\n📋 USO: node index.js <RUC>');
    console.log('Ejemplo: node index.js 20123456789\n');
    process.exit(1);
  }

  // Validar formato de RUC
  if (!/^\d{11}$/.test(ruc)) {
    console.error('❌ Error: El RUC debe tener 11 dígitos');
    process.exit(1);
  }

  try {
    // Procesar el RUC
    const resultado = await filtroService.procesarRUC(ruc);

    // Mostrar resultado final
    console.log('\n📊 RESULTADO FINAL:');
    console.log('==================\n');
    console.log(`RUC: ${resultado.ruc}`);
    console.log(`Razón Social: ${resultado.razonSocial || 'No disponible'}`);
    console.log(`Estado: ${resultado.aprobado ? '✅ APROBADO PARA PAGO' : '❌ RECHAZADO'}`);

    if (!resultado.aprobado) {
      console.log(`\n⚠️  Motivo de rechazo: ${resultado.motivoRechazo}`);
      if (resultado.dnisConFamiliares.length > 0) {
        console.log(`\n👥 DNIs con familiares detectados:`);
        resultado.dnisConFamiliares.forEach(dni => {
          console.log(`   - ${dni}`);
        });
      }
    } else {
      console.log(`\n✅ Todos los DNIs validados correctamente`);
      console.log(`Total DNIs verificados: ${resultado.dnisTotales.length}`);
    }

    console.log('\n');

  } catch (error) {
    console.error('\n❌ Error fatal:', error.message);
    process.exit(1);
  }
}

// Ejecutar solo si es el módulo principal
if (require.main === module) {
  main();
}

module.exports = { FiltroService };
