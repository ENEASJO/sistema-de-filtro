// Configuración de la API - Detecta automáticamente local vs producción
const API_BASE_URL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
    ? 'http://localhost:3000/api'  // Desarrollo local
    : 'https://sistema-de-filtro-production.up.railway.app/api';  // Producción

console.log('🔧 API_BASE_URL configurada:', API_BASE_URL);

// Estado de la aplicación
const state = {
    loading: false,
    currentTab: 'individual'
};

// Inicialización
document.addEventListener('DOMContentLoaded', () => {
    initTabs();
    initForms();
});

// ===== TAB NAVIGATION =====
function initTabs() {
    const tabButtons = document.querySelectorAll('.tab-btn');
    const tabContents = document.querySelectorAll('.tab-content');

    tabButtons.forEach(button => {
        button.addEventListener('click', () => {
            const tabName = button.dataset.tab;

            // Actualizar botones
            tabButtons.forEach(btn => btn.classList.remove('active'));
            button.classList.add('active');

            // Actualizar contenido
            tabContents.forEach(content => content.classList.remove('active'));
            document.getElementById(`${tabName}-tab`).classList.add('active');

            state.currentTab = tabName;
        });
    });
}

// ===== FORMULARIOS =====
function initForms() {
    // Formulario individual
    const formIndividual = document.getElementById('form-individual');
    formIndividual.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ruc = document.getElementById('ruc-input').value.trim();
        await buscarRUCIndividual(ruc);
    });

    // Formulario batch
    const formBatch = document.getElementById('form-batch');
    formBatch.addEventListener('submit', async (e) => {
        e.preventDefault();
        const rucText = document.getElementById('rucs-input').value.trim();
        const rucs = rucText.split('\n').map(r => r.trim()).filter(r => r.length > 0);
        await buscarRUCsBatch(rucs);
    });

    // Formulario comparar DNIs
    const formComparar = document.getElementById('form-comparar');
    formComparar.addEventListener('submit', async (e) => {
        e.preventDefault();
        const dnisText = document.getElementById('dnis-input').value.trim();
        const dnis = dnisText.split('\n').map(d => d.trim()).filter(d => d.length > 0);
        await compararDNIs(dnis);
    });

    // Validación en tiempo real
    const rucInput = document.getElementById('ruc-input');
    rucInput.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g, '');
    });
}

// ===== BÚSQUEDA INDIVIDUAL =====
async function buscarRUCIndividual(ruc) {
    if (!validarRUC(ruc)) {
        showAlert('error', 'El RUC debe tener 11 dígitos');
        return;
    }

    setLoading('individual', true);
    hideResultado('individual');

    try {
        const response = await fetch(`${API_BASE_URL}/filtrar-ruc`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ ruc })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al procesar la solicitud');
        }

        mostrarResultadoIndividual(data.data);
        showAlert('success', 'Búsqueda completada exitosamente');

    } catch (error) {
        console.error('Error:', error);
        showAlert('error', `Error: ${error.message}`);
    } finally {
        setLoading('individual', false);
    }
}

// ===== BÚSQUEDA BATCH =====
async function buscarRUCsBatch(rucs) {
    if (rucs.length === 0) {
        showAlert('error', 'Debe ingresar al menos un RUC');
        return;
    }

    // Validar todos los RUCs
    const invalidos = rucs.filter(ruc => !validarRUC(ruc));
    if (invalidos.length > 0) {
        showAlert('error', `RUCs inválidos encontrados: ${invalidos.join(', ')}`);
        return;
    }

    setLoading('batch', true);
    hideResultado('batch');

    try {
        const response = await fetch(`${API_BASE_URL}/filtrar-rucs-batch`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ rucs })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al procesar la solicitud');
        }

        mostrarResultadoBatch(data.reporte, data.resultados);
        showAlert('success', `${rucs.length} RUCs procesados exitosamente`);

    } catch (error) {
        console.error('Error:', error);
        showAlert('error', `Error: ${error.message}`);
    } finally {
        setLoading('batch', false);
    }
}

