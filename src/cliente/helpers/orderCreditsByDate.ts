import { Credito } from "src/credito/schemas/credito.schema"

export const orderCreditsByDate = (creditos: Credito[]) => {




}

export const addDate = (fecha: string): Date => {

   let fechaRecortada = fecha.split('/');

   let dia = parseInt(fechaRecortada[0], 10);

   let mes = parseInt(fechaRecortada[1], 10) - 1;

   let año = parseInt(fechaRecortada[2], 10);

   return new Date(año, mes, dia);

}