import { Module, forwardRef } from '@nestjs/common';
import { MessageService } from './message.service';
import { MessageGateway } from './message.gateway';
import { RutaModule } from 'src/ruta/ruta.module';

@Module({
  imports: [forwardRef(() => RutaModule)],
  providers: [MessageGateway, MessageService],
  exports: [MessageService, MessageGateway],
})
export class MessageModule {}
