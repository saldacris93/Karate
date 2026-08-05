/* Cotizador de uniformes de karate — todo local, sin servidor.
   Datos en localStorage; PDF con jsPDF + autotable; compartir con Web Share API. */
'use strict';

// ---------------------------------------------------------------- almacenamiento
const K = {
  config: 'ck_config',
  catalogo: 'ck_catalogo',
  historial: 'ck_historial',
  borrador: 'ck_borrador',
  token: 'ck_token',
  ultimoRespaldo: 'ck_ultimo_respaldo',
};

// Respaldo remoto: archivo JSON en un repositorio PRIVADO aparte, para que los
// datos de los clientes no queden visibles en el repositorio público de la app.
// Se escribe en la rama por defecto del repo.
const RESPALDO = {
  repo: 'saldacris93/karate-datos',
  ruta: 'respaldo.json',
};

function leer(clave, porDefecto) {
  try {
    const v = localStorage.getItem(clave);
    return v ? JSON.parse(v) : porDefecto;
  } catch { return porDefecto; }
}
function guardar(clave, valor) {
  localStorage.setItem(clave, JSON.stringify(valor));
}

// Uniformes con precio por talla (precio sugerido de las listas 2025).
const UNIFORMES = [
  {
    nombre: 'Karategui clásico liviano',
    precios: { '00': 143000, '0': 143000, '0,5': 143000, '1': 143000, '1,5': 155000, '2': 155000, '2,5': 168000, '3': 175000, '3,5': 181500, '4': 192000, '5': 198500 },
  },
  {
    nombre: 'Karategui clásico kata',
    precios: { '00': 201600, '0': 201600, '0,5': 201600, '1': 201600, '1,5': 207200, '2': 216160, '2,5': 225120, '3': 234080, '3,5': 239680, '4': 252000, '5': 263200, '6': 275520 },
  },
  {
    nombre: 'Combo liviano (colores)',
    precios: { '00': 263200, '0': 263200, '1': 263200, '1,5': 288960, '2': 288960, '2,5': 303520, '3': 313600, '3,5': 326240, '4': 342720, '5': 355040, '6': 375200 },
  },
  {
    nombre: 'Combo kata (colores)',
    precios: { '00': 363328, '0': 363328, '1': 363328, '1,5': 374528, '2': 383040, '2,5': 399392, '3': 413280, '3,5': 423136, '4': 443520, '5': 463232 },
  },
];

const CATALOGO_INICIAL = [
  ...UNIFORMES,
  { nombre: 'Pantalón de repuesto', precio: 60000 },
  { nombre: 'Cinturón de color', precio: 18000 },
  { nombre: 'Cinturón negro bordado', precio: 65000 },
  { nombre: 'Bordado de nombre / escudo', precio: 25000 },
];

// Tallas genéricas para productos sin precio por talla (cinturones, etc.).
const TALLAS = ['—', '000', '00', '0', '1', '2', '3', '4', '5', '6', '7', '8'];

// JS reordena las claves con aspecto de número entero ('0','1','2'…), así que
// las tallas se ordenan explícitamente: 000, 00, 0, 0,5, 1, 1,5, 2…
function ordenTalla(t) {
  if (t === '000') return -2;
  if (t === '00') return -1;
  const n = parseFloat(String(t).replace(',', '.'));
  return Number.isNaN(n) ? 999 : n;
}
function tallasDe(prod) {
  return prod && prod.precios
    ? Object.keys(prod.precios).sort((a, b) => ordenTalla(a) - ordenTalla(b))
    : TALLAS;
}

let config = leer(K.config, {
  negocio: '', nit: '', telefono: '', correo: '', ciudad: '',
  logo: '', ivaPct: 0, pie: '', prefijo: 'COT', consecutivo: 1,
});
let catalogo = leer(K.catalogo, CATALOGO_INICIAL);
let historial = leer(K.historial, []);

// Migración: a los catálogos guardados antes de existir los uniformes con precio
// por talla se les agregan una sola vez, retirando los productos de ejemplo.
const EJEMPLOS_VIEJOS = [
  'Karategui liviano 8 oz (entrenamiento)', 'Karategui mediano 10 oz',
  'Karategui kumite (competencia)', 'Karategui kata pesado 14 oz',
];
if (!catalogo.some((p) => p.precios)) {
  catalogo = [
    ...JSON.parse(JSON.stringify(UNIFORMES)),
    ...catalogo.filter((p) => !EJEMPLOS_VIEJOS.includes(p.nombre)),
  ];
  guardar(K.catalogo, catalogo);
}

// La cotización que se está editando. `numero` queda vacío hasta generar el PDF.
let actual = leer(K.borrador, null) || cotizacionVacia();