// ===== MOSTRAR RESULTADOS =====
function mostrarResultadoIndividual(resultado) {
    const container = document.getElementById('resultado-individual');

    const html = `
        <h2>Resultado de la Búsqueda</h2>

        <div class="status-badge ${resultado.aprobado ? 'status-aprobado' : 'status-rechazado'}">
            ${resultado.aprobado ? '✅ APROBADO PARA PAGO' : '❌ RECHAZADO'}
        </div>

        <div class="info-grid">
            <div class="info-item">
                <div class="info-label">RUC</div>
                <div class="info-value">${resultado.ruc}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Razón Social</div>
                <div class="info-value">${resultado.razonSocial || 'No disponible'}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Total DNIs</div>
                <div class="info-value">${resultado.dnisTotales.length}</div>
            </div>
            <div class="info-item">
                <div class="info-label">Fecha</div>
                <div class="info-value">${new Date(resultado.timestamp).toLocaleString('es-PE')}</div>
            </div>
        </div>

        ${!resultado.aprobado ? `
            <div class="dni-section">
                <h3 style="color: #dc2626;">⚠️ Motivo de Rechazo</h3>
                <p style="padding: 15px; background: #fee2e2; border-radius: 8px; color: #991b1b; font-weight: 600;">
                    ${resultado.motivoRechazo}
                </p>
            </div>
        ` : ''}

        ${resultado.dnisConFamiliares.length > 0 ? `
            <div class="dni-section">
                <h3>❌ DNIs con Familiares Detectados (${resultado.dnisConFamiliares.length})</h3>
                <div class="dni-list">
                    ${resultado.dnisConFamiliares.map(dni =>
                        `<span class="dni-badge dni-rechazado">${dni}</span>`
                    ).join('')}
                </div>
            </div>
        ` : ''}

        ${resultado.dnisAprobados.length > 0 ? `
            <div class="dni-section">
                <h3>✅ DNIs Aprobados (${resultado.dnisAprobados.length})</h3>
                <div class="dni-list">
                    ${resultado.dnisAprobados.map(dni =>
                        `<span class="dni-badge dni-aprobado">${dni}</span>`
                    ).join('')}
                </div>
            </div>
        ` : ''}

        ${resultado.personasDetalladas && resultado.personasDetalladas.length > 0 ? `
            <div class="dni-section">
                <h3>👥 Personas Encontradas (${resultado.personasDetalladas.length})</h3>
                <div class="table-container">
                    <table class="personas-table">
                        <thead>
                            <tr>
                                <th>DNI</th>
                                <th>Nombre Completo</th>
                                <th>Fuente</th>
                                <th>Es Familiar</th>
                                <th>Estado</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${resultado.personasDetalladas.map(persona => `
                                <tr>
                                    <td>
                                        <code class="dni-code">${persona.dni}</code>
                                    </td>
                                    <td class="nombre-cell">
                                        <strong>${persona.nombre || persona.nombrePersona || '-'}</strong>
                                    </td>
                                    <td>
                                        <div class="fuente-badges">
                                            ${[...new Set(persona.fuentes)].map(fuente => {
                                                const config = fuente === 'SUNAT'
                                                    ? { bg: '#3b82f6', icon: '🏛️' }
                                                    : { bg: '#10b981', icon: '📋' };
                                                return `<span class="fuente-badge" style="background: ${config.bg};">${config.icon} ${fuente}</span>`;
                                            }).join('')}
                                        </div>
                                    </td>
                                    <td class="center-cell">
                                        ${persona.esFamiliar
                                            ? '<span class="badge badge-danger">❌ SÍ</span>'
                                            : '<span class="badge badge-success">✅ NO</span>'
                                        }
                                    </td>
                                    <td class="center-cell">
                                        ${persona.encontrado !== undefined
                                            ? (persona.encontrado
                                                ? '<span class="badge badge-warning">⚠️ Encontrado en Sistema</span>'
                                                : '<span class="badge badge-success">✅ No encontrado</span>')
                                            : '<span class="badge badge-info">ℹ️ Pendiente</span>'
                                        }
                                    </td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        ` : ''}
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

function mostrarResultadoBatch(reporte, resultados) {
    const container = document.getElementById('resultado-batch');

    const html = `
        <h2>Resultados del Procesamiento Masivo</h2>

        <div class="summary-cards">
            <div class="summary-card total">
                <div class="summary-number">${reporte.totalProcesados}</div>
                <div class="summary-label">Total Procesados</div>
            </div>
            <div class="summary-card aprobado">
                <div class="summary-number">${reporte.aprobados}</div>
                <div class="summary-label">Aprobados</div>
            </div>
            <div class="summary-card rechazado">
                <div class="summary-number">${reporte.rechazados}</div>
                <div class="summary-label">Rechazados</div>
            </div>
        </div>

        <div class="table-container">
            <table>
                <thead>
                    <tr>
                        <th>RUC</th>
                        <th>Razón Social</th>
                        <th>Estado</th>
                        <th>DNIs Totales</th>
                        <th>Con Familiares</th>
                        <th>Motivo</th>
                    </tr>
                </thead>
                <tbody>
                    ${resultados.map(resultado => `
                        <tr>
                            <td><code>${resultado.ruc}</code></td>
                            <td>${resultado.razonSocial || '-'}</td>
                            <td>
                                <span class="status-badge ${resultado.aprobado ? 'status-aprobado' : 'status-rechazado'}"
                                      style="font-size: 0.85rem; padding: 6px 12px;">
                                    ${resultado.aprobado ? '✅ Aprobado' : '❌ Rechazado'}
                                </span>
                            </td>
                            <td>${resultado.dnisTotales ? resultado.dnisTotales.length : 0}</td>
                            <td>${resultado.dnisConFamiliares ? resultado.dnisConFamiliares.length : 0}</td>
                            <td>${resultado.motivoRechazo || '-'}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
        </div>

        ${reporte.detalleRechazos && reporte.detalleRechazos.length > 0 ? `
            <div class="dni-section">
                <h3>⚠️ Detalle de RUCs Rechazados</h3>
                ${reporte.detalleRechazos.map(detalle => `
                    <div style="padding: 15px; background: #fee2e2; border-radius: 8px; margin-bottom: 10px; border-left: 4px solid #ef4444;">
                        <strong>RUC ${detalle.ruc}</strong> - ${detalle.razonSocial}<br>
                        <small style="color: #991b1b;">${detalle.motivo}</small><br>
                        <small>DNIs rechazados: ${detalle.dnisConFamiliares.join(', ')}</small>
                    </div>
                `).join('')}
            </div>
        ` : ''}

        <div class="dni-section">
            <h3>👥 Detalle de Todas las Personas Encontradas</h3>
            ${resultados.map(resultado => `
                ${resultado.personasDetalladas && resultado.personasDetalladas.length > 0 ? `
                    <div style="margin-bottom: 30px;">
                        <h4 style="margin: 10px 0; padding: 10px; background: #f3f4f6; border-radius: 6px;">
                            RUC: ${resultado.ruc} - ${resultado.razonSocial || 'Sin razón social'}
                            <span class="status-badge ${resultado.aprobado ? 'status-aprobado' : 'status-rechazado'}" style="font-size: 0.8rem; padding: 4px 10px; margin-left: 10px;">
                                ${resultado.aprobado ? '✅ Aprobado' : '❌ Rechazado'}
                            </span>
                        </h4>
                        <div class="table-container">
                            <table class="personas-table">
                                <thead>
                                    <tr>
                                        <th>DNI</th>
                                        <th>Nombre Completo</th>
                                        <th>Fuente</th>
                                        <th>Es Familiar</th>
                                        <th>Estado</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    ${resultado.personasDetalladas.map(persona => `
                                        <tr>
                                            <td>
                                                <code class="dni-code">${persona.dni}</code>
                                            </td>
                                            <td class="nombre-cell">
                                                <strong>${persona.nombre || persona.nombrePersona || '-'}</strong>
                                            </td>
                                            <td>
                                                <div class="fuente-badges">
                                                    ${[...new Set(persona.fuentes)].map(fuente => {
                                                        const config = fuente === 'SUNAT'
                                                            ? { bg: '#3b82f6', icon: '🏛️' }
                                                            : { bg: '#10b981', icon: '📋' };
                                                        return `<span class="fuente-badge" style="background: ${config.bg};">${config.icon} ${fuente}</span>`;
                                                    }).join('')}
                                                </div>
                                            </td>
                                            <td class="center-cell">
                                                ${persona.esFamiliar
                                                    ? '<span class="badge badge-danger">❌ SÍ</span>'
                                                    : '<span class="badge badge-success">✅ NO</span>'
                                                }
                                            </td>
                                            <td class="center-cell">
                                                ${persona.encontrado !== undefined
                                                    ? (persona.encontrado
                                                        ? '<span class="badge badge-warning">⚠️ Encontrado en Sistema</span>'
                                                        : '<span class="badge badge-success">✅ No encontrado</span>')
                                                    : '<span class="badge badge-info">ℹ️ Pendiente</span>'
                                                }
                                            </td>
                                        </tr>
                                    `).join('')}
                                </tbody>
                            </table>
                        </div>
                    </div>
                ` : ''}
            `).join('')}
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

// ===== COMPARAR DNIS =====
async function compararDNIs(dnis) {
    if (dnis.length === 0) {
        showAlert('error', 'Debe ingresar al menos un DNI');
        return;
    }

    if (dnis.length < 2) {
        showAlert('error', 'Debe ingresar al menos 2 DNIs para comparar');
        return;
    }

    // Validar todos los DNIs
    const invalidos = dnis.filter(dni => !validarDNI(dni));
    if (invalidos.length > 0) {
        showAlert('error', `DNIs inválidos encontrados: ${invalidos.join(', ')}`);
        return;
    }

    setLoading('comparar', true);
    hideResultado('comparar');

    try {
        const response = await fetch(`${API_BASE_URL}/comparar-dnis`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ dnis })
        });

        const data = await response.json();

        if (!data.success) {
            throw new Error(data.error || 'Error al procesar la solicitud');
        }

        mostrarResultadoComparacion(data.reporte, data.detalles);
        showAlert('success', `${dnis.length} DNIs comparados exitosamente`);

    } catch (error) {
        console.error('Error:', error);
        showAlert('error', `Error: ${error.message}`);
    } finally {
        setLoading('comparar', false);
    }
}

