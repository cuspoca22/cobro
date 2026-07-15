/**
 * Diagnóstico y limpieza de datos que bloquean los índices únicos P0:
 *   1) Más de un pago_credito por (crédito, día)  → unique_pago_credito_por_dia
 *   2) Más de un crédito status:true por cliente  → unique_credito_activo_por_cliente
 *
 * Por defecto solo informa (dry-run). No borra ni modifica nada.
 *
 * Uso:
 *   npm run db:diagnostico-duplicados
 *   npm run db:diagnostico-duplicados -- --aplicar
 *   npm run db:diagnostico-duplicados -- --aplicar --crear-indices
 *   npm run db:diagnostico-duplicados -- --salida exports/duplicados.json
 *
 * Nota: NO uses --json (npm lo intercepta como flag propia y no llega al script).
 *
 * Estrategia al aplicar (--aplicar):
 *   Pagos duplicados:
 *     - Agrupa por credito + fecha (start-of-day ya almacenada)
 *     - Conserva el más antiguo (createdAt / _id más viejo)
 *     - Elimina el resto de movimientoCaja
 *   Créditos activos duplicados:
 *     - Agrupa por cliente con status:true
 *     - Conserva el más reciente (fecha_inicio desc, luego _id)
 *     - Marca los demás con status:false (NO hard-delete; preserva historial)
 *
 * IMPORTANTE:
 *   - Ejecuta primero SIN --aplicar y revisa el reporte.
 *   - Idealmente haz backup / snapshot de Mongo antes de --aplicar.
 *   - Tras limpiar, usa --crear-indices para materializar los índices únicos.
 */

import * as dotenv from 'dotenv';
import * as fs from 'fs';
import * as path from 'path';
import mongoose, { Types } from 'mongoose';

dotenv.config({ path: `.env.${process.env.NODE_ENV || 'development'}` });
dotenv.config({ path: '.env' });

mongoose.pluralize(null);

interface CliArgs {
  aplicar: boolean;
  crearIndices: boolean;
  jsonPath?: string;
  help: boolean;
}

interface PagoDuplicadoGrupo {
  creditoId: string;
  fecha: string;
  total: number;
  conservarId: string;
  eliminarIds: string[];
  montos: number[];
}

interface CreditoActivoDuplicadoGrupo {
  clienteId: string;
  total: number;
  conservarId: string;
  desactivarIds: string[];
  creditos: Array<{
    id: string;
    valor_credito: number;
    fecha_inicio: string | null;
    ruta: string | null;
  }>;
}

function parseArgs(): CliArgs {
  const args = process.argv.slice(2);
  const parsed: CliArgs = {
    aplicar: false,
    crearIndices: false,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    const next = args[i + 1];

    if (arg === '--aplicar' || arg === '--apply') {
      parsed.aplicar = true;
    } else if (arg === '--crear-indices' || arg === '--create-indexes') {
      parsed.crearIndices = true;
    } else if (
      (arg === '--salida' || arg === '-o' || arg === '--out' || arg === '--reporte') &&
      next
    ) {
      // IMPORTANTE: no usar --json (npm lo consume como flag global)
      parsed.jsonPath = next;
      i++;
    } else if (arg.startsWith('--salida=') || arg.startsWith('--out=') || arg.startsWith('--reporte=')) {
      parsed.jsonPath = arg.split('=').slice(1).join('=');
    } else if (arg === '--help' || arg === '-h') {
      parsed.help = true;
    } else if (!arg.startsWith('-') && !parsed.jsonPath) {
      // Ruta posicional: npm run ... -- exports/duplicados.json
      // (útil cuando PowerShell/npm tragan flags)
      parsed.jsonPath = arg;
    }
  }

  return parsed;
}

function printHelp() {
  console.log(`
Diagnóstico / limpieza de duplicados que bloquean índices únicos (P0).

Uso:
  npm run db:diagnostico-duplicados
  npm run db:diagnostico-duplicados -- --aplicar
  npm run db:diagnostico-duplicados -- --aplicar --crear-indices
  npm run db:diagnostico-duplicados -- --salida exports/duplicados.json
  npm run db:diagnostico-duplicados -- exports/duplicados.json

Flags:
  (sin flags)           Solo reporta; no modifica la base
  --aplicar             Elimina pagos duplicados y desactiva créditos activos de más
  --crear-indices       Crea los índices únicos (falla si aún hay duplicados)
  --salida, -o <path>   Guarda el reporte en JSON (NO uses --json: npm lo intercepta)
  --help, -h            Esta ayuda
`);
}

async function connectDb() {
  const uri = process.env.MONGO_URL;
  const dbName = process.env.MONGO_DB_NAME;

  if (!uri) {
    throw new Error('Falta MONGO_URL en el entorno (.env.development / .env)');
  }

  await mongoose.connect(uri, { dbName });
  console.log(`Conectado a MongoDB db=${dbName || '(default)'}`);
}