function cotizacionVacia() {
  return {
    numero: '',
    fecha: '',
    cliente: { nombre: '', nit: '', telefono: '' },
    items: [{ producto: '', talla: '—', cantidad: 1, precio: 0 }],
    descuento: 0,
    vigencia: 8,
    notas: '',
  };
}

// ---------------------------------------------------------------- utilidades
const $ = (sel) => document.querySelector(sel);

const fmtCOP = new Intl.NumberFormat('es-CO', {
  style: 'currency', currency: 'COP', maximumFractionDigits: 0,
});
const dinero = (n) => fmtCOP.format(Math.round(n || 0));

function fechaLegible(iso) {
  const d = iso ? new Date(iso) : new Date();
  return d.toLocaleDateString('es-CO', { year: 'numeric', month: 'long', day: 'numeric' });
}

function aviso(msj) {
  const el = $('#aviso');
  el.textContent = msj;
  el.hidden = false;
  clearTimeout(aviso._t);
  aviso._t = setTimeout(() => { el.hidden = true; }, 2600);
}

function telefonoWpp(tel) {
  let d = String(tel || '').replace(/\D/g, '');
  if (d.length === 10 && d.startsWith('3')) d = '57' + d; // celular colombiano sin indicativo
  return d;
}

function totales(cot) {
  const subtotal = cot.items.reduce((s, it) => s + (Number(it.cantidad) || 0) * (Number(it.precio) || 0), 0);
  const descuento = Math.min(Number(cot.descuento) || 0, subtotal);
  const base = subtotal - descuento;
  const iva = base * ((Number(config.ivaPct) || 0) / 100);
  return { subtotal, descuento, iva, total: base + iva };
}

// ---------------------------------------------------------------- pestañas
document.querySelectorAll('.tab').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('activa', b === btn));
    document.querySelectorAll('.pantalla').forEach((p) => p.classList.remove('activa'));
    $('#pantalla-' + btn.dataset.pantalla).classList.add('activa');
  });
});

// ---------------------------------------------------------------- pantalla Cotizar
function pintarFormulario() {
  $('#titulo-cotizacion').textContent = actual.numero
    ? `Cotización ${actual.numero}` : 'Nueva cotización';
  $('#cliente-nombre').value = actual.cliente.nombre;
  $('#cliente-nit').value = actual.cliente.nit || '';
  $('#cliente-telefono').value = actual.cliente.telefono;
  $('#descuento').value = actual.descuento || '';
  $('#vigencia').value = actual.vigencia;
  $('#notas').value = actual.notas;
  pintarItems();
  pintarTotales();
}

function pintarItems() {
  const cont = $('#lista-items');
  cont.innerHTML = '';
  actual.items.forEach((it, i) => {
    const div = document.createElement('div');
    div.className = 'item';

    const opciones = catalogo.map((p) =>
      `<option value="${escapar(p.nombre)}" ${p.nombre === it.producto ? 'selected' : ''}>${escapar(p.nombre)}</option>`
    ).join('');
    const esLibre = it.producto && !catalogo.some((p) => p.nombre === it.producto);
    const prodSel = catalogo.find((p) => p.nombre === it.producto);
    const tallas = tallasDe(prodSel);
    if (!tallas.includes(it.talla)) it.talla = tallas[0];

    div.innerHTML = `
      <div class="encabezado-item">
        <strong>Producto ${i + 1}</strong>
        <button type="button" class="quitar" title="Quitar" data-accion="quitar">✕</button>
      </div>
      <label>Producto
        <select data-campo="producto">
          <option value="" ${!it.producto ? 'selected' : ''} disabled>Elige un producto…</option>
          ${opciones}
          <option value="__otro__" ${esLibre ? 'selected' : ''}>✏️ Otro (escribir)</option>
        </select>
      </label>
      <label data-rol="libre" ${esLibre ? '' : 'hidden'}>Descripción
        <input type="text" data-campo="producto-libre" value="${escapar(esLibre ? it.producto : '')}" placeholder="Describe el producto">
      </label>
      <div class="fila">
        <label class="corta">Talla
          <select data-campo="talla">${tallas.map((t) => `<option ${t === it.talla ? 'selected' : ''}>${t}</option>`).join('')}</select>
        </label>
        <label class="corta">Cant.
          <input type="number" data-campo="cantidad" min="1" step="1" inputmode="numeric" value="${it.cantidad}">
        </label>
        <label>Precio unit.
          <input type="number" data-campo="precio" min="0" step="any" inputmode="numeric" value="${it.precio || ''}" placeholder="0">
        </label>
      </div>
      <div class="total-item">${dinero((it.cantidad || 0) * (it.precio || 0))}</div>`;

    div.addEventListener('input', (ev) => alCambiarItem(ev, i));
    div.addEventListener('change', (ev) => alCambiarItem(ev, i));
    div.querySelector('[data-accion="quitar"]').addEventListener('click', () => {
      actual.items.splice(i, 1);
      if (!actual.items.length) actual.items.push({ producto: '', talla: '—', cantidad: 1, precio: 0 });
      guardarBorrador();
      pintarItems();
      pintarTotales();
    });
    cont.appendChild(div);
  });
}

