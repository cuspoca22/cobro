# Documentación API - Peticiones Ubicación

## Resumen
Este documento describe la API para gestionar solicitudes de cambio de ubicación de clientes en el sistema PayFlow.

## Endpoints Disponibles

### 1. Crear Solicitud
- **Método**: `POST /api/peticiones-ubicacion`
- **Autenticación**: Requerida (JWT)
- **Roles permitidos**: `superAdmin`, `admin`, `cobrador`, `supervisor`
- **Body**: [`CreatePeticionesUbicacionDto`](#createpeticionesubicaciondto)
- **Respuesta**: `boolean` (true si se creó exitosamente)

### 2. Listar Solicitudes
- **Método**: `GET /api/peticiones-ubicacion`
- **Autenticación**: Requerida (JWT)
- **Parámetros query opcionales**:
  - `estado`: `pendiente` | `aceptada` | `rechazada`
  - `id_cliente`: ObjectId del cliente
  - `id_ruta`: ObjectId de la ruta
  - `id_empresa`: ObjectId de la empresa
  - `fecha_desde`: Fecha inicial (ISO 8601)
  - `fecha_hasta`: Fecha final (ISO 8601)
- **Respuesta**: Array de [`PeticionesUbicacionEntity`](#peticionesubicacionentity)

### 3. Obtener Solicitud por ID
- **Método**: `GET /api/peticiones-ubicacion/{id}`
- **Autenticación**: Requerida (JWT)
- **Parámetros path**: `id` (ObjectId de la solicitud)
- **Respuesta**: [`PeticionesUbicacionEntity`](#peticionesubicacionentity)

### 4. Actualizar Solicitud
- **Método**: `PATCH /api/peticiones-ubicacion/{id}`
- **Autenticación**: Requerida (JWT)
- **Roles permitidos**: `superAdmin`, `admin`, `supervisor`
- **Parámetros path**: `id` (ObjectId de la solicitud)
- **Body**: [`UpdatePeticionesUbicacionDto`](#updatepeticionesubicaciondto)
- **Respuesta**: [`PeticionesUbicacionEntity`](#peticionesubicacionentity) actualizada

### 5. Eliminar Solicitud
- **Método**: `DELETE /api/peticiones-ubicacion/{id}`
- **Autenticación**: Requerida (JWT)
- **Roles permitidos**: `superAdmin`, `admin`
- **Parámetros path**: `id` (ObjectId de la solicitud)
- **Respuesta**: `{ message: string }`

## Modelos de Datos

### CreatePeticionesUbicacionDto
```typescript
{
  old_ubicacion?: [number, number];  // [longitud, latitud] - opcional
  new_ubicacion: [number, number];   // [longitud, latitud] - requerido
  id_cliente: string;                // ObjectId del cliente - requerido
  id_usuario?: string;               // ObjectId del usuario - opcional
  id_ruta?: string;                  // ObjectId de la ruta - opcional
  estado?: 'pendiente' | 'aceptada' | 'rechazada'; // default: 'pendiente'
}
```

### UpdatePeticionesUbicacionDto
```typescript
{
  old_ubicacion?: [number, number];
  new_ubicacion?: [number, number];
  id_cliente?: string;
  id_usuario?: string;
  id_ruta?: string;
  estado?: 'pendiente' | 'aceptada' | 'rechazada';
  esAprobado: boolean;  // Si es true, actualiza la ubicación del cliente
}
```

### GetPeticionesUbicacionDto
```typescript
{
  estado?: 'pendiente' | 'aceptada' | 'rechazada';
  id_cliente?: string;
  id_ruta?: string;
  id_empresa?: string;
  fecha_desde?: string;  // ISO 8601
  fecha_hasta?: string;  // ISO 8601
}
```

### PeticionesUbicacionEntity
```typescript
{
  id: string;
  old_ubicacion: [number, number];
  new_ubicacion: [number, number];
  estado: 'pendiente' | 'aceptada' | 'rechazada';
  fecha_solicitud: Date;
  fecha_actualizacion: Date;
  cobrador: { id: string, nombre: string };
  cliente: { id: string, nombre: string, alias: string };
  ruta: { id: string, nombre: string };
  empresa: { id: string, nombre: string };
}
```

## Reglas de Negocio

### Validación de Coordenadas
- Las coordenadas deben ser arrays de exactamente 2 números: `[longitud, latitud]`
- Longitud debe estar entre -180 y 180
- Latitud debe estar entre -90 y 90

### Estados y Transiciones
- Estados posibles: `pendiente`, `aceptada`, `rechazada`
- Transiciones permitidas:
  - `pendiente` → `aceptada`
  - `pendiente` → `rechazada`
- Una vez en `aceptada` o `rechazada`, no se puede cambiar de estado

### Restricciones
1. **Un cliente no puede tener más de una solicitud pendiente** al mismo tiempo
2. **Actualización de ubicación del cliente**: Cuando una solicitud se marca como `aceptada` y `esAprobado: true`, se actualiza automáticamente la ubicación del cliente con las nuevas coordenadas
3. **Control de acceso por roles**:
   - Crear: `superAdmin`, `admin`, `cobrador`, `supervisor`
   - Actualizar: `superAdmin`, `admin`, `supervisor`
   - Eliminar: `superAdmin`, `admin`

## Ejemplos de Uso

### Crear una solicitud
```bash
curl -X POST /api/peticiones-ubicacion \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "new_ubicacion": [-90.5125, 14.6351],
    "id_cliente": "507f1f77bcf86cd799439011"
  }'
```

### Listar solicitudes pendientes
```bash
curl -X GET "/api/peticiones-ubicacion?estado=pendiente" \
  -H "Authorization: Bearer <token>"
```

### Aprobar una solicitud
```bash
curl -X PATCH /api/peticiones-ubicacion/507f1f77bcf86cd799439011 \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{
    "estado": "aceptada",
    "esAprobado": true
  }'
```

## Códigos de Error Comunes

| Código | Descripción |
|--------|-------------|
| 400 | - El cliente ya tiene una solicitud pendiente<br>- Coordenadas inválidas<br>- Transición de estado no permitida<br>- ID inválido |
| 401 | No autenticado (token faltante o inválido) |
| 403 | Rol no autorizado para la operación |
| 404 | Solicitud no encontrada |
| 500 | Error interno del servidor |

## Documentación Swagger/OpenAPI
La especificación completa OpenAPI 3.0 está disponible en [`peticiones-ubicacion-swagger.yaml`](./peticiones-ubicacion-swagger.yaml).

Puedes visualizarla usando herramientas como:
- [Swagger Editor](https://editor.swagger.io/)
- [Redoc](https://redocly.github.io/redoc/)
- Postman (importar como OpenAPI)

## Cambios Recientes
- **Versión 1.0.0** (2024-01-15): Implementación inicial del módulo de peticiones de ubicación
- **Características incluidas**:
  - CRUD completo para solicitudes de cambio de ubicación
  - Validación de coordenadas geográficas
  - Control de transiciones de estado
  - Integración con autenticación JWT y control de roles
  - Actualización automática de ubicación del cliente al aprobar solicitud