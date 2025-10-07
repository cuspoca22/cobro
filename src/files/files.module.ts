import { Module } from '@nestjs/common';
import { FilesService } from './files.service';
import { FilesController } from './files.controller';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    ConfigModule,
    AuthModule
  ],
  controllers: [
    FilesController
  ],
  providers: [
    FilesService,
  ]
})
export class FilesModule {}