function alCambiarItem(ev, i) {
  const campo = ev.target.dataset.campo;
  if (!campo) return;
  const it = actual.items[i];
  if (campo === 'producto') {
    if (ev.target.value === '__otro__') {
      it.producto = '';
      ev.target.closest('.item').querySelector('[data-rol="libre"]').hidden = false;
    } else {
      it.producto = ev.target.value;
      const prod = catalogo.find((p) => p.nombre === it.producto);
      if (prod) {
        if (prod.precios) {
          if (!(it.talla in prod.precios)) it.talla = tallasDe(prod)[0];
          it.precio = prod.precios[it.talla];
        } else {
          it.precio = prod.precio;
        }
      }
      // Redibuja para que el selector de tallas muestre las de este producto.
      guardarBorrador();
      pintarItems();
      pintarTotales();
      return;
    }
  } else if (campo === 'producto-libre') {
    it.producto = ev.target.value;
  } else if (campo === 'talla') {
    it.talla = ev.target.value;
    const prod = catalogo.find((p) => p.nombre === it.producto);
    if (prod && prod.precios && prod.precios[it.talla] != null) {
      it.precio = prod.precios[it.talla];
      ev.target.closest('.item').querySelector('[data-campo="precio"]').value = it.precio;
    }
  } else if (campo === 'cantidad') {
    it.cantidad = Math.max(1, parseInt(ev.target.value, 10) || 1);
  } else if (campo === 'precio') {
    it.precio = Number(ev.target.value) || 0;
  }
  ev.target.closest('.item').querySelector('.total-item').textContent =
    dinero((it.cantidad || 0) * (it.precio || 0));
  guardarBorrador();
  pintarTotales();
}

function pintarTotales() {
  const t = totales(actual);
  $('#ver-subtotal').textContent = dinero(t.subtotal);
  $('#fila-descuento').hidden = !t.descuento;
  $('#ver-descuento').textContent = '- ' + dinero(t.descuento);
  $('#fila-iva').hidden = !t.iva;
  $('#etiqueta-iva').textContent = `IVA ${config.ivaPct}%`;
  $('#ver-iva').textContent = dinero(t.iva);
  $('#ver-total').textContent = dinero(t.total);
}

function guardarBorrador() { guardar(K.borrador, actual); }

$('#cliente-nombre').addEventListener('input', (e) => { actual.cliente.nombre = e.target.value; guardarBorrador(); });
$('#cliente-nit').addEventListener('input', (e) => { actual.cliente.nit = e.target.value; guardarBorrador(); });
$('#cliente-telefono').addEventListener('input', (e) => { actual.cliente.telefono = e.target.value; guardarBorrador(); });
$('#descuento').addEventListener('input', (e) => { actual.descuento = Number(e.target.value) || 0; guardarBorrador(); pintarTotales(); });
$('#vigencia').addEventListener('input', (e) => { actual.vigencia = Math.max(1, parseInt(e.target.value, 10) || 8); guardarBorrador(); });
$('#notas').addEventListener('input', (e) => { actual.notas = e.target.value; guardarBorrador(); });

$('#btn-agregar-item').addEventListener('click', () => {
  actual.items.push({ producto: '', talla: '—', cantidad: 1, precio: 0 });
  guardarBorrador();
  pintarItems();
});

$('#btn-limpiar').addEventListener('click', () => {
  if (!confirm('¿Limpiar el formulario y empezar una cotización nueva?')) return;
  actual = cotizacionVacia();
  guardarBorrador();
  pintarFormulario();
});

function validar() {
  if (!config.negocio) {
    aviso('Primero completa los datos de tu negocio (pestaña ⚙️ Negocio)');
    return false;
  }
  if (!actual.cliente.nombre.trim()) {
    aviso('Escribe el nombre del cliente');
    $('#cliente-nombre').focus();
    return false;
  }
  const conDatos = actual.items.filter((it) => it.producto && (Number(it.cantidad) || 0) > 0);
  if (!conDatos.length) {
    aviso('Agrega al menos un producto');
    return false;
  }
  return true;
}

