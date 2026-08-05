# 🥋 Cotizador de uniformes de karate

Aplicación web para el celular que genera **cotizaciones en PDF** y las comparte directo por **WhatsApp o correo**. No necesita servidor ni base de datos: todo se guarda en el teléfono y funciona incluso **sin internet** una vez instalada.

## Qué hace

- **Cotizar en segundos**: eliges productos del catálogo (con talla y cantidad), el precio se llena solo y el total se calcula al instante.
- **PDF profesional**: encabezado con tu logo y datos del negocio, número consecutivo (COT-0001, COT-0002…), tabla de productos, descuento, IVA opcional, notas y condiciones.
- **Compartir con un toque**: el botón "Generar y compartir PDF" abre el menú de compartir de Android/iPhone — eliges WhatsApp, Gmail o la app que quieras. También puedes enviar solo un resumen de texto por WhatsApp.
- **Historial**: cada cotización queda guardada; puedes reabrirla, volver a enviar el PDF, duplicarla para otro cliente o eliminarla.
- **Catálogo editable**: cambia nombres y precios cuando quieras; viene precargado con karateguis, cinturones y bordados.
- **Configurable**: nombre del negocio, teléfono, correo, logo, % de IVA, condiciones de pago y numeración.

## Cómo usarla desde el celular

1. Abre la app en el navegador (la URL de GitHub Pages, ver abajo).
2. Ve a la pestaña **⚙️ Negocio** y completa tus datos (salen en el PDF).
3. Revisa precios en **🥋 Catálogo**.
4. En **🧾 Cotizar**: nombre del cliente, productos, y toca **Generar y compartir PDF**.
5. Opcional: en el menú del navegador toca **"Agregar a pantalla de inicio"** para instalarla como app y usarla sin internet.

> 📌 Los datos viven en el navegador del teléfono (localStorage). Para no perderlos, la app puede **respaldarlos en este mismo repositorio** (`datos/respaldo.json`, rama `datos`): en ⚙️ Negocio → "Respaldo en GitHub" pega un token *fine-grained* con permiso de Contents (Read and write) solo sobre este repo. Con el token puesto, cada cotización generada se respalda sola, y el botón "Restaurar" recupera todo en un teléfono nuevo. También hay exportar/importar a archivo, sin token.
>
> ⚠️ El repositorio es público: el respaldo (incluidos nombres y teléfonos de clientes) queda visible para cualquiera.

## Publicación (GitHub Pages)

Cada push a `main` se copia automáticamente a la rama `gh-pages` (workflow incluido), que GitHub Pages sirve en `https://saldacris93.github.io/Karate/`. No hay que configurar nada.

## Desarrollo local

Es HTML/CSS/JS puro, sin dependencias que instalar:

```bash
npx serve .        # o: python3 -m http.server 8000
```

Nota: el menú nativo de compartir (Web Share API) solo funciona con HTTPS (por eso en local el botón descarga el PDF en su lugar). En GitHub Pages funciona completo.

## Estructura

```
index.html            Pantallas: Cotizar, Historial, Catálogo, Negocio
app.js                Lógica, almacenamiento local y generación del PDF
styles.css            Estilos (móvil primero)
vendor/               jsPDF + autotable (copias locales, funciona offline)
sw.js                 Service Worker (uso sin internet)
manifest.webmanifest  Instalable como app (PWA)
icons/                Íconos de la app
```