function mostrarResultadoComparacion(reporte, detalles) {
    const container = document.getElementById('resultado-comparar');

    const html = `
        <h2>📊 Resultado de la Comparación</h2>

        <div class="status-badge ${reporte.hayVinculos ? 'status-rechazado' : 'status-aprobado'}">
            ${reporte.hayVinculos ? '⚠️ VÍNCULOS FAMILIARES DETECTADOS' : '✅ NO HAY VÍNCULOS FAMILIARES'}
        </div>

        <div class="summary-cards">
            <div class="summary-card total">
                <div class="summary-number">${reporte.totalDNIs}</div>
                <div class="summary-label">Total DNIs</div>
            </div>
            <div class="summary-card ${reporte.hayVinculos ? 'rechazado' : 'aprobado'}">
                <div class="summary-number">${reporte.totalVinculos}</div>
                <div class="summary-label">Vínculos Encontrados</div>
            </div>
            <div class="summary-card aprobado">
                <div class="summary-number">${reporte.dnisSinVinculos.length}</div>
                <div class="summary-label">DNIs Sin Vínculos</div>
            </div>
            <div class="summary-card" style="background: linear-gradient(135deg, #64748b 0%, #475569 100%); color: white;">
                <div class="summary-number">${reporte.dnisSinDatos.length}</div>
                <div class="summary-label">DNIs Sin Datos</div>
            </div>
        </div>

        <div style="padding: 15px; background: ${reporte.hayVinculos ? '#fee2e2' : '#d1fae5'}; border-radius: 8px; margin: 20px 0; border-left: 4px solid ${reporte.hayVinculos ? '#ef4444' : '#10b981'};">
            <strong style="color: ${reporte.hayVinculos ? '#991b1b' : '#065f46'};">${reporte.mensaje}</strong>
        </div>

        ${reporte.hayVinculos && reporte.vinculos.length > 0 ? `
            <div class="dni-section">
                <h3 style="color: #dc2626;">🔗 Vínculos Familiares Detectados (${reporte.vinculos.length})</h3>
                <div style="margin-top: 15px;">
                    ${reporte.vinculos.map((vinculo, index) => `
                        <div style="
                            padding: 20px;
                            background: white;
                            border: 2px solid #fecaca;
                            border-radius: 12px;
                            margin-bottom: 15px;
                            box-shadow: 0 2px 8px rgba(239, 68, 68, 0.1);
                        ">
                            <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 10px;">
                                <span style="
                                    background: #dc2626;
                                    color: white;
                                    padding: 6px 12px;
                                    border-radius: 50%;
                                    font-weight: bold;
                                    font-size: 0.9rem;
                                ">${index + 1}</span>
                                <span style="font-size: 1.1rem; font-weight: bold; color: #dc2626;">
                                    VÍNCULO FAMILIAR DETECTADO
                                </span>
                            </div>

                            <div style="display: grid; grid-template-columns: 1fr auto 1fr; gap: 15px; align-items: center; margin-top: 15px;">
                                <!-- Persona 1 -->
                                <div style="padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                    <div style="font-size: 0.75rem; color: #92400e; font-weight: 600; text-transform: uppercase; margin-bottom: 5px;">
                                        Persona 1
                                    </div>
                                    <div style="font-weight: bold; color: #1e293b; margin-bottom: 5px;">
                                        ${vinculo.nombre1}
                                    </div>
                                    <code class="dni-code" style="font-size: 0.95rem;">${vinculo.dni1}</code>
                                </div>

                                <!-- Relación -->
                                <div style="text-align: center;">
                                    <div style="
                                        background: #fee2e2;
                                        color: #991b1b;
                                        padding: 8px 15px;
                                        border-radius: 20px;
                                        font-weight: 700;
                                        font-size: 0.85rem;
                                        white-space: nowrap;
                                        border: 2px solid #ef4444;
                                    ">
                                        ↔ ${vinculo.tipoRelacion}
                                    </div>
                                </div>

                                <!-- Persona 2 -->
                                <div style="padding: 15px; background: #fef3c7; border-radius: 8px; border-left: 4px solid #f59e0b;">
                                    <div style="font-size: 0.75rem; color: #92400e; font-weight: 600; text-transform: uppercase; margin-bottom: 5px;">
                                        Persona 2
                                    </div>
                                    <div style="font-weight: bold; color: #1e293b; margin-bottom: 5px;">
                                        ${vinculo.nombre2}
                                    </div>
                                    <code class="dni-code" style="font-size: 0.95rem;">${vinculo.dni2}</code>
                                </div>
                            </div>

                            <div style="margin-top: 12px; padding: 10px; background: #fef2f2; border-radius: 6px;">
                                <small style="color: #7f1d1d; font-weight: 500;">
                                    📍 ${vinculo.direccion}
                                </small>
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        ${reporte.dnisConVinculos.length > 0 ? `
            <div class="dni-section">
                <h3>⚠️ DNIs con Vínculos (${reporte.dnisConVinculos.length})</h3>
                <div class="dni-list">
                    ${reporte.dnisConVinculos.map(dni =>
                        `<span class="dni-badge dni-rechazado">${dni}</span>`
                    ).join('')}
                </div>
            </div>
        ` : ''}

        ${reporte.dnisSinVinculos.length > 0 ? `
            <div class="dni-section">
                <h3>✅ DNIs Sin Vínculos (${reporte.dnisSinVinculos.length})</h3>
                <div class="dni-list">
                    ${reporte.dnisSinVinculos.map(dni =>
                        `<span class="dni-badge dni-aprobado">${dni}</span>`
                    ).join('')}
                </div>
            </div>
        ` : ''}

        ${reporte.dnisSinDatos.length > 0 ? `
            <div class="dni-section">
                <h3>ℹ️ DNIs Sin Datos en el Sistema (${reporte.dnisSinDatos.length})</h3>
                <div class="dni-list">
                    ${reporte.dnisSinDatos.map(dni =>
                        `<span class="dni-badge" style="background: #e2e8f0; color: #475569;">${dni}</span>`
                    ).join('')}
                </div>
            </div>
        ` : ''}

        <div class="dni-section">
            <h3>📋 Detalle de Todos los DNIs Validados</h3>
            <div class="table-container">
                <table class="personas-table">
                    <thead>
                        <tr>
                            <th>DNI</th>
                            <th>Nombre Completo</th>
                            <th>Encontrado</th>
                            <th>Es Familiar</th>
                            <th>Familiar de</th>
                            <th>Parentesco</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${detalles.dnisValidados.map(validacion => `
                            <tr>
                                <td>
                                    <code class="dni-code">${validacion.dni}</code>
                                </td>
                                <td class="nombre-cell">
                                    <strong>${validacion.nombrePersona || '-'}</strong>
                                </td>
                                <td class="center-cell">
                                    ${validacion.encontrado
                                        ? '<span class="badge badge-success">✅ Sí</span>'
                                        : '<span class="badge badge-info">ℹ️ No</span>'
                                    }
                                </td>
                                <td class="center-cell">
                                    ${validacion.esFamiliar
                                        ? '<span class="badge badge-danger">⚠️ SÍ</span>'
                                        : '<span class="badge badge-success">✅ NO</span>'
                                    }
                                </td>
                                <td>
                                    ${validacion.esFamiliar && validacion.nombreFamiliar
                                        ? `<strong>${validacion.nombreFamiliar}</strong><br><code class="dni-code">${validacion.dniFamiliar}</code>`
                                        : '-'
                                    }
                                </td>
                                <td class="center-cell">
                                    ${validacion.parentesco
                                        ? `<span class="badge badge-warning">${validacion.parentesco}</span>`
                                        : '-'
                                    }
                                </td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
        </div>

        <div style="margin-top: 20px; padding: 15px; background: #f1f5f9; border-radius: 8px; border-left: 4px solid #3b82f6;">
            <small style="color: #475569;">
                <strong>Fecha:</strong> ${new Date(reporte.timestamp).toLocaleString('es-PE')}<br>
                <strong>Nota:</strong> Solo se comparan los DNIs ingresados. No se realiza scraping a SUNAT/OSCE.
            </small>
        </div>
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

// ===== UTILIDADES =====
function validarDNI(dni) {
    if (!dni || typeof dni !== 'string') return false;
    const dniLimpio = dni.trim();
    return /^\d{8}$/.test(dniLimpio);
}

function validarRUC(ruc) {
    if (!ruc || typeof ruc !== 'string') {
        showAlert('error', 'El RUC es requerido');
        return false;
    }

    const rucLimpio = ruc.trim();

    // Validar que tenga exactamente 11 dígitos
    if (!/^\d{11}$/.test(rucLimpio)) {
        showAlert('error', 'El RUC debe tener exactamente 11 dígitos numéricos');
        return false;
    }

    // Validar que comience con 10, 15, 17, o 20 (tipos válidos de RUC)
    const prefijo = rucLimpio.substring(0, 2);
    if (!['10', '15', '17', '20'].includes(prefijo)) {
        showAlert('error', 'El RUC debe comenzar con 10, 15, 17, o 20');
        return false;
    }

    return true;
}

function setLoading(tipo, isLoading) {
    const form = document.getElementById(`form-${tipo}`);
    const button = form.querySelector('button[type="submit"]');
    const btnText = button.querySelector('.btn-text');
    const btnLoader = button.querySelector('.btn-loader');

    button.disabled = isLoading;

    if (isLoading) {
        btnText.style.display = 'none';
        btnLoader.style.display = 'inline-flex';
        btnLoader.innerHTML = '<span class="loading"></span> Procesando...';
    } else {
        btnText.style.display = 'inline';
        btnLoader.style.display = 'none';
    }
}

function hideResultado(tipo) {
    const container = document.getElementById(`resultado-${tipo}`);
    container.style.display = 'none';
}

function showAlert(type, message) {
    const container = document.getElementById('alert-container');

    const alert = document.createElement('div');
    alert.className = `alert alert-${type}`;
    alert.innerHTML = `
        <span>${getAlertIcon(type)}</span>
        <span>${message}</span>
    `;

    container.appendChild(alert);

    // Auto-remover después de 5 segundos
    setTimeout(() => {
        alert.style.opacity = '0';
        setTimeout(() => alert.remove(), 300);
    }, 5000);
}

function getAlertIcon(type) {
    const icons = {
        success: '✅',
        error: '❌',
        info: 'ℹ️'
    };
    return icons[type] || 'ℹ️';
}

// ===== OCR - EXTRACCIÓN DE DNIs DESDE IMÁGENES =====
async function extraerDNIsDesdeImagen(file) {
    return new Promise((resolve, reject) => {
        // Mostrar loader
        const loader = document.getElementById('ocr-loader');
        const progress = document.getElementById('ocr-progress');
        const progressText = document.getElementById('ocr-progress-text');

        if (loader) loader.style.display = 'flex';
        if (progress) progress.value = 0;
        if (progressText) progressText.textContent = 'Iniciando OCR...';

        // Cargar Tesseract desde CDN
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = async () => {
            try {
                const { createWorker } = Tesseract;
                const worker = await createWorker('spa', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const percent = Math.round(m.progress * 100);
                            if (progress) progress.value = percent;
                            if (progressText) progressText.textContent = `Procesando imagen: ${percent}%`;
                        }
                    }
                });

                const { data: { text } } = await worker.recognize(file);
                await worker.terminate();

                // Extraer DNIs del texto usando regex
                const dniRegex = /\b\d{8}\b/g;
                const dnis = text.match(dniRegex) || [];

                // Eliminar duplicados
                const dnisUnicos = [...new Set(dnis)];

                if (loader) loader.style.display = 'none';

                resolve(dnisUnicos);
            } catch (error) {
                if (loader) loader.style.display = 'none';
                reject(error);
            }
        };
        script.onerror = () => {
            if (loader) loader.style.display = 'none';
            reject(new Error('Error al cargar Tesseract.js'));
        };
        document.head.appendChild(script);
    });
}

