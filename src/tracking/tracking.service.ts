import { forwardRef, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { toZonedTime } from 'date-fns-tz';
import { format } from 'date-fns';

import { AuthService } from '../auth/auth.service';
import { RutaService } from '../ruta/ruta.service';
import { CobradorTracking } from './schemas/cobrador-tracking.schema';

const MIN_INTERVAL_MS = 15_000;
const MIN_DISTANCE_M = 15;
/** Lecturas peores que esto se descartan (metros). */
const MAX_ACCURACY_M = 250;
/** Velocidad implícita entre dos puntos consecutivos del trail. */
const MAX_SPEED_KMH = 100;
/** Saltos por distancia/tiempo (cubre GPS de navegador → dispositivo real horas después). */
const JUMP_RULES: Array<{ maxMeters: number; maxElapsedMs: number }> = [
  { maxMeters: 25_000, maxElapsedMs: 15 * 60 * 1000 }, // 25 km / 15 min
  { maxMeters: 60_000, maxElapsedMs: 45 * 60 * 1000 }, // 60 km / 45 min
  { maxMeters: 100_000, maxElapsedMs: 2 * 60 * 60 * 1000 }, // 100 km / 2 h
];
/** Cualquier hop de trail mayor a esto se considera teletransporte (p. ej. capital → Petén). */
const ABSOLUTE_MAX_HOP_M = 120_000; // 120 km

const DEFAULT_TZ = 'UTC';

export type LocationUpdateInput = {
  cobradorId: string;
  empresaId: string;
  rutaId?: string;
  nombre: string;
  lng: number;
  lat: number;
  accuracy?: number;
  at?: Date;
};

export type CobradorTrackingHoyDto = {
  cobradorId: string;
  nombre: string;
  rutaId?: string;
  online: boolean;
  ultimaUbicacion?: { lng: number; lat: number; at: string; accuracy?: number };
  puntos: Array<{ lng: number; lat: number; at: string; accuracy?: number }>;
};

type OnlinePresence = {
  sockets: Set<string>;
  empresaId: string;
  nombre: string;
  rutaId?: string;
};

@Injectable()
export class TrackingService {
  /** Presencia en memoria: cobradorId → sockets activos */
  private readonly onlineCobradores = new Map<string, OnlinePresence>();
  /** Cache ligera rutaId → timeZone */
  private readonly rutaTzCache = new Map<string, string>();

  constructor(
    @InjectModel(CobradorTracking.name)
    private readonly trackingModel: Model<CobradorTracking>,
    @Inject(forwardRef(() => AuthService))
    private readonly authService: AuthService,
    @Inject(forwardRef(() => RutaService))
    private readonly rutaService: RutaService,
  ) {}

  /**
   * @returns true si el cobrador pasó de offline → online
   */
  registerCobradorOnline(
    socketId: string,
    data: { userId: string; empresaId: string; nombre: string; rutaId?: string },
  ): boolean {
    const userId = String(data.userId);
    const empresaId = String(data.empresaId);
    const existing = this.onlineCobradores.get(userId);
    if (existing) {
      existing.sockets.add(socketId);
      existing.empresaId = empresaId;
      existing.nombre = data.nombre;
      existing.rutaId = data.rutaId;
      return false;
    }
    this.onlineCobradores.set(userId, {
      sockets: new Set([socketId]),
      empresaId,
      nombre: data.nombre,
      rutaId: data.rutaId,
    });
    return true;
  }

  /** true si el cobrador quedó completamente offline */
  unregisterCobradorSocket(userId: string, socketId: string): boolean {
    const entry = this.onlineCobradores.get(String(userId));
    if (!entry) return false;
    entry.sockets.delete(socketId);
    if (entry.sockets.size > 0) return false;
    this.onlineCobradores.delete(String(userId));
    return true;
  }

  getOnlineCobradorIds(empresaId: string): Set<string> {
    const target = String(empresaId);
    const ids = new Set<string>();
    for (const [cobradorId, entry] of this.onlineCobradores) {
      if (String(entry.empresaId) === target) {
        ids.add(cobradorId);
      }
    }
    return ids;
  }

  /** Metadatos de presencia en memoria (fallback si el perfil DB no resuelve). */
  getOnlinePresence(
    cobradorId: string,
  ): { empresaId: string; nombre: string; rutaId?: string } | null {
    const entry = this.onlineCobradores.get(String(cobradorId));
    if (!entry) return null;
    return {
      empresaId: entry.empresaId,
      nombre: entry.nombre,
      rutaId: entry.rutaId,
    };
  }

  isCobradorOnline(cobradorId: string): boolean {
    return this.onlineCobradores.has(String(cobradorId));
  }

  hoyKey(timeZone: string = DEFAULT_TZ): string {
    const zoned = toZonedTime(new Date(), timeZone);
    return format(zoned, 'yyyy-MM-dd');
  }

  private async resolveTimeZone(rutaId?: string): Promise<string> {
    if (!rutaId) return DEFAULT_TZ;
    const cached = this.rutaTzCache.get(rutaId);
    if (cached) return cached;

    const ctx = await this.rutaService.findContextById(rutaId);
    const tz = ctx?.timeZone || DEFAULT_TZ;
    this.rutaTzCache.set(rutaId, tz);
    return tz;
  }

  /** Claves `fecha` de “hoy” para todas las TZ de rutas de la empresa. */
  private async hoyKeysEmpresa(empresaId: string): Promise<string[]> {
    const rutas = await this.rutaService.findLean(
      { empresa: new Types.ObjectId(empresaId) },
      { select: 'timeZone' },
    );

    const keys = new Set<string>();
    if (!rutas.length) {
      keys.add(this.hoyKey(DEFAULT_TZ));
    } else {
      for (const ruta of rutas) {
        keys.add(this.hoyKey((ruta.timeZone as string) || DEFAULT_TZ));
      }
    }
    return [...keys];
  }

  private haversineMeters(
    lng1: number,
    lat1: number,
    lng2: number,
    lat2: number,
  ): number {
    const R = 6371000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
    return 2 * R * Math.asin(Math.sqrt(a));
  }

  /**
   * Detecta saltos imposibles entre dos lecturas consecutivas del trail.
   * Ej.: punto de navegador en capital → GPS real a cientos de km.
   */
  private isImpossibleJump(distMeters: number, elapsedMs: number): boolean {
    if (distMeters > ABSOLUTE_MAX_HOP_M) return true;

    const safeElapsed = Math.max(elapsedMs, 1_000);
    const speedKmh = distMeters / 1000 / (safeElapsed / 3_600_000);
    if (speedKmh > MAX_SPEED_KMH) return true;

    for (const rule of JUMP_RULES) {
      if (distMeters > rule.maxMeters && safeElapsed < rule.maxElapsedMs) {
        return true;
      }
    }
    return false;
  }

  /**
   * Ante salto imposible: solo reemplaza el punto previo si el nuevo tiene
   * accuracy claramente mejor; si no, descarta el nuevo (protege el trail).
   */
  private shouldReplacePrevOnJump(
    prevAccuracy: number | undefined,
    newAccuracy: number | undefined,
  ): boolean {
    const prev = prevAccuracy ?? Number.POSITIVE_INFINITY;
    const next = newAccuracy ?? Number.POSITIVE_INFINITY;
    return next < prev && next <= 80;
  }

  /** Colapsa pares con salto imposible; no pisa el trail bueno con un glitch. */
  private sanitizePuntos(
    puntos: Array<{ coordinates: number[]; at: Date; accuracy?: number }>,
  ): Array<{ coordinates: number[]; at: Date; accuracy?: number }> {
    if (!puntos?.length) return [];
    const out: Array<{ coordinates: number[]; at: Date; accuracy?: number }> = [
      puntos[0],
    ];
    for (let i = 1; i < puntos.length; i++) {
      const prev = out[out.length - 1];
      const cur = puntos[i];
      const dist = this.haversineMeters(
        prev.coordinates[0],
        prev.coordinates[1],
        cur.coordinates[0],
        cur.coordinates[1],
      );
      const elapsed =
        new Date(cur.at).getTime() - new Date(prev.at).getTime();
      if (this.isImpossibleJump(dist, elapsed)) {
        if (this.shouldReplacePrevOnJump(prev.accuracy, cur.accuracy)) {
          out[out.length - 1] = cur;
        }
        // si no: se descarta `cur` y se conserva el trail
      } else {
        out.push(cur);
      }
    }
    return out;
  }

  /**
   * Persiste punto si pasa throttle y filtro de saltos imposibles.
   * Ante salto imposible: solo reemplaza el último si el nuevo GPS es mejor.
   */
  async appendLocationIfAllowed(
    input: LocationUpdateInput,
  ): Promise<{
    lng: number;
    lat: number;
    at: Date;
    cobradorId: string;
    nombre: string;
    rutaId?: string;
  } | null> {
    const { cobradorId, empresaId, rutaId, nombre, lng, lat, accuracy } = input;
    const at = input.at ?? new Date();
    const fecha = this.hoyKey(await this.resolveTimeZone(rutaId));

    if (
      !Number.isFinite(lng) ||
      !Number.isFinite(lat) ||
      Math.abs(lat) > 90 ||
      Math.abs(lng) > 180
    ) {
      return null;
    }

    if (
      accuracy != null &&
      Number.isFinite(accuracy) &&
      accuracy > MAX_ACCURACY_M
    ) {
      return null;
    }

    const existing = await this.trackingModel
      .findOne({ cobrador: new Types.ObjectId(cobradorId), fecha })
      .lean();

    let replaceLast = false;

    if (existing?.ultimaUbicacion) {
      const prev = existing.ultimaUbicacion;
      const elapsed = at.getTime() - new Date(prev.at).getTime();
      const dist = this.haversineMeters(
        prev.coordinates[0],
        prev.coordinates[1],
        lng,
        lat,
      );

      if (this.isImpossibleJump(dist, elapsed)) {
        if (!this.shouldReplacePrevOnJump(prev.accuracy, accuracy)) {
          return null;
        }
        replaceLast = true;
      } else if (elapsed < MIN_INTERVAL_MS && dist < MIN_DISTANCE_M) {
        return null;
      }
    }

    const punto = {
      coordinates: [lng, lat],
      at,
      ...(accuracy != null ? { accuracy } : {}),
    };

    let puntos = [...(existing?.puntos ?? [])].map((p) => ({
      coordinates: p.coordinates,
      at: p.at,
      ...(p.accuracy != null ? { accuracy: p.accuracy } : {}),
    }));

    if (replaceLast && puntos.length > 0) {
      puntos[puntos.length - 1] = punto;
    } else {
      puntos.push(punto);
    }

    puntos = this.sanitizePuntos(puntos);
    const ultima = puntos[puntos.length - 1] ?? punto;

    await this.trackingModel.findOneAndUpdate(
      { cobrador: new Types.ObjectId(cobradorId), fecha },
      {
        $set: {
          empresa: new Types.ObjectId(empresaId),
          ...(rutaId ? { ruta: new Types.ObjectId(rutaId) } : {}),
          ultimaUbicacion: ultima,
          puntos,
        },
        $setOnInsert: {
          cobrador: new Types.ObjectId(cobradorId),
          fecha,
        },
      },
      { upsert: true, returnDocument: 'after' },
    );

    return {
      lng: ultima.coordinates[0],
      lat: ultima.coordinates[1],
      at: new Date(ultima.at),
      cobradorId,
      nombre,
      rutaId,
    };
  }

  async getUltimaUbicacionHoy(cobradorId: string) {
    const user = await this.authService.findTrackingProfileById(cobradorId);
    const fecha = this.hoyKey(await this.resolveTimeZone(user?.rutaId));
    const doc = await this.trackingModel
      .findOne({ cobrador: new Types.ObjectId(cobradorId), fecha })
      .select('ultimaUbicacion ruta')
      .lean();

    if (!doc?.ultimaUbicacion) return null;

    return {
      lng: doc.ultimaUbicacion.coordinates[0],
      lat: doc.ultimaUbicacion.coordinates[1],
      at: doc.ultimaUbicacion.at,
      accuracy: doc.ultimaUbicacion.accuracy,
      rutaId: doc.ruta?.toString(),
    };
  }

  async getEmpresaHoy(
    empresaId: string,
    onlineIds: Set<string>,
  ): Promise<CobradorTrackingHoyDto[]> {
    const fechas = await this.hoyKeysEmpresa(empresaId);
    const idsToResolve = new Set([...onlineIds]);

    const docs = await this.trackingModel
      .find({
        empresa: new Types.ObjectId(empresaId),
        fecha: { $in: fechas },
      })
      .lean();

    for (const doc of docs) {
      idsToResolve.add(doc.cobrador.toString());
    }

    if (idsToResolve.size === 0) return [];

    const users = await this.authService.findTrackingProfilesByIds(
      [...idsToResolve],
      empresaId,
    );

    const userMap = new Map(
      users.map((u) => [
        u._id,
        {
          nombre: u.nombre,
          rutaId: u.rutaId,
        },
      ]),
    );

    const byCobrador = new Map<string, CobradorTrackingHoyDto>();

    for (const doc of docs) {
      const id = doc.cobrador.toString();
      const user = userMap.get(id);
      if (!user) continue;
      const rawPuntos = (doc.puntos ?? []).map((p) => ({
        coordinates: p.coordinates,
        at: p.at,
        ...(p.accuracy != null ? { accuracy: p.accuracy } : {}),
      }));
      const puntosLimpios = this.sanitizePuntos(rawPuntos);

      // Persiste limpieza si había saltos imposibles ya guardados
      if (puntosLimpios.length !== rawPuntos.length) {
        const ultima =
          puntosLimpios[puntosLimpios.length - 1] ?? doc.ultimaUbicacion;
        void this.trackingModel
          .updateOne(
            { _id: doc._id },
            {
              $set: {
                puntos: puntosLimpios,
                ...(ultima ? { ultimaUbicacion: ultima } : {}),
              },
            },
          )
          .exec();
      }

      const ultima = puntosLimpios[puntosLimpios.length - 1] ?? doc.ultimaUbicacion;
      byCobrador.set(id, {
        cobradorId: id,
        nombre: user.nombre,
        rutaId: doc.ruta?.toString() ?? user.rutaId,
        online: onlineIds.has(id),
        ultimaUbicacion: ultima
          ? {
              lng: ultima.coordinates[0],
              lat: ultima.coordinates[1],
              at: new Date(ultima.at).toISOString(),
              accuracy: ultima.accuracy,
            }
          : undefined,
        puntos: puntosLimpios.map((p) => ({
          lng: p.coordinates[0],
          lat: p.coordinates[1],
          at: new Date(p.at).toISOString(),
          accuracy: p.accuracy,
        })),
      });
    }

    for (const onlineId of onlineIds) {
      if (byCobrador.has(onlineId)) continue;
      const user = userMap.get(onlineId);
      if (user) {
        byCobrador.set(onlineId, {
          cobradorId: onlineId,
          nombre: user.nombre,
          rutaId: user.rutaId,
          online: true,
          puntos: [],
        });
        continue;
      }

      // Fallback: el Map de presencia ya tiene nombre/ruta (p. ej. si el
      // lookup por empresa no devolvió el perfil a tiempo).
      const presence = this.getOnlinePresence(onlineId);
      if (!presence || String(presence.empresaId) !== String(empresaId)) {
        continue;
      }
      byCobrador.set(onlineId, {
        cobradorId: onlineId,
        nombre: presence.nombre,
        rutaId: presence.rutaId,
        online: true,
        puntos: [],
      });
    }

    return [...byCobrador.values()];
  }

  async getCobradorHoy(cobradorId: string, online: boolean): Promise<CobradorTrackingHoyDto> {
    const user = await this.authService.findTrackingProfileById(cobradorId);

    if (!user) {
      throw new NotFoundException(`Cobrador ${cobradorId} no existe`);
    }

    const fecha = this.hoyKey(await this.resolveTimeZone(user.rutaId));
    const doc = await this.trackingModel
      .findOne({ cobrador: new Types.ObjectId(cobradorId), fecha })
      .lean();

    const puntosLimpios = this.sanitizePuntos(
      (doc?.puntos ?? []).map((p) => ({
        coordinates: p.coordinates,
        at: p.at,
        ...(p.accuracy != null ? { accuracy: p.accuracy } : {}),
      })),
    );
    const ultima = puntosLimpios[puntosLimpios.length - 1] ?? doc?.ultimaUbicacion;

    return {
      cobradorId,
      nombre: user.nombre,
      rutaId: doc?.ruta?.toString() ?? user.rutaId,
      online,
      ultimaUbicacion: ultima
        ? {
            lng: ultima.coordinates[0],
            lat: ultima.coordinates[1],
            at: new Date(ultima.at).toISOString(),
            accuracy: ultima.accuracy,
          }
        : undefined,
      puntos: puntosLimpios.map((p) => ({
        lng: p.coordinates[0],
        lat: p.coordinates[1],
        at: new Date(p.at).toISOString(),
        accuracy: p.accuracy,
      })),
    };
  }
}
