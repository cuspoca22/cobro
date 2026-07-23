import { IsBoolean, IsInt, IsOptional, Max, Min } from 'class-validator';

export class UpdateSubscriptionDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(31)
  dayOfPay?: number;

  @IsOptional()
  @IsBoolean()
  isSubscriptionPaid?: boolean;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(31)
  subscriptionGraceDays?: number;
}
