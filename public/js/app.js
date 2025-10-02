// Configuración de la API
const API_BASE_URL = 'http://localhost:3000/api';

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
    `;

    container.innerHTML = html;
    container.style.display = 'block';
}

// ===== UTILIDADES =====
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
