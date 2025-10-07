import { OnGatewayConnection, OnGatewayDisconnect, SubscribeMessage, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { MessageService } from './message.service';
import { Socket, Server } from 'socket.io';

@WebSocketGateway({cors: true})
export class MessageGateway implements OnGatewayConnection, OnGatewayDisconnect {

  @WebSocketServer() wss: Server;

  constructor(
    private readonly messageService: MessageService,
  ) {}

  async handleConnection(client: Socket) {}
  
  handleDisconnect(client: Socket) {
  }


  @SubscribeMessage('admin-close-caja')
  async handleCoseRuta( client: Socket, payload: { ruta: string }){
    this.wss.emit('close-caja', { ruta: payload[0].ruta })
  }

  @SubscribeMessage('admin-block-caja')
  async handleBlockRuta( client: Socket, paylaod: { ruta: string }){
    this.wss.emit('block-caja', { ruta: paylaod[0].ruta })
  }

}