function inicializarOCR() {
    const uploadBtn = document.getElementById('upload-image-btn');
    const fileInput = document.getElementById('image-input');
    const previewGrid = document.getElementById('preview-grid');
    const previewContainer = document.getElementById('preview-container');
    const dnisInput = document.getElementById('dnis-input');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Validar que todas sean imágenes
        const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length > 0) {
            showAlert('error', 'Por favor seleccione solo archivos de imagen válidos (JPG, PNG, etc.)');
            return;
        }

        // Limpiar preview anterior
        if (previewGrid) previewGrid.innerHTML = '';

        // Mostrar preview de todas las imágenes
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgContainer = document.createElement('div');
                imgContainer.style.cssText = 'position: relative; border: 2px solid var(--border-color); border-radius: 8px; overflow: hidden;';

                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.cssText = 'width: 100%; height: 150px; object-fit: cover;';

                imgContainer.appendChild(img);
                if (previewGrid) previewGrid.appendChild(imgContainer);
            };
            reader.readAsDataURL(file);
        });

        if (previewContainer) previewContainer.style.display = 'block';

        try {
            showAlert('info', `Procesando ${files.length} imagen(es)... Esto puede tomar unos segundos`);

            // Procesar cada imagen y combinar DNIs
            const todosLosDnis = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progressText = document.getElementById('ocr-progress-text');
                if (progressText) {
                    progressText.textContent = `Procesando imagen ${i + 1} de ${files.length}...`;
                }

                const dnis = await extraerDNIsDesdeImagen(file);
                todosLosDnis.push(...dnis);
            }

            // Eliminar duplicados de todos los DNIs extraídos
            const dnisUnicos = [...new Set(todosLosDnis)];

            if (dnisUnicos.length === 0) {
                showAlert('error', 'No se encontraron DNIs en las imágenes. Asegúrese de que las imágenes sean claras y contengan números de 8 dígitos.');
                return;
            }

            // Agregar DNIs al textarea (uno por línea)
            const dniActuales = dnisInput.value.trim();
            const nuevosDnis = dnisUnicos.join('\n');

            if (dniActuales) {
                dnisInput.value = dniActuales + '\n' + nuevosDnis;
            } else {
                dnisInput.value = nuevosDnis;
            }

            showAlert('success', `✅ Se extrajeron ${dnisUnicos.length} DNI(s) únicos de ${files.length} imagen(es)`);

        } catch (error) {
            console.error('Error OCR:', error);
            showAlert('error', `Error al procesar las imágenes: ${error.message}`);
        }
    });
}

