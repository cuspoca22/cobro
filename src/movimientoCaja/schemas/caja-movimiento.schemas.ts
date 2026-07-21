import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import mongoose, { Types } from 'mongoose';

import { SubTipo } from '../interfaces/sub-tipo.enum';
import { TipoMovimiento } from '../interfaces/tipo-movimiento.enum';
import { CategoriaGasto } from '../interfaces/categoria-gasto.enum';

@Schema({
    versionKey: false,
    timestamps: true,
    collection: 'movimientoCaja'
})
export class MovimientoCaja {
    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Caja',
        required: true,
        index: true // Para consultas rápidas por caja
    })
    caja: Types.ObjectId; // La caja continua a la que pertenece este movimiento

    @Prop({
        type: Number,
        required: true
    })
    monto: number; // El monto de la transacción

    @Prop({
        type: String,
        required: true,
        enum: TipoMovimiento, // Clasificación general
        index: true // Útil para filtros rápidos de ingresos/egresos
    })
    tipoMovimiento: string;

    @Prop({
        type: String,
        required: true,
        trim: true,
        index: true, // Para filtrar por tipos específicos
        enum: SubTipo,
    })
    subTipo: string; // Clasificación más específica del movimiento

    @Prop({
        type: String,
        trim: true
    })
    concepto: string; // Para gastos, inversiones, retiros, etc. (Ej: 'gasolina', 'comida', 'arriendo')

    @Prop({
        type: String,
        trim: true
    })
    comentario: string; // Comentario adicional para cualquier movimiento

    // --- Campos Condicionales/Opcionales basados en subTipo ---

    // Referencias para PAGOS y PRESTAMOS
    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Cliente',
        // 'required: true' condicionalmente, si subTipo es 'pago_credito' o 'prestamo_otorgado'
        // Esto se manejaría en la lógica de validación de tu servicio/controlador
    })
    cliente?: Types.ObjectId; // Cliente asociado al pago o préstamo

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Credito',
    })
    credito?: Types.ObjectId; // Crédito específico asociado al pago o préstamo

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ruta',
    })
    ruta?: Types.ObjectId;

    // Campos específicos para 'pago_credito'
    @Prop({
        type: Number,
        // Opcional, solo para pagos: Indica qué número de cuota se está pagando
    })
    numeroCuota?: number;

    /** Porción del monto aplicada al abono del crédito (desglose mora). */
    @Prop({
        type: Number,
        min: 0,
    })
    montoAbono?: number;

    /** Porción del monto aplicada a mora (desglose; 1 pago/día). */
    @Prop({
        type: Number,
        min: 0,
        default: 0,
    })
    montoMora?: number;

    // Campos específicos para 'gasto'
    @Prop({
        type: String,
        trim: true,
        enum: CategoriaGasto,
    })
    categoriaGasto?: string;

    @Prop({
        type: Date,
        required: true
    })
    fecha: Date;

    // Campos para el registro de la "instantánea" diaria (si es necesario, aunque generalmente esto va en CajaInstantaneaDiaria)
    // Se podría considerar un campo para la fecha de la transacción si `createdAt` no es suficiente,
    // pero `createdAt` de `timestamps: true` ya te da la fecha y hora exacta.
}

export const MovimientoCajaSchema = SchemaFactory.createForClass(MovimientoCaja);

// Puedes añadir índices compuestos si ves patrones de búsqueda comunes, por ejemplo:
MovimientoCajaSchema.index({ caja: 1, createdAt: 1 }); // Para obtener movimientos de una caja en un rango de fechas
MovimientoCajaSchema.index({ caja: 1, tipoMovimiento: 1, subTipo: 1 }); // Para filtrar rápidamente por tipo y subtipo
MovimientoCajaSchema.index({ credito: 1, tipoMovimiento: 1, subTipo: 1, createdAt: -1 })
MovimientoCajaSchema.index({ subTipo: 1, fecha: 1, ruta: 1 });

// FIX [P0 doble-pago]: índice único parcial — un solo pago_credito por crédito y día calendario
// (fecha ya se normaliza a start-of-day en timeZone de la ruta). Evita race conditions
// donde dos requests concurrentes pasan el findOne y ambos insertan.
MovimientoCajaSchema.index(
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