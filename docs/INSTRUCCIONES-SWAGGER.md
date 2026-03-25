# Instrucciones para Mostrar Documentación Swagger

## Configuración Completada

He implementado Swagger en el proyecto para documentar el recurso `peticiones-ubicacion`. Los cambios realizados son:

### 1. Dependencias Instaladas
- `@nestjs/swagger`
- `swagger-ui-express`

### 2. Configuración en `src/main.ts`
- Agregada configuración de Swagger con autenticación JWT
- Documentación disponible en `/api/docs`
- **Control por entorno**: Swagger se activa automáticamente en desarrollo y se desactiva en producción (`NODE_ENV=production`)
- **Variable de control**: `ENABLE_SWAGGER=false` para desactivar manualmente

### 3. Decoradores Swagger en el Controlador
- `src/peticiones-ubicacion/peticiones-ubicacion.controller.ts` actualizado con:
  - `@ApiTags('Peticiones Ubicación')`
  - `@ApiBearerAuth('bearerAuth')`
  - `@ApiOperation` para cada endpoint
  - `@ApiResponse` para códigos de estado
  - `@ApiQuery` para parámetros de filtro
  - `@ApiParam` para parámetros de ruta
  - `@ApiBody` para cuerpos de solicitud

### 4. Decoradores Swagger en los DTOs
- `CreatePeticionesUbicacionDto` - con `@ApiProperty` en cada campo
- `UpdatePeticionesUbicacionDto` - con `@ApiProperty` para `esAprobado`
- `GetPeticionesUbicacionDto` - con `@ApiProperty` para filtros

## Cómo Mostrar la Documentación

### Opción 1: Servidor de Desarrollo Local
1. Inicia el servidor de desarrollo:
   ```bash
   npm run start:dev
   ```

2. Abre tu navegador en:
   ```
   http://localhost:3000/api/docs
   ```

### Opción 2: Build y Producción
1. Construye la aplicación:
   ```bash
   npm run build
   ```

2. Inicia el servidor de producción:
   ```bash
   npm run start:prod
   ```

3. Accede a la documentación en:
   ```
   http://localhost:3000/api/docs
   ```
   (Ajusta el puerto según la variable de entorno `PORT`)

## Características de la Documentación

### Autenticación
- La documentación incluye soporte para JWT
- Botón "Authorize" en la esquina superior derecha
- Ingresa tu token Bearer: `Bearer <tu-token-jwt>`

### Endpoints Documentados
1. **POST /api/peticiones-ubicacion** - Crear solicitud
2. **GET /api/peticiones-ubicacion** - Listar solicitudes (con filtros)
3. **GET /api/peticiones-ubicacion/{id}** - Obtener solicitud por ID
4. **PATCH /api/peticiones-ubicacion/{id}** - Actualizar solicitud
5. **DELETE /api/peticiones-ubicacion/{id}** - Eliminar solicitud

### Schemas
- Modelos de datos completos con ejemplos
- Validaciones y restricciones documentadas
- Enums y formatos especificados

## Archivos de Documentación Generados

1. **`docs/peticiones-ubicacion-swagger.yaml`** - Especificación OpenAPI 3.0 completa
2. **`docs/peticiones-ubicacion-README.md`** - Documentación técnica detallada
3. **`docs/INSTRUCCIONES-SWAGGER.md`** - Este archivo

## Pruebas desde Swagger UI

1. **Autentícate** primero usando el botón "Authorize"
2. **Prueba los endpoints** directamente desde la interfaz
3. **Ejemplo de solicitud POST**:
   ```json
   {
     "new_ubicacion": [-90.5125, 14.6351],
     "id_cliente": "507f1f77bcf86cd799439011"
   }
   ```

## Solución de Problemas

### Error: "Cannot find module '@nestjs/swagger'"
- Ejecuta `npm install` para instalar las dependencias

### Error de compilación TypeScript
- Verifica que todos los imports de `@nestjs/swagger` sean correctos
- Asegúrate de que `swagger-ui-express` esté instalado

### La ruta /api/docs no carga
- Verifica que el servidor esté ejecutándose
- Confirma que la configuración en `main.ts` sea correcta
- Revisa los logs del servidor para errores

## Integración con Otros Recursos

La configuración de Swagger está lista para documentar otros recursos del proyecto. Para agregar más módulos:

1. Agrega `@ApiTags('Nombre del Recurso')` al controlador
2. Decora los métodos con `@ApiOperation`, `@ApiResponse`, etc.
3. Agrega `@ApiProperty` a los DTOs correspondientes

## Exportar Documentación

Puedes exportar la especificación OpenAPI desde:
```
http://localhost:3000/api/docs-json
```

Útil para:
- Importar en Postman
- Generar clientes SDK
- Documentación estática con Redoc

---

**Nota**: La documentación Swagger está activa solo en entornos de desarrollo por defecto. Para producción, considera deshabilitarla o protegerla con autenticación adicional.