// Asigna número y fecha si es nueva, y la deja guardada en el historial.
function consolidar() {
  const limpios = actual.items.filter((it) => it.producto && (Number(it.cantidad) || 0) > 0);
  actual.items = limpios;
  if (!actual.numero) {
    actual.numero = `${config.prefijo || 'COT'}-${String(config.consecutivo || 1).padStart(4, '0')}`;
    config.consecutivo = (Number(config.consecutivo) || 1) + 1;
    guardar(K.config, config);
    pintarNegocio();
  }
  if (!actual.fecha) actual.fecha = new Date().toISOString();
  actual.ivaPct = Number(config.ivaPct) || 0;

  const idx = historial.findIndex((c) => c.numero === actual.numero);
  const copia = JSON.parse(JSON.stringify(actual));
  if (idx >= 0) historial[idx] = copia; else historial.unshift(copia);
  guardar(K.historial, historial);
  pintarHistorial();
  pintarFormulario();
  respaldarAuto();
  return copia;
}

// ---------------------------------------------------------------- PDF
function generarPDF(cot) {
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const ancho = doc.internal.pageSize.getWidth();
  const margen = 15;
  let y = 18;

  // Encabezado
  if (config.logo) {
    try {
      doc.addImage(config.logo, 'PNG', margen, y - 6, 26, 26, undefined, 'FAST');
    } catch { /* logo inválido: se omite */ }
  }
  const xTexto = config.logo ? margen + 32 : margen;
  doc.setFont('helvetica', 'bold').setFontSize(16).setTextColor(127, 29, 29);
  doc.text(config.negocio || 'Mi negocio', xTexto, y);
  doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(80);
  const lineas = [
    config.nit && `NIT: ${config.nit}`,
    [config.telefono && `Tel/WhatsApp: ${config.telefono}`, config.correo].filter(Boolean).join('  ·  '),
    config.ciudad,
  ].filter(Boolean);
  lineas.forEach((l, i) => doc.text(l, xTexto, y + 6 + i * 4.5));

  doc.setFont('helvetica', 'bold').setFontSize(13).setTextColor(28, 25, 23);
  doc.text('COTIZACIÓN', ancho - margen, y, { align: 'right' });
  doc.setFont('helvetica', 'normal').setFontSize(10);
  doc.text(cot.numero, ancho - margen, y + 6, { align: 'right' });
  doc.setFontSize(9).setTextColor(80);
  doc.text(`Fecha: ${fechaLegible(cot.fecha)}`, ancho - margen, y + 11.5, { align: 'right' });
  doc.text(`Válida por ${cot.vigencia} días`, ancho - margen, y + 16, { align: 'right' });

  y += 26;
  doc.setDrawColor(185, 28, 28).setLineWidth(0.8);
  doc.line(margen, y, ancho - margen, y);
  y += 8;

  // Cliente
  doc.setFontSize(10).setTextColor(28, 25, 23);
  const filaCliente = (etiqueta, valor) => {
    doc.setFont('helvetica', 'bold').text(etiqueta, margen, y);
    doc.setFont('helvetica', 'normal').text(String(valor), margen + 20, y);
    y += 5;
  };
  filaCliente('Cliente:', cot.cliente.nombre);
  if (cot.cliente.nit) filaCliente('NIT/C.C.:', cot.cliente.nit);
  if (cot.cliente.telefono) filaCliente('Teléfono:', cot.cliente.telefono);
  y += 1;

  // Tabla de productos
  const filas = cot.items.map((it, i) => [
    i + 1,
    it.producto + (it.talla && it.talla !== '—' ? `  (talla ${it.talla})` : ''),
    it.cantidad,
    dinero(it.precio),
    dinero(it.cantidad * it.precio),
  ]);
  doc.autoTable({
    startY: y,
    margin: { left: margen, right: margen },
    head: [['#', 'Descripción', 'Cant.', 'Precio unit.', 'Total']],
    body: filas,
    theme: 'grid',
    styles: { font: 'helvetica', fontSize: 9.5, cellPadding: 2.5, textColor: [28, 25, 23] },
    headStyles: { fillColor: [185, 28, 28], textColor: 255, fontStyle: 'bold' },
    columnStyles: {
      0: { cellWidth: 8, halign: 'center' },
      2: { cellWidth: 14, halign: 'center' },
      3: { cellWidth: 30, halign: 'right' },
      4: { cellWidth: 32, halign: 'right' },
    },
  });
  y = doc.lastAutoTable.finalY + 6;

  // Totales
  const t = totalesPDF(cot);
  const xEt = ancho - margen - 60;
  const xVal = ancho - margen;
  doc.setFontSize(10).setTextColor(28, 25, 23);
  const filaTotal = (etiqueta, valor, destacada) => {
    doc.setFont('helvetica', destacada ? 'bold' : 'normal');
    if (destacada) {
      doc.setFillColor(28, 25, 23);
      doc.rect(xEt - 4, y - 5, 64 + 4, 8, 'F');
      doc.setTextColor(255);
    }
    doc.text(etiqueta, xEt, y);
    doc.text(valor, xVal, y, { align: 'right' });
    if (destacada) doc.setTextColor(28, 25, 23);
    y += destacada ? 9 : 6;
  };
  filaTotal('Subtotal', dinero(t.subtotal));
  if (t.descuento) filaTotal('Descuento', '- ' + dinero(t.descuento));
  if (t.iva) filaTotal(`IVA ${cot.ivaPct}%`, dinero(t.iva));
  filaTotal('TOTAL', dinero(t.total), true);

  // Notas y condiciones
  y += 4;
  const bloqueTexto = (titulo, texto) => {
    if (!texto) return;
    doc.setFont('helvetica', 'bold').setFontSize(9.5).setTextColor(127, 29, 29);
    doc.text(titulo, margen, y);
    y += 4.5;
    doc.setFont('helvetica', 'normal').setFontSize(9).setTextColor(60);
    const partido = doc.splitTextToSize(texto, ancho - margen * 2);
    doc.text(partido, margen, y);
    y += partido.length * 4 + 4;
  };
  bloqueTexto('Notas', cot.notas);
  bloqueTexto('Condiciones', config.pie);

  // Pie
  doc.setFontSize(8).setTextColor(150);
  doc.text(
    `${config.negocio}${config.telefono ? ' · ' + config.telefono : ''} — ¡Gracias por su confianza!`,
    ancho / 2, doc.internal.pageSize.getHeight() - 10, { align: 'center' },
  );

  return doc;
}

