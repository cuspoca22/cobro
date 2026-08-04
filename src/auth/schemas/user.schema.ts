import { Prop, Schema, SchemaFactory } from "@nestjs/mongoose";
import mongoose, { Document, Types } from "mongoose";
import { Ruta } from "src/ruta/schema/ruta.schema";
import { ValidRoles } from "../interfaces";

@Schema({
   versionKey: false,
   collection: 'users'
})
export class User extends Document {

   @Prop({
      type: String,
      index: true,
      required: true,
      uppercase: true,
      trim: true
   })
   nombre: string;

   @Prop({
      type: Boolean,
      required: true,
      default: true
   })
   estado: boolean;

   @Prop({
      type: String,
      index: true,
      required: true,
      unique: true,
      uppercase: true,
      trim: true
   })
   username: string;

   @Prop({
      type: String,
      required: true,
   })
   password: string;

   @Prop({
      type: String,
      enum: ValidRoles,
      default: ValidRoles.cobrador
   })
   rol: string;

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: "Ruta"
   })
   ruta: Ruta;

   /** Rutas asignadas a SUPERVISOR (multi-ruta). */
   @Prop({
      type: [{ type: mongoose.Schema.Types.ObjectId, ref: "Ruta" }],
      default: [],
   })
   rutas: Types.ObjectId[] | Ruta[];

   @Prop({
      type: mongoose.Schema.Types.ObjectId,
      ref: "Empresa"
   })
   empresa: Types.ObjectId;

   @Prop({
      type: Boolean,
      default: false
   })
   puedeActualizarUbicacion: boolean;

   /** Id de la única sesión activa (JWT claim `sid`). */
   @Prop({
      type: String,
      default: null,
   })
   activeSessionId: string | null;

   /** Expiración de la sesión activa (alineada al JWT ~12h). */
   @Prop({
      type: Date,
      default: null,
   })
   activeSessionExpiresAt: Date | null;

}

export const UserSchema = SchemaFactory.createForClass(User);

// crea los indices para un funcionamiento mas optimizado
UserSchema.index({ ruta: 1 });
UserSchema.index({ rutas: 1 });
UserSchema.index({ empresa: 1 });