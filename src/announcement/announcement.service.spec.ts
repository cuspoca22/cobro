import { Test, TestingModule } from '@nestjs/testing';
import { getModelToken } from '@nestjs/mongoose';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Types } from 'mongoose';

import { AuthService } from 'src/auth/auth.service';
import { EmpresaService } from 'src/empresa/empresa.service';
import { MessageGateway } from 'src/message/message.gateway';
import { AnnouncementService } from './announcement.service';
import { Announcement } from './schemas/announcement.schema';
import { AnnouncementReceipt } from './schemas/announcement-receipt.schema';

describe('AnnouncementService receipts', () => {
  let service: AnnouncementService;
  let announcementModel: { findById: jest.Mock };
  let receiptModel: {
    findOne: jest.Mock;
    findOneAndUpdate: jest.Mock;
  };

  const announcementId = new Types.ObjectId().toString();
  const userId = new Types.ObjectId().toString();

  beforeEach(async () => {
    announcementModel = {
      findById: jest.fn(),
    };
    receiptModel = {
      findOne: jest.fn(),
      findOneAndUpdate: jest.fn().mockResolvedValue({}),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnouncementService,
        { provide: getModelToken(Announcement.name), useValue: announcementModel },
        {
          provide: getModelToken(AnnouncementReceipt.name),
          useValue: receiptModel,
        },
        { provide: MessageGateway, useValue: { emitAnnouncement: jest.fn() } },
        { provide: AuthService, useValue: {} },
        { provide: EmpresaService, useValue: {} },
      ],
    }).compile();

    service = module.get(AnnouncementService);
  });

  function mockActiveAnnouncement(overrides: Record<string, unknown> = {}) {
    announcementModel.findById.mockResolvedValue({
      _id: new Types.ObjectId(announcementId),
      isActive: true,
      dismissible: true,
      ...overrides,
    });
  }

  function mockReceiptFindOne(readAt?: Date | null) {
    const lean = jest.fn().mockResolvedValue(
      readAt === undefined
        ? null
        : { readAt: readAt || undefined },
    );
    receiptModel.findOne.mockReturnValue({
      select: jest.fn().mockReturnValue({ lean }),
    });
  }

  function assertPlainSetUpdate() {
    expect(receiptModel.findOneAndUpdate).toHaveBeenCalledTimes(1);
    const [, update, options] = receiptModel.findOneAndUpdate.mock.calls[0];
    expect(Array.isArray(update)).toBe(false);
    expect(update).toEqual(
      expect.objectContaining({
        $set: expect.any(Object),
      }),
    );
    expect(options).toEqual(expect.objectContaining({ upsert: true }));
    return update.$set as Record<string, unknown>;
  }

  it('markRead usa $set plano (no pipeline array) y setea readAt', async () => {
    mockActiveAnnouncement();
    mockReceiptFindOne(undefined);

    await expect(service.markRead(announcementId, userId)).resolves.toEqual({
      ok: true,
    });

    const $set = assertPlainSetUpdate();
    expect($set.readAt).toBeInstanceOf(Date);
    expect($set.announcementId).toBeInstanceOf(Types.ObjectId);
    expect($set.userId).toBeInstanceOf(Types.ObjectId);
  });

  it('markRead no sobrescribe readAt existente', async () => {
    mockActiveAnnouncement();
    const existingReadAt = new Date('2026-01-01T00:00:00.000Z');
    mockReceiptFindOne(existingReadAt);

    await service.markRead(announcementId, userId);

    const $set = assertPlainSetUpdate();
    expect($set.readAt).toBeUndefined();
  });

  it('acknowledge setea acknowledgedAt + readAt con $set plano', async () => {
    mockActiveAnnouncement();
    mockReceiptFindOne(undefined);

    await expect(
      service.acknowledge(announcementId, userId),
    ).resolves.toEqual({ ok: true });

    const $set = assertPlainSetUpdate();
    expect($set.acknowledgedAt).toBeInstanceOf(Date);
    expect($set.readAt).toBeInstanceOf(Date);
  });

  it('dismiss setea dismissedAt + readAt con $set plano', async () => {
    mockActiveAnnouncement({ dismissible: true });
    mockReceiptFindOne(undefined);

    await expect(service.dismiss(announcementId, userId)).resolves.toEqual({
      ok: true,
    });

    const $set = assertPlainSetUpdate();
    expect($set.dismissedAt).toBeInstanceOf(Date);
    expect($set.readAt).toBeInstanceOf(Date);
  });

  it('dismiss falla si no es dismissible', async () => {
    mockActiveAnnouncement({ dismissible: false });

    await expect(service.dismiss(announcementId, userId)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(receiptModel.findOneAndUpdate).not.toHaveBeenCalled();
  });

  it('markRead falla si el aviso no existe', async () => {
    announcementModel.findById.mockResolvedValue(null);

    await expect(
      service.markRead(announcementId, userId),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});
