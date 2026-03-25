
export class PeticionesUbicacionEntity {
  id: string;
  old_ubicacion: number[];
  new_ubicacion: number[];
  estado: string;
  fecha_solicitud: Date;
  fecha_actualizacion: Date;
  cobrador: { id: string, nombre: string };
  cliente: { id: string, nombre: string, alias: string };
  ruta: { id: string, nombre: string };
  empresa: { id: string, nombre: string };

  static fromObject(obj: any): PeticionesUbicacionEntity {
    const entity = new PeticionesUbicacionEntity();
    entity.id = obj._id?.toString() || obj.id;
    entity.old_ubicacion = obj.old_ubicacion;
    entity.new_ubicacion = obj.new_ubicacion;
    entity.estado = obj.estado;
    entity.fecha_solicitud = obj.fecha_solicitud;
    entity.fecha_actualizacion = obj.fecha_actualizacion;

    // Initialize nested objects
    entity.cobrador = { id: '', nombre: '' };
    entity.cliente = { id: '', nombre: '', alias: '' };
    entity.ruta = { id: '', nombre: '' };
    entity.empresa = { id: '', nombre: '' };

    // Handle cobrador (id_usuario)
    if (obj.id_usuario) {
      if (typeof obj.id_usuario === 'object') {
        entity.cobrador.id = obj.id_usuario._id?.toString() || obj.id_usuario.id?.toString() || '';
        entity.cobrador.nombre = obj.id_usuario.nombre || obj.id_usuario.username || '';
      } else {
        entity.cobrador.id = obj.id_usuario.toString();
      }
    }

    // Handle cliente (id_cliente)
    if (obj.id_cliente) {
      if (typeof obj.id_cliente === 'object') {
        entity.cliente.id = obj.id_cliente._id?.toString() || obj.id_cliente.id?.toString() || '';
        entity.cliente.nombre = obj.id_cliente.nombre || '';
        entity.cliente.alias = obj.id_cliente.alias || '';
      } else {
        entity.cliente.id = obj.id_cliente.toString();
      }
    }

    // Handle ruta (id_ruta)
    if (obj.id_ruta) {
      if (typeof obj.id_ruta === 'object') {
        entity.ruta.id = obj.id_ruta._id?.toString() || obj.id_ruta.id?.toString() || '';
        entity.ruta.nombre = obj.id_ruta.nombre || '';
      } else {
        entity.ruta.id = obj.id_ruta.toString();
      }
    }

    // Handle empresa (id_empresa)
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
}