// Inicializar OCR cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarOCR);
} else {
    inicializarOCR();
}

// ===== OCR GENERAL - EXTRACCIÓN DE DNIs Y RUCs =====
async function extraerNumerosDesdeImagen(file) {
    return new Promise((resolve, reject) => {
        // Cargar Tesseract desde CDN si no está cargado
        const script = document.createElement('script');
        script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
        script.onload = async () => {
            try {
                const { createWorker } = Tesseract;
                const worker = await createWorker('spa', 1, {
                    logger: m => {
                        if (m.status === 'recognizing text') {
                            const percent = Math.round(m.progress * 100);
                            const progress = document.getElementById('ocr-progress-general');
                            const progressText = document.getElementById('ocr-progress-text-general');
                            if (progress) progress.style.width = `${percent}%`;
                            if (progressText) progressText.textContent = `Procesando imagen: ${percent}%`;
                        }
                    }
                });

                const { data: { text } } = await worker.recognize(file);
                await worker.terminate();

                // Extraer DNIs (8 dígitos) y RUCs (11 dígitos)
                const dniRegex = /\b\d{8}\b/g;
                const rucRegex = /\b\d{11}\b/g;

                const dnis = text.match(dniRegex) || [];
                const rucs = text.match(rucRegex) || [];

                // Clasificar RUCs por tipo:
                // 10 = Persona Natural
                // 15 = Persona Natural No Domiciliada
                // 17 = Persona Natural con Negocio
                // 20 = Persona Jurídica (Empresas)
                const todosLosRUCs = rucs.filter(ruc => {
                    const prefijo = ruc.substring(0, 2);
                    return ['10', '15', '17', '20'].includes(prefijo);
                });

                // Separar RUCs de Personas Naturales (10, 15, 17) vs Personas Jurídicas (20)
                const rucsPersonasNaturales = todosLosRUCs.filter(ruc => {
                    const prefijo = ruc.substring(0, 2);
                    return ['10', '15', '17'].includes(prefijo);
                });

                const rucsPersonasJuridicas = todosLosRUCs.filter(ruc =>
                    ruc.startsWith('20')
                );

                // Extraer DNIs de RUCs de Personas Naturales
                // Estructura tipo 10: 10 + DNI (8 dígitos) + dígito verificador
                // Ejemplo: 10442273818 → DNI: 44227381
                const dnisDeRUCsNaturales = rucsPersonasNaturales
                    .filter(ruc => ruc.startsWith('10')) // Solo tipo 10 tiene DNI extraíble
                    .map(ruc => ruc.substring(2, 10)); // Extraer los 8 dígitos del DNI

                // Combinar DNIs directos con DNIs extraídos de RUCs tipo 10
                const todosDNIs = [...dnis, ...dnisDeRUCsNaturales];

                resolve({
                    dnis: [...new Set(todosDNIs)],
                    rucs: [...new Set(rucsPersonasJuridicas)] // SOLO RUCs tipo 20 (empresas)
                });
            } catch (error) {
                reject(error);
            }
        };
        script.onerror = () => {
            reject(new Error('Error al cargar Tesseract.js'));
        };
        document.head.appendChild(script);
    });
}

