import { Module, forwardRef } from '@nestjs/common';
import { MongooseModule } from '@nestjs/mongoose';

import { AuthModule } from 'src/auth/auth.module';
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

@Module({
  imports: [
    EventsModule,
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
