export class ClienteEntity {
  
  nombre: string;
  alias: string;
  status: boolean;
  state: boolean;
  dpi: string;
  ciudad: string;
  direccion: string;
  ubication: number[];
  telefono: string;
  ruta: string;
  document_image: string;
  business_image: string;
  house_image: string;
  turno: number;
  _id?: string;
  id?: string;

  constructor(
    data?: Partial<ClienteEntity>
  ) { 
    if (data) {
      Object.assign(this, data);
    }
  }

  static fromObject( object: {[key: string]: any} ): ClienteEntity {

    const { _id, id } = object;

    const clienteId = (id || _id)?.toString() || null;

    const cliente = new ClienteEntity({
      id: clienteId,
      nombre: object.nombre,
      alias: object.alias,
      status: object.status,
      state: object.state,
      dpi: object.dpi,
      ciudad: object.ciudad,
      direccion: object.direccion,
      ubication: object.ubication,
      telefono: object.telefono,
      ruta: object.ruta,
      document_image: object.document_image,
      business_image: object.business_image,
      house_image: object.house_image,
      turno: object.turno,
    });

    return cliente;

  }

}