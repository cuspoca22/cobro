export const getFormattedDate = (pais?: string, fecha?: string): string => {
    // Validar y establecer timezone
    const timeZone = pais ? `America/${pais}` : 'UTC';
  
    // Crear la fecha según el parámetro o la fecha actual
    const date = fecha ? new Date(fecha) : new Date();
  
    // Validar que la fecha sea válida
    if (isNaN(date.getTime())) {
      throw new Error(`La fecha proporcionada (${fecha}) no es válida.`);
    }
  
    // Formatear la fecha
    return date.toLocaleDateString('es-CO', {
      timeZone,
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
  };