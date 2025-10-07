function convertirFechaStringAFechaObjeto(fechaString: string): Date {
    const [dia, mes, anio] = fechaString.split('/').map(Number);
    // Nota: El mes en JavaScript es 0-indexed, por lo que restamos 1 al mes.
    return new Date(anio, mes - 1, dia)
}

export default convertirFechaStringAFechaObjeto;