// El IVA del PDF usa el % guardado en la cotización para que el historial no cambie
// si después modificas el % en la configuración.
function totalesPDF(cot) {
  const subtotal = cot.items.reduce((s, it) => s + it.cantidad * it.precio, 0);
  const descuento = Math.min(Number(cot.descuento) || 0, subtotal);
  const base = subtotal - descuento;
  const iva = base * ((Number(cot.ivaPct) || 0) / 100);
  return { subtotal, descuento, iva, total: base + iva };
}

function nombreArchivo(cot) {
  const cliente = cot.cliente.nombre.trim().replace(/[^\wáéíóúñÁÉÍÓÚÑ -]/g, '').replace(/\s+/g, '-');
  return `${cot.numero}${cliente ? '-' + cliente : ''}.pdf`;
}

async function compartirPDF(cot) {
  const doc = generarPDF(cot);
  const blob = doc.output('blob');
  const archivo = new File([blob], nombreArchivo(cot), { type: 'application/pdf' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try {
      await navigator.share({
        files: [archivo],
        title: `Cotización ${cot.numero}`,
        text: `Cotización ${cot.numero} — ${config.negocio}`,
      });
      return;
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario canceló el menú de compartir
    }
  }
  // Sin Web Share (ej. computador): descarga directa.
  doc.save(nombreArchivo(cot));
  aviso('PDF descargado. Adjúntalo en WhatsApp o correo.');
}

function resumenTexto(cot) {
  const t = totalesPDF(cot);
  const lineas = cot.items.map((it) =>
    `• ${it.cantidad} x ${it.producto}${it.talla !== '—' ? ` (talla ${it.talla})` : ''} — ${dinero(it.cantidad * it.precio)}`);
  return [
    `*Cotización ${cot.numero}* — ${config.negocio}`,
    `Cliente: ${cot.cliente.nombre}`,
    '',
    ...lineas,
    t.descuento ? `Descuento: -${dinero(t.descuento)}` : '',
    t.iva ? `IVA ${cot.ivaPct}%: ${dinero(t.iva)}` : '',
    `*TOTAL: ${dinero(t.total)}*`,
    '',
    `Válida por ${cot.vigencia} días.`,
    cot.notas,
  ].filter(Boolean).join('\n');
}

$('#btn-compartir').addEventListener('click', async () => {
  if (!validar()) return;
  const cot = consolidar();
  await compartirPDF(cot);
});

$('#btn-descargar').addEventListener('click', () => {
  if (!validar()) return;
  const cot = consolidar();
  generarPDF(cot).save(nombreArchivo(cot));
  aviso('PDF descargado');
});

$('#btn-wpp-texto').addEventListener('click', () => {
  if (!validar()) return;
  const cot = consolidar();
  const num = telefonoWpp(cot.cliente.telefono);
  const url = `https://wa.me/${num}?text=${encodeURIComponent(resumenTexto(cot))}`;
  window.open(url, '_blank');
});

// ---------------------------------------------------------------- historial
function pintarHistorial() {
  const cont = $('#lista-historial');
  cont.innerHTML = '';
  if (!historial.length) {
    cont.innerHTML = '<p class="vacio">Aún no has generado cotizaciones.<br>Cuando generes un PDF, quedará guardado aquí.</p>';
    return;
  }
  historial.forEach((cot, i) => {
    const t = totalesPDF(cot);
    const div = document.createElement('div');
    div.className = 'tarjeta-cot';
    div.innerHTML = `
      <div class="cabecera">
        <span class="numero">${escapar(cot.numero)}</span>
        <span class="fecha">${fechaLegible(cot.fecha)}</span>
      </div>
      <div class="cliente">${escapar(cot.cliente.nombre)} · <span class="total">${dinero(t.total)}</span></div>
      <div class="botones">
        <button type="button" class="primario" data-a="pdf">📄 PDF</button>
        <button type="button" class="secundario" data-a="editar">✏️ Abrir</button>
        <button type="button" class="secundario" data-a="duplicar">📋 Duplicar</button>
        <button type="button" class="peligro-suave" data-a="borrar">🗑️</button>
      </div>`;
    div.querySelector('[data-a="pdf"]').addEventListener('click', () => compartirPDF(cot));
    div.querySelector('[data-a="editar"]').addEventListener('click', () => {
      actual = JSON.parse(JSON.stringify(cot));
      guardarBorrador();
      pintarFormulario();
      irACotizar();
    });
    div.querySelector('[data-a="duplicar"]').addEventListener('click', () => {
      actual = JSON.parse(JSON.stringify(cot));
      actual.numero = '';
      actual.fecha = '';
      guardarBorrador();
      pintarFormulario();
      irACotizar();
      aviso('Copia lista: ajusta el cliente y genera el PDF');
    });
    div.querySelector('[data-a="borrar"]').addEventListener('click', () => {
      if (!confirm(`¿Eliminar la cotización ${cot.numero}?`)) return;
      historial.splice(i, 1);
      guardar(K.historial, historial);
      pintarHistorial();
    });
    cont.appendChild(div);
  });
}

function irACotizar() {
  document.querySelector('.tab[data-pantalla="cotizar"]').click();
}

// ---------------------------------------------------------------- catálogo
function pintarCatalogo() {
  const cont = $('#lista-catalogo');
  cont.innerHTML = '';
  catalogo.forEach((p, i) => {
    const div = document.createElement('div');
    if (p.precios) {
      // Producto con precio por talla: nombre arriba y cuadrícula talla → precio.
      div.className = 'prod prod-tallas';
      div.innerHTML = `
        <div class="fila-prod">
          <input class="nombre" type="text" value="${escapar(p.nombre)}" placeholder="Nombre del producto">
          <button type="button" class="quitar" title="Quitar">✕</button>
        </div>
        <div class="cuadricula-tallas">
          ${tallasDe(p).map((t) => [t, p.precios[t]]).map(([t, v]) => `
            <label>T. ${escapar(t)}
              <input type="number" min="0" step="any" inputmode="numeric" data-talla="${escapar(t)}" value="${v || ''}">
            </label>`).join('')}
        </div>`;
      div.querySelectorAll('[data-talla]').forEach((inp) => {
        inp.addEventListener('input', () => {
          catalogo[i].precios[inp.dataset.talla] = Number(inp.value) || 0;
          guardar(K.catalogo, catalogo);
        });
      });
    } else {
      div.className = 'prod';
      div.innerHTML = `
        <input class="nombre" type="text" value="${escapar(p.nombre)}" placeholder="Nombre del producto">
        <input class="precio" type="number" min="0" step="any" inputmode="numeric" value="${p.precio || ''}" placeholder="Precio">
        <button type="button" class="quitar" title="Quitar">✕</button>`;
      div.querySelector('.precio').addEventListener('input', (e) => {
        catalogo[i].precio = Number(e.target.value) || 0;
        guardar(K.catalogo, catalogo);
      });
    }
    div.querySelector('.nombre').addEventListener('input', (e) => {
      catalogo[i].nombre = e.target.value;
      guardar(K.catalogo, catalogo);
    });
    div.querySelector('.quitar').addEventListener('click', () => {
      if (!confirm(`¿Quitar "${catalogo[i].nombre}" del catálogo?`)) return;
      catalogo.splice(i, 1);
      guardar(K.catalogo, catalogo);
      pintarCatalogo();
      pintarItems();
    });
    cont.appendChild(div);
  });
}

$('#btn-agregar-producto').addEventListener('click', () => {
  catalogo.push({ nombre: '', precio: 0 });
  guardar(K.catalogo, catalogo);
  pintarCatalogo();
  const nombres = document.querySelectorAll('#lista-catalogo .nombre');
  nombres[nombres.length - 1].focus();
});

// Al volver a la pestaña Cotizar, los selects deben reflejar el catálogo vigente.
document.querySelector('.tab[data-pantalla="cotizar"]').addEventListener('click', pintarItems);

// ---------------------------------------------------------------- negocio
function pintarNegocio() {
  $('#cfg-negocio').value = config.negocio;
  $('#cfg-nit').value = config.nit || '';
  $('#cfg-telefono').value = config.telefono;
  $('#cfg-correo').value = config.correo;
  $('#cfg-ciudad').value = config.ciudad;
  $('#cfg-iva').value = config.ivaPct;
  $('#cfg-pie').value = config.pie;
  $('#cfg-prefijo').value = config.prefijo;
  $('#cfg-consecutivo').value = config.consecutivo;
  $('#cfg-logo-vista').hidden = !config.logo;
  if (config.logo) $('#cfg-logo-img').src = config.logo;
  $('#titulo-negocio').textContent = config.negocio || 'Cotizador';
}

function enlazarConfig(id, campo, transform) {
  $(id).addEventListener('input', (e) => {
    config[campo] = transform ? transform(e.target.value) : e.target.value;
    guardar(K.config, config);
    if (campo === 'negocio') $('#titulo-negocio').textContent = config.negocio || 'Cotizador';
    if (campo === 'ivaPct') pintarTotales();
  });
}
enlazarConfig('#cfg-negocio', 'negocio');
enlazarConfig('#cfg-nit', 'nit');
enlazarConfig('#cfg-telefono', 'telefono');
enlazarConfig('#cfg-correo', 'correo');
enlazarConfig('#cfg-ciudad', 'ciudad');
enlazarConfig('#cfg-pie', 'pie');
enlazarConfig('#cfg-prefijo', 'prefijo');
enlazarConfig('#cfg-iva', 'ivaPct', (v) => Math.max(0, Number(v) || 0));
enlazarConfig('#cfg-consecutivo', 'consecutivo', (v) => Math.max(1, parseInt(v, 10) || 1));

$('#cfg-logo').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  try {
    config.logo = await redimensionarLogo(archivo);
    guardar(K.config, config);
    pintarNegocio();
    aviso('Logo guardado');
  } catch {
    aviso('No se pudo leer esa imagen');
  }
});

