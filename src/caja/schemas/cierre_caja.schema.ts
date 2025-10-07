import { Schema, SchemaFactory, Prop } from '@nestjs/mongoose';
import mongoose from 'mongoose';
import { User } from '../../auth/entities/user.entity';
import { Caja } from './caja.schema';
import { Ruta } from '../../ruta/schema/ruta.schema';

@Schema()
export class CierreCaja {

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    })
    user: User;

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Caja',
        required: true
    })
    caja: Caja;

    @Prop({
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Ruta',
        required: true
    })
    ruta: Ruta;

    @Prop({
        type: Number,
        required: true
    })
    saldo: number;

    @Prop({
        type: String,
        required: true
    })
    date: string;

}

export const CierreCajaSchema = SchemaFactory.createForClass(CierreCaja);