/**
 * Encuentra grupos con más de un pago_credito para el mismo crédito y la misma fecha.
 * La fecha en el schema ya es start-of-day en TZ de la ruta, así que se agrupa por valor exacto.
 */
async function findPagosDuplicados(): Promise<PagoDuplicadoGrupo[]> {
  const col = mongoose.connection.collection('movimientoCaja');

  const pipeline = [
    {
      $match: {
        subTipo: 'pago_credito',
        credito: { $exists: true, $ne: null },
        fecha: { $exists: true, $ne: null },
      },
    },
    {
      $group: {
        _id: { credito: '$credito', fecha: '$fecha' },
        count: { $sum: 1 },
        docs: {
          $push: {
            id: '$_id',
            monto: '$monto',
            createdAt: '$createdAt',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ];

  const groups = await col.aggregate(pipeline).toArray();

  return groups.map((g: any) => {
    const docs = [...g.docs].sort((a, b) => {
      const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      if (ta !== tb) return ta - tb;
      // Fallback estable por ObjectId (más viejo primero)
      return String(a.id).localeCompare(String(b.id));
    });

    const conservar = docs[0];
    const eliminar = docs.slice(1);

    return {
      creditoId: String(g._id.credito),
      fecha: g._id.fecha ? new Date(g._id.fecha).toISOString() : 'null',
      total: g.count,
      conservarId: String(conservar.id),
      eliminarIds: eliminar.map((d: any) => String(d.id)),
      montos: docs.map((d: any) => d.monto),
    };
  });
}

/**
 * Encuentra clientes con más de un crédito activo (status: true).
 */
async function findCreditosActivosDuplicados(): Promise<CreditoActivoDuplicadoGrupo[]> {
  const col = mongoose.connection.collection('creditos');

  const pipeline = [
    { $match: { status: true } },
    {
      $group: {
        _id: '$cliente',
        count: { $sum: 1 },
        docs: {
          $push: {
            id: '$_id',
            valor_credito: '$valor_credito',
            fecha_inicio: '$fecha_inicio',
            ruta: '$ruta',
          },
        },
      },
    },
    { $match: { count: { $gt: 1 } } },
    { $sort: { count: -1 } },
  ];

  const groups = await col.aggregate(pipeline).toArray();

  return groups.map((g: any) => {
    const docs = [...g.docs].sort((a, b) => {
      const ta = a.fecha_inicio ? new Date(a.fecha_inicio).getTime() : 0;
      const tb = b.fecha_inicio ? new Date(b.fecha_inicio).getTime() : 0;
      // Más reciente primero → ese se conserva
      if (ta !== tb) return tb - ta;
      return String(b.id).localeCompare(String(a.id));
    });

    const conservar = docs[0];
    const desactivar = docs.slice(1);

    return {
      clienteId: String(g._id),
      total: g.count,
      conservarId: String(conservar.id),
      desactivarIds: desactivar.map((d: any) => String(d.id)),
      creditos: docs.map((d: any) => ({
        id: String(d.id),
        valor_credito: d.valor_credito,
        fecha_inicio: d.fecha_inicio ? new Date(d.fecha_inicio).toISOString() : null,
        ruta: d.ruta ? String(d.ruta) : null,
      })),
    };
  });
}

async function aplicarLimpiezaPagos(grupos: PagoDuplicadoGrupo[]) {
  const col = mongoose.connection.collection('movimientoCaja');
  let eliminados = 0;

  for (const g of grupos) {
    if (g.eliminarIds.length === 0) continue;
    const ids = g.eliminarIds.map((id) => new Types.ObjectId(id));
    const result = await col.deleteMany({ _id: { $in: ids } });
    eliminados += result.deletedCount ?? 0;
    console.log(
      `  pago credito=${g.creditoId} fecha=${g.fecha}: eliminados ${result.deletedCount}, conservado ${g.conservarId}`,
    );
  }

  return eliminados;
}

async function aplicarLimpiezaCreditos(grupos: CreditoActivoDuplicadoGrupo[]) {
  const col = mongoose.connection.collection('creditos');
  let desactivados = 0;

  for (const g of grupos) {
    if (g.desactivarIds.length === 0) continue;
    const ids = g.desactivarIds.map((id) => new Types.ObjectId(id));
    const result = await col.updateMany(
      { _id: { $in: ids } },
      { $set: { status: false } },
    );
    desactivados += result.modifiedCount ?? 0;
    console.log(
      `  cliente=${g.clienteId}: desactivados ${result.modifiedCount}, conservado activo ${g.conservarId}`,
    );
  }

  return desactivados;
}

/**
 * Crea los mismos índices únicos definidos en los schemas Mongoose P0.
 * Falla con duplicate key si aún quedan conflictivos.
 */
async function crearIndicesUnicos() {
  const movimientos = mongoose.connection.collection('movimientoCaja');
  const creditos = mongoose.connection.collection('creditos');

  console.log('\nCreando índice unique_pago_credito_por_dia…');
  await movimientos.createIndex(
    { credito: 1, subTipo: 1, fecha: 1 },
    {
      unique: true,
      partialFilterExpression: {
        subTipo: 'pago_credito',
        credito: { $type: 'objectId' },
      },
      name: 'unique_pago_credito_por_dia',
    },
  );
  console.log('  OK unique_pago_credito_por_dia');

  console.log('Creando índice unique_credito_activo_por_cliente…');
  // Si existe el índice compuesto viejo no-único {cliente:1,status:1}, no lo borramos:
  // el nuevo partial unique es suficiente para la invariante.
  await creditos.createIndex(
    { cliente: 1 },
    {
      unique: true,
      partialFilterExpression: { status: true },
      name: 'unique_credito_activo_por_cliente',
    },
  );
  console.log('  OK unique_credito_activo_por_cliente');
}

function printReporte(
  pagos: PagoDuplicadoGrupo[],
  activos: CreditoActivoDuplicadoGrupo[],
) {
  console.log('\n========== REPORTE DE DUPLICADOS ==========');
  console.log(`Pagos duplicados (crédito+día): ${pagos.length} grupos`);
  console.log(
    `  → documentos a eliminar: ${pagos.reduce((n, g) => n + g.eliminarIds.length, 0)}`,
  );
  console.log(`Créditos activos duplicados por cliente: ${activos.length} clientes`);
  console.log(
    `  → créditos a desactivar: ${activos.reduce((n, g) => n + g.desactivarIds.length, 0)}`,
  );

  if (pagos.length > 0) {
    console.log('\n--- Primeros grupos de pagos (máx 10) ---');
    for (const g of pagos.slice(0, 10)) {
      console.log(
        `  credito=${g.creditoId} fecha=${g.fecha} total=${g.total} montos=[${g.montos.join(', ')}] ` +
          `conservar=${g.conservarId} eliminar=${g.eliminarIds.join(',')}`,
      );
    }
    if (pagos.length > 10) console.log(`  … y ${pagos.length - 10} grupos más`);
  }

  if (activos.length > 0) {
    console.log('\n--- Primeros clientes con multi-activo (máx 10) ---');
    for (const g of activos.slice(0, 10)) {
      console.log(
        `  cliente=${g.clienteId} activos=${g.total} conservar=${g.conservarId} ` +
          `desactivar=${g.desactivarIds.join(',')}`,
      );
    }
    if (activos.length > 10) console.log(`  … y ${activos.length - 10} clientes más`);
  }

  if (pagos.length === 0 && activos.length === 0) {
    console.log('\nSin duplicados. Seguro crear índices únicos.');
  }
}

async function main() {
  const args = parseArgs();
  if (args.help) {
    printHelp();
    return;
  }

  await connectDb();

  try {
    console.log('\nAnalizando pagos duplicados…');
    const pagos = await findPagosDuplicados();

    console.log('Analizando créditos activos duplicados…');
    const activos = await findCreditosActivosDuplicados();

    printReporte(pagos, activos);

    if (args.jsonPath) {
      const outPath = path.resolve(args.jsonPath);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(
        outPath,
        JSON.stringify(
          {
            generadoEn: new Date().toISOString(),
            modo: args.aplicar ? 'aplicar' : 'dry-run',
            pagosDuplicados: pagos,
            creditosActivosDuplicados: activos,
          },
          null,
          2,
        ),
        'utf8',
      );
      console.log(`\nReporte JSON guardado en: ${outPath}`);
    } else {
      console.log(
        '\nTip: para guardar archivo usa:\n' +
          '  npm run db:diagnostico-duplicados -- --salida exports/duplicados.json\n' +
          '  (no uses --json: npm lo intercepta y el archivo no se crea)',
      );
    }

    if (!args.aplicar) {
      console.log('\nDry-run terminado. Revisa el reporte.');
      console.log('Para aplicar la limpieza: npm run db:diagnostico-duplicados -- --aplicar');
      return;
    }

    console.log('\n=== APLICANDO LIMPIEZA ===');
    const eliminados = await aplicarLimpiezaPagos(pagos);
    const desactivados = await aplicarLimpiezaCreditos(activos);
    console.log(`\nResumen: ${eliminados} pagos eliminados, ${desactivados} créditos desactivados.`);

    // Re-verificar
    const pagosPost = await findPagosDuplicados();
    const activosPost = await findCreditosActivosDuplicados();
    console.log('\n=== POST-LIMPIEZA ===');
    printReporte(pagosPost, activosPost);

    if (args.crearIndices) {
      if (pagosPost.length > 0 || activosPost.length > 0) {
        throw new Error(
          'Aún hay duplicados; no se crean índices. Revisa el reporte post-limpieza.',
        );
      }
      await crearIndicesUnicos();
    } else {
      console.log(
        '\nÍndices NO creados. Cuando el reporte esté limpio:\n' +
          '  npm run db:diagnostico-duplicados -- --crear-indices',
      );
    }
  } finally {
    await mongoose.disconnect();
    console.log('\nDesconectado.');
  }
}

main().catch((err) => {
  console.error('\nError:', err?.message || err);
  process.exit(1);
});