$('#cfg-logo-quitar').addEventListener('click', () => {
  config.logo = '';
  guardar(K.config, config);
  $('#cfg-logo').value = '';
  pintarNegocio();
});

// Reduce el logo a máx. 300 px y lo convierte a PNG (formato que jsPDF acepta siempre).
function redimensionarLogo(archivo) {
  return new Promise((resolver, rechazar) => {
    const img = new Image();
    img.onload = () => {
      const max = 300;
      const escala = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * escala);
      canvas.height = Math.round(img.height * escala);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolver(canvas.toDataURL('image/png'));
    };
    img.onerror = rechazar;
    img.src = URL.createObjectURL(archivo);
  });
}

// ---------------------------------------------------------------- respaldo
function datosParaRespaldo() {
  return {
    version: 1,
    guardado: new Date().toISOString(),
    config,           // el token NUNCA va aquí: vive en su propia clave
    catalogo,
    historial,
  };
}

// btoa solo acepta latin1; convertimos UTF-8 por bloques (el logo puede ser grande).
function aBase64(texto) {
  const bytes = new TextEncoder().encode(texto);
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}
function deBase64(b64) {
  const bin = atob(b64.replace(/\s/g, ''));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

function cabecerasGitHub() {
  return {
    Authorization: 'Bearer ' + localStorage.getItem(K.token),
    Accept: 'application/vnd.github+json',
    'Content-Type': 'application/json',
  };
}

const URL_RESPALDO = `https://api.github.com/repos/${RESPALDO.repo}/contents/${RESPALDO.ruta}`;

async function subirRespaldo() {
  let sha;
  const consulta = await fetch(URL_RESPALDO, { headers: cabecerasGitHub() });
  if (consulta.status === 401) throw new Error('El token no es válido o ya venció');
  if (consulta.ok) sha = (await consulta.json()).sha;

  const respuesta = await fetch(URL_RESPALDO, {
    method: 'PUT',
    headers: cabecerasGitHub(),
    body: JSON.stringify({
      message: 'Respaldo del cotizador — ' + new Date().toLocaleString('es-CO'),
      content: aBase64(JSON.stringify(datosParaRespaldo(), null, 1)),
      ...(sha ? { sha } : {}),
    }),
  });
  if (respuesta.status === 401) throw new Error('El token no es válido o ya venció');
  if (respuesta.status === 403 || respuesta.status === 404) {
    throw new Error('¿Existe el repositorio privado karate-datos y el token tiene acceso de escritura a él?');
  }
  if (!respuesta.ok) throw new Error('GitHub respondió ' + respuesta.status);
  localStorage.setItem(K.ultimoRespaldo, new Date().toISOString());
  pintarEstadoRespaldo();
}

async function bajarRespaldo() {
  const respuesta = await fetch(URL_RESPALDO, { headers: cabecerasGitHub() });
  if (respuesta.status === 401) throw new Error('El token no es válido o ya venció');
  if (respuesta.status === 404) throw new Error('No hay respaldo todavía (o el token no tiene acceso al repositorio karate-datos)');
  if (!respuesta.ok) throw new Error('GitHub respondió ' + respuesta.status);
  const cuerpo = await respuesta.json();
  return JSON.parse(deBase64(cuerpo.content));
}

function aplicarRespaldo(datos) {
  if (!datos || !Array.isArray(datos.catalogo) || !Array.isArray(datos.historial) || typeof datos.config !== 'object') {
    throw new Error('El archivo no parece una copia del cotizador');
  }
  delete datos.config.token; // por si viniera de una copia vieja
  config = Object.assign({ prefijo: 'COT', consecutivo: 1, ivaPct: 0 }, datos.config);
  catalogo = datos.catalogo;
  historial = datos.historial;
  guardar(K.config, config);
  guardar(K.catalogo, catalogo);
  guardar(K.historial, historial);
  pintarNegocio();
  pintarCatalogo();
  pintarHistorial();
  pintarItems();
  pintarTotales();
}

// Tras generar una cotización: respaldo automático en segundo plano (si hay token).
function respaldarAuto() {
  if (!localStorage.getItem(K.token)) return;
  subirRespaldo()
    .then(() => aviso('Respaldo guardado en GitHub ✔'))
    .catch((e) => aviso('⚠️ No se pudo respaldar: ' + e.message));
}

function pintarEstadoRespaldo() {
  const el = $('#estado-respaldo');
  const tiene = !!localStorage.getItem(K.token);
  const ultimo = localStorage.getItem(K.ultimoRespaldo);
  if (!tiene) {
    el.textContent = 'Sin token: el respaldo automático está apagado.';
  } else {
    el.textContent = ultimo
      ? `Último respaldo: ${new Date(ultimo).toLocaleString('es-CO')}`
      : 'Token guardado. Aún no se ha hecho el primer respaldo.';
  }
}

$('#cfg-token').addEventListener('input', (e) => {
  const v = e.target.value.trim();
  if (v) localStorage.setItem(K.token, v);
  else localStorage.removeItem(K.token);
  pintarEstadoRespaldo();
});

$('#btn-respaldar').addEventListener('click', async (e) => {
  if (!localStorage.getItem(K.token)) { aviso('Primero pega el token de GitHub'); return; }
  e.target.disabled = true;
  try {
    await subirRespaldo();
    aviso('Respaldo guardado en GitHub ✔');
  } catch (err) {
    aviso('⚠️ ' + err.message);
  } finally {
    e.target.disabled = false;
  }
});

$('#btn-restaurar').addEventListener('click', async (e) => {
  if (!localStorage.getItem(K.token)) { aviso('Primero pega el token de GitHub'); return; }
  if (!confirm('Esto REEMPLAZA el catálogo, la configuración y el historial de este teléfono con lo guardado en GitHub. ¿Continuar?')) return;
  e.target.disabled = true;
  try {
    aplicarRespaldo(await bajarRespaldo());
    aviso('Datos restaurados desde GitHub ✔');
  } catch (err) {
    aviso('⚠️ ' + err.message);
  } finally {
    e.target.disabled = false;
  }
});

// ---- copia manual en archivo (sin token) ----
$('#btn-exportar').addEventListener('click', async () => {
  const contenido = JSON.stringify(datosParaRespaldo(), null, 1);
  const nombre = 'cotizador-respaldo-' + new Date().toISOString().slice(0, 10) + '.json';
  const archivo = new File([contenido], nombre, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
    try { await navigator.share({ files: [archivo], title: 'Copia del cotizador' }); return; }
    catch (e) { if (e && e.name === 'AbortError') return; }
  }
  const enlace = document.createElement('a');
  enlace.href = URL.createObjectURL(new Blob([contenido], { type: 'application/json' }));
  enlace.download = nombre;
  enlace.click();
  URL.revokeObjectURL(enlace.href);
});

$('#btn-importar').addEventListener('click', () => $('#archivo-importar').click());
$('#archivo-importar').addEventListener('change', async (e) => {
  const archivo = e.target.files[0];
  if (!archivo) return;
  if (!confirm('Esto REEMPLAZA los datos de este teléfono con los del archivo. ¿Continuar?')) { e.target.value = ''; return; }
  try {
    aplicarRespaldo(JSON.parse(await archivo.text()));
    aviso('Copia importada ✔');
  } catch (err) {
    aviso('⚠️ ' + err.message);
  }
  e.target.value = '';
});

// ---------------------------------------------------------------- varios
function escapar(s) {
  return String(s ?? '')
    .replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;').replaceAll("'", '&#39;');
}

if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}

// ---------------------------------------------------------------- arranque
pintarFormulario();
pintarHistorial();
pintarCatalogo();
pintarNegocio();
$('#cfg-token').value = localStorage.getItem(K.token) || '';
pintarEstadoRespaldo();
