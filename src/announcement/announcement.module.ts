import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
import { EmpresaModule } from 'src/empresa/empresa.module';
import { MessageModule } from 'src/message/message.module';
import { EventsModule } from 'src/common/events/events.module';
import { AnnouncementController } from './announcement.controller';
import { AnnouncementService } from './announcement.service';
import { AnnouncementSubscriptionListener } from './announcement-subscription.listener';
import {
  Announcement,
  AnnouncementSchema,
} from './schemas/announcement.schema';
import {
  AnnouncementReceipt,
  AnnouncementReceiptSchema,
} from './schemas/announcement-receipt.schema';

/**
 * V4b: solo registra Announcement/AnnouncementReceipt.
 * Audiencia vía AuthService; nombres de empresa vía EmpresaService.
 * EmpresaModule sin forwardRef (Empresa no importa Announcement).
 */
@Module({
  imports: [
    EventsModule,
    EmpresaModule,
    forwardRef(() => AuthModule),
    forwardRef(() => MessageModule),
    MongooseModule.forFeature([
      { name: Announcement.name, schema: AnnouncementSchema },
      { name: AnnouncementReceipt.name, schema: AnnouncementReceiptSchema },
    ]),
  ],
  controllers: [AnnouncementController],
  providers: [AnnouncementService, AnnouncementSubscriptionListener],
  exports: [AnnouncementService],
})
export class AnnouncementModule {}
