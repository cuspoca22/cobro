/**
 * Genera un Excel con los mejores clientes de una ruta.
 *
 * Uso:
 *   npm run reporte:mejores-clientes -- --ruta "LIBERTAD"
 *   npm run reporte:mejores-clientes -- --ruta 6561477a515113377dddc184 --limite 25
 *   npm run reporte:mejores-clientes -- --ruta LIBERTAD --salida exports/mi-reporte.xlsx
 *
 * Criterios de ranking:
 *   - Créditos saldados (historial de cumplimiento)
 *   - Monto promedio prestado (volumen habitual)
 *   - Total pagado histórico
 *   - Clasificación actual (BUENO > REGULAR > MALO)
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Types } from 'mongoose';
import ExcelJS = require('exceljs');

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config({ path: '.env' });

mongoose.pluralize(null);

interface CliArgs {
  ruta: string;
  limite: number;
  salida?: string;
}

interface ClienteRanking {
  clienteId: string;
  nombre: string;
  alias: string;
  telefono: string;
  direccion: string;
  ciudad: string;
  direccionCompleta: string;
  latitud: number | null;
  longitud: number | null;
  enlaceGoogleMaps: string;
  montoPromedio: number;
  montoActual: number | null;
  interesPromedio: number;
  interesActual: number | null;
  totalCreditos: number;
  creditosSaldados: number;
  totalPagado: number;
  clasificacion: string;
  puntaje: number;
  activo: boolean;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: Partial<CliArgs> = { limite: 50 };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if ((arg === '--ruta' || arg === '-r') && next) {
      parsed.ruta = next;
      i++;
    } else if ((arg === '--limite' || arg === '-l') && next) {
      parsed.limite = Number(next);
      i++;
    } else if ((arg === '--salida' || arg === '-o') && next) {
      parsed.salida = next;
      i++;
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
Uso: npm run reporte:mejores-clientes -- --ruta <nombre o id> [opciones]

Opciones:
  --ruta, -r     Nombre o ObjectId de la ruta (requerido)
  --limite, -l   Cantidad de clientes a incluir (default: 50)
  --salida, -o   Ruta del archivo .xlsx de salida
  --help, -h     Muestra esta ayuda
`);
      process.exit(0);
    }
  }

  if (!parsed.ruta?.trim()) {
    console.error('Error: debes indicar una ruta con --ruta "NOMBRE" o --ruta <ObjectId>');
    process.exit(1);
  }

  if (!Number.isFinite(parsed.limite) || parsed.limite < 1) {
    console.error('Error: --limite debe ser un número mayor a 0');
    process.exit(1);
  }

  return parsed as CliArgs;
}

interface RutaDoc {
  _id: Types.ObjectId;
  nombre: string;
  ciudad?: string;
  currency?: string;
}

async function buscarRuta(rutaParam: string): Promise<RutaDoc> {
  const rutas = mongoose.connection.collection('rutas');

  if (Types.ObjectId.isValid(rutaParam)) {
    const porId = (await rutas.findOne({ _id: new Types.ObjectId(rutaParam) })) as RutaDoc | null;
    if (porId) return porId;
  }

  const porNombre = (await rutas.findOne({
    nombre: { $regex: new RegExp(`^${escapeRegex(rutaParam.trim())}$`, 'i') },
  })) as RutaDoc | null;

  if (!porNombre) {
    const sugerencias = await rutas
      .find({ nombre: { $regex: escapeRegex(rutaParam.trim()), $options: 'i' } })
      .project({ nombre: 1 })
      .limit(10)
      .toArray();

    const lista = sugerencias.map((r) => `  - ${r.nombre} (${r._id})`).join('\n');
    throw new Error(
      `No se encontró la ruta "${rutaParam}".` +
        (lista ? `\nRutas similares:\n${lista}` : ''),
    );
  }

  return porNombre;
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizarUbicacion(ubication?: number[] | null): { lat: number; lng: number } | null {
  if (!ubication || ubication.length < 2) return null;

  const [primero, segundo] = ubication;
  if (primero == null || segundo == null || (primero === 0 && segundo === 0)) return null;

  const esCoordenadaValida = (lat: number, lng: number) =>
    lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

  // En Guatemala: lat ~13-18, lng ~-92 a -88. Detecta si vienen invertidos [lng, lat].
  const pareceLat = (v: number) => Math.abs(v) <= 90;
  const pareceLngGt = (v: number) => v < -50 || v > 50;

  let lat = primero;
  let lng = segundo;

  if (pareceLngGt(primero) && pareceLat(segundo)) {
    lat = segundo;
    lng = primero;
  }

  if (!esCoordenadaValida(lat, lng)) return null;

  return { lat, lng };
}

function generarEnlaceGoogleMaps(
  coords: { lat: number; lng: number } | null,
  direccionCompleta: string,
): string {
  if (coords) {
    return `https://www.google.com/maps/search/?api=1&query=${coords.lat},${coords.lng}`;
  }

  if (direccionCompleta?.trim()) {
    return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(direccionCompleta.trim())}`;
  }

  return '';
}

async function obtenerMejoresClientes(
  rutaId: Types.ObjectId,
  limite: number,
): Promise<ClienteRanking[]> {
  const pipeline: mongoose.PipelineStage[] = [
    { $match: { ruta: rutaId } },
    { $sort: { fecha_inicio: -1 } },
    {
      $group: {
        _id: '$cliente',
        totalCreditos: { $sum: 1 },
        creditosSaldados: {
          $sum: { $cond: [{ $eq: ['$status', false] }, 1, 0] },
        },
        montoPromedio: { $avg: '$valor_credito' },
        interesPromedio: { $avg: '$interes' },
        creditos: {
          $push: {
            status: '$status',
            valor_credito: '$valor_credito',
            interes: '$interes',
            state: '$state',
            fecha_inicio: '$fecha_inicio',
          },
        },
      },
    },
    {
      $addFields: {
        creditoActivo: {
          $arrayElemAt: [
            {
              $filter: {
                input: '$creditos',
                as: 'c',
                cond: { $eq: ['$$c.status', true] },
              },
            },
            0,
          ],
        },
        ultimoCredito: { $arrayElemAt: ['$creditos', 0] },
      },
    },
    {
      $lookup: {
        from: 'movimientoCaja',
        let: { clienteId: '$_id' },
        pipeline: [
          {
            $match: {
              $expr: { $eq: ['$cliente', '$$clienteId'] },
              subTipo: 'pago_credito',
              tipoMovimiento: 'ingreso',
            },
          },
          { $group: { _id: null, total: { $sum: '$monto' } } },
        ],
        as: 'pagos',
      },
    },
    {
      $lookup: {
        from: 'clientes',
        localField: '_id',
        foreignField: '_id',
        as: 'cliente',
      },
    },
    { $unwind: '$cliente' },
    {
      $addFields: {
        totalPagado: { $ifNull: [{ $arrayElemAt: ['$pagos.total', 0] }, 0] },
        montoActual: {
          $ifNull: ['$creditoActivo.valor_credito', '$ultimoCredito.valor_credito'],
        },
        interesActual: {
          $ifNull: ['$creditoActivo.interes', '$ultimoCredito.interes'],
        },
        clasificacion: {
          $ifNull: ['$creditoActivo.state', 'SIN CREDITO ACTIVO'],
        },
        activo: { $ne: ['$creditoActivo', null] },
        puntajeClasificacion: {
          $switch: {
            branches: [
              { case: { $eq: ['$creditoActivo.state', 'BUENO'] }, then: 30 },
              { case: { $eq: ['$creditoActivo.state', 'REGULAR'] }, then: 15 },
              { case: { $eq: ['$creditoActivo.state', 'MALO'] }, then: 0 },
            ],
            default: 5,
          },
        },
      },
    },
    {
      $addFields: {
        puntaje: {
          $add: [
            { $multiply: ['$creditosSaldados', 15] },
            { $multiply: ['$montoPromedio', 0.05] },
            { $multiply: ['$totalPagado', 0.01] },
            '$puntajeClasificacion',
          ],
        },
      },
    },
    { $sort: { puntaje: -1, totalPagado: -1, montoPromedio: -1 } },
    { $limit: limite },
    {
      $project: {
        clienteId: { $toString: '$_id' },
        nombre: '$cliente.nombre',
        alias: '$cliente.alias',
        telefono: '$cliente.telefono',
        direccion: '$cliente.direccion',
        ciudad: '$cliente.ciudad',
        ubication: '$cliente.ubication',
        montoPromedio: { $round: ['$montoPromedio', 2] },
        montoActual: 1,
        interesPromedio: { $round: ['$interesPromedio', 2] },
        interesActual: 1,
        totalCreditos: 1,
        creditosSaldados: 1,
        totalPagado: 1,
        clasificacion: 1,
        puntaje: { $round: ['$puntaje', 2] },
        activo: 1,
      },
    },
  ];

  const resultados = await mongoose.connection
    .collection('creditos')
    .aggregate(pipeline)
    .toArray();

  return resultados.map((doc) => {
    const direccionCompleta = [doc.direccion, doc.ciudad].filter(Boolean).join(' - ');
    const coords = normalizarUbicacion(doc.ubication as number[] | null);

    return {
      ...doc,
      direccionCompleta,
      latitud: coords?.lat ?? null,
      longitud: coords?.lng ?? null,
      enlaceGoogleMaps: generarEnlaceGoogleMaps(coords, direccionCompleta),
    };
  }) as ClienteRanking[];
}

function formatearMoneda(valor: number | null | undefined): string {
  if (valor == null) return 'N/A';
  return valor.toLocaleString('es-GT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function formatearPorcentaje(valor: number | null | undefined): string {
  if (valor == null) return 'N/A';
  return `${valor}%`;
}

async function generarExcel(
  ruta: RutaDoc,
  clientes: ClienteRanking[],
  salida: string,
): Promise<string> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'api-cobrador';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Mejores clientes', {
    views: [{ state: 'frozen', ySplit: 3 }],
  });

  sheet.mergeCells('A1:S1');
  sheet.getCell('A1').value = `Mejores clientes - Ruta: ${ruta.nombre}`;
  sheet.getCell('A1').font = { bold: true, size: 14 };

  sheet.mergeCells('A2:S2');
  sheet.getCell('A2').value = `Generado: ${new Date().toLocaleString('es-GT')} | Total: ${clientes.length} clientes`;
  sheet.getCell('A2').font = { italic: true, color: { argb: 'FF666666' } };

  const headers = [
    '#',
    'Nombre',
    'Alias',
    'Teléfono',
    'Dirección',
    'Ciudad',
    'Dirección completa',
    'Latitud',
    'Longitud',
    'Google Maps',
    'Monto habitual (prom.)',
    'Monto actual/último',
    'Interés habitual (%)',
    'Interés actual (%)',
    'Créditos saldados',
    'Total pagado',
    'Clasificación',
    'Activo',
    'Puntaje',
  ];

  const headerRow = sheet.addRow(headers);
  headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
  headerRow.fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FF1F4E79' },
  };
  headerRow.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };

  clientes.forEach((cliente, index) => {
    const row = sheet.addRow([
      index + 1,
      cliente.nombre,
      cliente.alias,
      cliente.telefono,
      cliente.direccion,
      cliente.ciudad,
      cliente.direccionCompleta,
      cliente.latitud ?? 'Sin GPS',
      cliente.longitud ?? 'Sin GPS',
      cliente.enlaceGoogleMaps ? 'Ver en Maps' : 'Sin ubicación',
      cliente.montoPromedio,
      cliente.montoActual ?? 'N/A',
      cliente.interesPromedio,
      cliente.interesActual ?? 'N/A',
      cliente.creditosSaldados,
      cliente.totalPagado,
      cliente.clasificacion,
      cliente.activo ? 'Sí' : 'No',
      cliente.puntaje,
    ]);

    if (cliente.enlaceGoogleMaps) {
      const linkCell = row.getCell(10);
      linkCell.value = {
        text: 'Ver en Maps',
        hyperlink: cliente.enlaceGoogleMaps,
      };
      linkCell.font = { color: { argb: 'FF0563C1' }, underline: true };
    }
  });

  sheet.columns = [
    { width: 5 },
    { width: 28 },
    { width: 20 },
    { width: 14 },
    { width: 42 },
    { width: 18 },
    { width: 50 },
    { width: 12 },
    { width: 12 },
    { width: 16 },
    { width: 18 },
    { width: 18 },
    { width: 16 },
    { width: 16 },
    { width: 16 },
    { width: 14 },
    { width: 16 },
    { width: 10 },
    { width: 10 },
  ];

  ['K', 'L', 'P'].forEach((col) => {
    sheet.getColumn(col).numFmt = '#,##0.00';
  });

  sheet.autoFilter = {
    from: { row: 3, column: 1 },
    to: { row: 3 + clientes.length, column: headers.length },
  };

  const resumen = workbook.addWorksheet('Resumen');
  resumen.addRow(['Ruta', ruta.nombre]);
  resumen.addRow(['Ciudad', ruta.ciudad ?? 'N/A']);
  resumen.addRow(['Moneda', ruta.currency ?? 'N/A']);
  resumen.addRow(['Clientes exportados', clientes.length]);
  resumen.addRow(['Fecha de generación', new Date().toLocaleString('es-GT')]);
  resumen.addRow([]);
  resumen.addRow(['Criterios de ranking']);
  resumen.addRow(['- Créditos saldados (cumplimiento histórico)']);
  resumen.addRow(['- Monto promedio prestado (volumen habitual)']);
  resumen.addRow(['- Total pagado histórico']);
  resumen.addRow(['- Clasificación de pago actual (BUENO / REGULAR / MALO)']);
  resumen.getColumn(1).width = 28;
  resumen.getColumn(2).width = 40;

  const dir = path.dirname(salida);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  await workbook.xlsx.writeFile(salida);
  return path.resolve(salida);
}

function construirMongoUrl(): string {
  const baseUrl = process.env.MONGO_URL?.trim();
  if (!baseUrl) return '';

  const user = process.env.MONGO_USER?.trim();
  const password = process.env.MONGO_PASSWORD?.trim();

  if (!user || !password) return baseUrl;
  if (baseUrl.includes('@')) return baseUrl;

  const host = baseUrl.replace(/^mongodb(\+srv)?:\/\//, '');
  const authSource = process.env.MONGO_AUTH_SOURCE?.trim() || 'admin';

  return `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/?authSource=${encodeURIComponent(authSource)}`;
}

async function main() {
  const { ruta: rutaParam, limite, salida } = parseArgs();

  if (!process.env.MONGO_URL || !process.env.MONGO_DB_NAME) {
    console.error('Error: configura MONGO_URL y MONGO_DB_NAME en .env o .env.development');
    process.exit(1);
  }

  const mongoUrl = construirMongoUrl();
  await mongoose.connect(mongoUrl, {
    dbName: process.env.MONGO_DB_NAME,
  });

  try {
    const ruta = await buscarRuta(rutaParam);
    console.log(`Ruta encontrada: ${ruta.nombre} (${ruta._id})`);

    const clientes = await obtenerMejoresClientes(ruta._id as Types.ObjectId, limite);

    if (clientes.length === 0) {
      console.warn('No se encontraron clientes con créditos en esta ruta.');
      return;
    }

    const fecha = new Date().toISOString().slice(0, 10);
    const nombreArchivo =
      salida ??
      path.join('exports', `mejores-clientes_${String(ruta.nombre).replace(/\s+/g, '_')}_${fecha}.xlsx`);

    const archivo = await generarExcel(ruta, clientes, nombreArchivo);

    console.log(`\nExcel generado: ${archivo}`);
    console.log(`Clientes incluidos: ${clientes.length}`);
    console.log('\nTop 5:');
    clientes.slice(0, 5).forEach((c, i) => {
      console.log(
        `  ${i + 1}. ${c.nombre} | Monto prom: ${formatearMoneda(c.montoPromedio)} | Interés: ${formatearPorcentaje(c.interesActual ?? c.interesPromedio)} | ${c.direccionCompleta}`,
      );
    });
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error('Error:', error.message ?? error);
  process.exit(1);
});
