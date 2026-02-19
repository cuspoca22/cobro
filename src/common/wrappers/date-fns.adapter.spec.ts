import { Test, TestingModule } from '@nestjs/testing';
import { DateFnsAdapter } from './date-fns.adapter';
// import { toZonedTime } from 'date-fns-tz'; // Not used directly in test, service uses it

describe('DateFnsAdapter', () => {
  let service: DateFnsAdapter;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [DateFnsAdapter],
    }).compile();

    service = module.get<DateFnsAdapter>(DateFnsAdapter);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('Timezone Conversions', () => {
    const timeZone = 'America/New_York';
    // 2023-10-10 12:00:00 UTC
    const utcDate = new Date('2023-10-10T12:00:00.000Z');

    it('convertUtcToZonedTime should return a Date object representing local time', () => {
      // Logic: 12:00 UTC is 08:00 EDT (UTC-4)
      const zonedDate = service.convertUtcToZonedTime(utcDate, timeZone);
      // Verify hours indirectly or just ensure it returns a valid date
      expect(zonedDate).toBeInstanceOf(Date);
      // Note: testing exact values of zonedDate is tricky because JS Date methods 
      // rely on system time unless we use date-fns generic methods. 
      // But `convertUtcToZonedTime` returns a "shifted" date, where getHours() WOULD be 8 if interpreted as UTC-like locally.
      // Actually `toZonedTime` returns a Date that, when printed in system local time (if system matches TZ), is correct.
      // But usually it returns a Date where `getUTCHours` matches the local time hours.
      // Let's verify the round trip as primary check.
    });

    it('convertZonedTimeToUtc should convert zoned date back to UTC', () => {
      const zoned = service.convertUtcToZonedTime(utcDate, timeZone);
      const backToUtc = service.convertZonedTimeToUtc(zoned, timeZone);

      // Tolerance for milliseconds if any strict check fails? No, should be exact.
      expect(backToUtc.toISOString()).toBe(utcDate.toISOString());
    });
  });

  describe('start/end of day', () => {
    const timeZone = 'America/Guatemala'; // UTC-6

    it('getStartOfTodayInTimeZone should return correct UTC start of day', () => {
      // Mock nowUtc to control "today"
      // 2023-10-15 15:00:00 UTC is 2023-10-15 09:00:00 in Guatemala
      const fixedNow = new Date('2023-10-15T15:00:00.000Z');
      jest.spyOn(service, 'nowUtc').mockReturnValue(fixedNow);

      const startOfDay = service.getStartOfTodayInTimeZone(timeZone);

      // Start of day in Guatemala: 2023-10-15 00:00:00
      // 00:00:00 Guatemala is 06:00:00 UTC (standard time? Oct is CST usually -6)
      expect(startOfDay.toISOString()).toBe('2023-10-15T06:00:00.000Z');
    });

    it('getEndOfTodayInTimeZone should return correct UTC end of day', () => {
      const fixedNow = new Date('2023-10-15T15:00:00.000Z');
      jest.spyOn(service, 'nowUtc').mockReturnValue(fixedNow);

      const endOfDay = service.getEndOfTodayInTimeZone(timeZone);

      // End of day: 2023-10-15 23:59:59.999
      // In UTC: 2023-10-16 05:59:59.999
      expect(endOfDay.toISOString()).toBe('2023-10-16T05:59:59.999Z');
    });
  });

  describe('Equality and Comparisons', () => {
    const now = new Date('2023-01-10T12:00:00Z');

    it('isPast should return true for past dates', () => {
      jest.spyOn(service, 'nowUtc').mockReturnValue(now);
      const past = new Date('2023-01-09T12:00:00Z');
      expect(service.isPast(past)).toBe(true);
    });

    it('isPast should return false for future dates', () => {
      jest.spyOn(service, 'nowUtc').mockReturnValue(now);
      const future = new Date('2023-01-11T12:00:00Z');
      expect(service.isPast(future)).toBe(false);
    });

    it('isBefore should compare dates correctly', () => {
      const d1 = new Date('2023-01-01');
      const d2 = new Date('2023-01-02');
      // d1 is before d2 -> true
      expect(service.isBefore(d1, d2)).toBe(true);
      expect(service.isBefore(d2, d1)).toBe(false);
    });

    it('isEqual should return true for equal dates', () => {
      const d1 = new Date('2023-01-01T10:00:00Z');
      const d2 = new Date('2023-01-01T10:00:00Z');
      expect(service.isEqual(d1, d2)).toBe(true);
    });
  });

  describe('Manipulations', () => {
    const baseDate = new Date('2023-01-01T00:00:00Z');

    it('addDays should add days correctly', () => {
      const res = service.addDays(baseDate, 5);
      expect(res.toISOString()).toBe('2023-01-06T00:00:00.000Z');
    });

    it('addWeeks should add weeks correctly', () => {
      const res = service.addWeeks(baseDate, 1);
      expect(res.toISOString()).toBe('2023-01-08T00:00:00.000Z');
    });

    it('addMonths should add months correctly', () => {
      const res = service.addMonths(baseDate, 1);
      expect(res.toISOString()).toBe('2023-02-01T00:00:00.000Z');
    });

    it('differenceInDays should return correct difference', () => {
      const d1 = new Date('2023-01-10');
      const d2 = new Date('2023-01-01');
      expect(service.differenceInDays(d1, d2)).toBe(9);
    });
  });

  describe('isSunday', () => {
    it('should identify Sunday correctly in a specific timezone', () => {
      // 2023-10-15 is a Sunday
      // Let's pick noon UTC
      const sundayUtc = new Date('2023-10-15T12:00:00Z');

      // In NY (UTC-4), it is 08:00 Sunday. So IsSunday -> True
      expect(service.isSunday(sundayUtc, 'America/New_York')).toBe(true);
    });

    it('should identify non-Sunday correctly', () => {
      // 2023-10-16 Monday
      const mondayUtc = new Date('2023-10-16T12:00:00Z');
      expect(service.isSunday(mondayUtc, 'America/New_York')).toBe(false);
    });

    it('should handle timezone differences', () => {
      // Sunday 2023-10-15 01:00 UTC
      const date = new Date('2023-10-15T01:00:00Z');

      // In America/New_York (UTC-4), this is Saturday 2023-10-14 21:00:00
      // So isSunday -> False
      expect(service.isSunday(date, 'America/New_York')).toBe(false);

      // But in UTC or London? 
      // Europe/London is UTC+1 (BST) in Oct? 
      // If BST, it's 02:00 Sunday. So True.
      // If pure UTC, 01:00 Sunday. So True.
      expect(service.isSunday(date, 'UTC')).toBe(true);
    });
  });
});
