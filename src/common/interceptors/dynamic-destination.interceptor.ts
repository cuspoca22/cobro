// dynamic-destination.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { Request } from 'express';

@Injectable()
export class DynamicDestinationInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest<Request>();
    const collection = request.params.collection; // Captura el parámetro :collection del endpoint

    request['collection'] = collection; // Almacena el valor en la solicitud para que esté disponible en el controlador

    return next.handle();
  }
}
