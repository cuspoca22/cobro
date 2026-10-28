export interface FotoSolicitadaView {
  anterior: string;
  nueva: string;
}

export class PeticionesImagenEntity {
  id: string;
  estado: string;
  fecha_solicitud: Date;
  fecha_actualizacion: Date;
  document_image: FotoSolicitadaView | null;
  business_image: FotoSolicitadaView | null;
  house_image: FotoSolicitadaView | null;
  cobrador: { id: string; nombre: string };
  cliente: { id: string; nombre: string; alias: string };
  ruta: { id: string; nombre: string };
  empresa: { id: string; nombre: string };

  static fromObject(obj: any): PeticionesImagenEntity {
    const entity = new PeticionesImagenEntity();
    entity.id = obj._id?.toString() || obj.id;
    entity.estado = obj.estado;
    entity.fecha_solicitud = obj.fecha_solicitud;
    entity.fecha_actualizacion = obj.fecha_actualizacion;
    entity.document_image = PeticionesImagenEntity.foto(obj.document_image);
    entity.business_image = PeticionesImagenEntity.foto(obj.business_image);
    entity.house_image = PeticionesImagenEntity.foto(obj.house_image);

    entity.cobrador = { id: '', nombre: '' };
    entity.cliente = { id: '', nombre: '', alias: '' };
    entity.ruta = { id: '', nombre: '' };
    entity.empresa = { id: '', nombre: '' };

    PeticionesImagenEntity.ref(obj.id_usuario, entity.cobrador);
    if (obj.id_cliente) {
      if (typeof obj.id_cliente === 'object') {
        entity.cliente.id = obj.id_cliente._id?.toString() || obj.id_cliente.id?.toString() || '';
        entity.cliente.nombre = obj.id_cliente.nombre || '';
        entity.cliente.alias = obj.id_cliente.alias || '';
      } else {
        entity.cliente.id = obj.id_cliente.toString();
      }
    }
    PeticionesImagenEntity.ref(obj.id_ruta, entity.ruta, 'nombre');
    if (obj.id_empresa) {
      if (typeof obj.id_empresa === 'object') {
        entity.empresa.id = obj.id_empresa._id?.toString() || obj.id_empresa.id?.toString() || '';
        entity.empresa.nombre = obj.id_empresa.nombre || obj.id_empresa.name || '';
      } else {
        entity.empresa.id = obj.id_empresa.toString();
      }
    }

    return entity;
  }

  private static foto(value: any): FotoSolicitadaView | null {
    if (!value?.nueva) return null;
    return {
      anterior: value.anterior ?? '',
      nueva: value.nueva,
    };
  }

  private static ref(
    value: any,
    target: { id: string; nombre: string },
    nameKey = 'nombre',
  ): void {
    if (!value) return;
    if (typeof value === 'object') {
      target.id = value._id?.toString() || value.id?.toString() || '';
      target.nombre = value[nameKey] || value.username || '';
      return;
    }
    target.id = value.toString();
  }
}
