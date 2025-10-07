import { Injectable } from '@nestjs/common';
import * as moment from 'moment-timezone';

export type FormatDate = 'DD/MM/YYYY'|'YYYY/MM/DD'|'YYYY, MM, DD'|'YYYY-MM-DD'|'YYYY/MM/DD HH:mm a'

@Injectable()
export class MomentService {
   constructor() {
      moment.tz.setDefault('America/El_salvador');
   }

   now(): string{
      return moment().utc(true).toISOString();
   }

   nowWithFormat(format: FormatDate){
      return moment(this.now()).format(format);
   }

   fecha(date: string, format: FormatDate) {
      return moment(date).format(format);
   }

   fechaIsoString(date: string){
      return moment(date).utc().toISOString();
   }

   date(): Date {
      return new Date(moment().utc(true).toISOString());      
   }
}
