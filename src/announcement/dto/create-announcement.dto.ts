import {
  ArrayNotEmpty,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsMongoId,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';
import {
  AnnouncementAudience,
  AnnouncementScope,
  AnnouncementSeverity,
  AnnouncementType,
} from '../schemas/announcement.schema';

export class CreateAnnouncementDto {
  @IsString()
  @MinLength(2)
  title: string;

  @IsString()
  @MinLength(2)
  body: string;

  @IsOptional()
  @IsEnum(AnnouncementType)
  type?: AnnouncementType;

  @IsOptional()
  @IsEnum(AnnouncementSeverity)
  severity?: AnnouncementSeverity;

  @IsOptional()
  @IsEnum(AnnouncementScope)
  scope?: AnnouncementScope;

  @IsOptional()
  @IsArray()
  @IsMongoId({ each: true })
  empresaIds?: string[];

  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(AnnouncementAudience, { each: true })
  audience?: AnnouncementAudience[];

  @IsOptional()
  @IsDateString()
  startsAt?: string;

  @IsOptional()
  @IsDateString()
  endsAt?: string;

  @IsOptional()
  @IsBoolean()
  dismissible?: boolean;

  @IsOptional()
  @IsBoolean()
  requiresAck?: boolean;

  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}
