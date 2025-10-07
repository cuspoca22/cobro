import { ClientSession } from "mongoose";

export interface OpenRutaOptions {
  rutaId: string;
  fecha: Date;
  base?: number;
  session?: ClientSession;
}