function inicializarOCRGeneral() {
    const uploadBtn = document.getElementById('upload-image-btn-general');
    const fileInput = document.getElementById('image-input-general');
    const previewGrid = document.getElementById('preview-grid-general');
    const previewContainer = document.getElementById('preview-container-general');
    const loader = document.getElementById('ocr-loader-general');
    const resultsSummary = document.getElementById('ocr-results-summary');
    const dnisCountEl = document.getElementById('dnis-count');
    const rucsCountEl = document.getElementById('rucs-count');

    if (!uploadBtn || !fileInput) return;

    uploadBtn.addEventListener('click', () => {
        fileInput.click();
    });

    fileInput.addEventListener('change', async (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        // Validar que todas sean imágenes
        const invalidFiles = files.filter(file => !file.type.startsWith('image/'));
        if (invalidFiles.length > 0) {
            showAlert('error', 'Por favor seleccione solo archivos de imagen válidos (JPG, PNG, etc.)');
            return;
        }

        // Limpiar preview anterior
        if (previewGrid) previewGrid.innerHTML = '';
        if (resultsSummary) resultsSummary.style.display = 'none';

        // Mostrar preview de todas las imágenes
        files.forEach(file => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const imgContainer = document.createElement('div');
                imgContainer.style.cssText = 'position: relative; border: 2px solid rgba(255,255,255,0.5); border-radius: 8px; overflow: hidden;';

                const img = document.createElement('img');
                img.src = e.target.result;
                img.style.cssText = 'width: 100%; height: 150px; object-fit: cover;';

                imgContainer.appendChild(img);
                if (previewGrid) previewGrid.appendChild(imgContainer);
            };
            reader.readAsDataURL(file);
        });

        if (previewContainer) previewContainer.style.display = 'block';
        if (loader) loader.style.display = 'block';

        try {
            showAlert('info', `Procesando ${files.length} imagen(es)... Detectando DNIs y RUCs automáticamente`);

            const todosDNIs = [];
            const todosRUCs = [];

            for (let i = 0; i < files.length; i++) {
                const file = files[i];
                const progressText = document.getElementById('ocr-progress-text-general');
                if (progressText) {
                    progressText.textContent = `Procesando imagen ${i + 1} de ${files.length}...`;
                }

                const { dnis, rucs } = await extraerNumerosDesdeImagen(file);
                todosDNIs.push(...dnis);
                todosRUCs.push(...rucs);
            }

            // Eliminar duplicados
            const dnisUnicos = [...new Set(todosDNIs)];
            const rucsUnicos = [...new Set(todosRUCs)];

            if (loader) loader.style.display = 'none';

            if (dnisUnicos.length === 0 && rucsUnicos.length === 0) {
                showAlert('error', 'No se encontraron DNIs ni RUCs en las imágenes. Asegúrese de que las imágenes sean claras.');
                return;
            }

            // Actualizar contadores
            if (dnisCountEl) dnisCountEl.textContent = dnisUnicos.length;
            if (rucsCountEl) rucsCountEl.textContent = rucsUnicos.length;
            if (resultsSummary) resultsSummary.style.display = 'block';

            // Auto-agregar DNIs al textarea de "Comparar DNIs"
            if (dnisUnicos.length > 0) {
                const dnisInput = document.getElementById('dnis-input');
                if (dnisInput) {
                    const dniActuales = dnisInput.value.trim();
                    const nuevosDnis = dnisUnicos.join('\n');

                    if (dniActuales) {
                        dnisInput.value = dniActuales + '\n' + nuevosDnis;
                    } else {
                        dnisInput.value = nuevosDnis;
                    }
                }
            }

            // Auto-agregar RUCs según cantidad:
            // - Si es 1 RUC → campo "RUC Individual"
            // - Si son 2+ RUCs → textarea "Búsqueda Masiva"
            if (rucsUnicos.length > 0) {
                if (rucsUnicos.length === 1) {
                    // Un solo RUC → enviarlo a "RUC Individual"
                    const rucInput = document.getElementById('ruc-input');
                    if (rucInput) {
                        rucInput.value = rucsUnicos[0];
                    }
                } else {
                    // Múltiples RUCs → enviarlo a "Búsqueda Masiva"
                    const rucsInput = document.getElementById('rucs-input');
                    if (rucsInput) {
                        const rucsActuales = rucsInput.value.trim();
                        const nuevosRucs = rucsUnicos.join('\n');

                        if (rucsActuales) {
                            rucsInput.value = rucsActuales + '\n' + nuevosRucs;
                        } else {
                            rucsInput.value = nuevosRucs;
                        }
                    }
                }
            }

            showAlert('success', `✅ Extraídos: ${dnisUnicos.length} DNI(s) y ${rucsUnicos.length} RUC(s) de ${files.length} imagen(es)`);

        } catch (error) {
            console.error('Error OCR:', error);
            if (loader) loader.style.display = 'none';
            showAlert('error', `Error al procesar las imágenes: ${error.message}`);
        }
    });
}

// Inicializar OCR General cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', inicializarOCRGeneral);
} else {
    inicializarOCRGeneral();
}
