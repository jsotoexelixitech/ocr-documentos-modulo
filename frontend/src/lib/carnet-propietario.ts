type CertTomadorOcr = {
  nombre?: string;
  apellido?: string;
  identificacion?: string;
  tipoDoc?: string;
  propietario?: string;
  propietarioNombre?: string;
  propietarioApellido?: string;
  propietarioIdentificacion?: string;
  identificacionPropietario?: string;
  tipoDocPropietario?: string;
};

export function splitColombianOwnerName(full: string): { nombre: string; apellido: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombre: '', apellido: '' };
  if (parts.length === 1) return { nombre: '', apellido: parts[0] };
  const mid = Math.floor(parts.length / 2);
  return {
    apellido: parts.slice(0, mid).join(' '),
    nombre: parts.slice(mid).join(' '),
  };
}

export function extractTomadorFromCertificado(cert?: CertTomadorOcr | null): {
  nombre: string;
  apellido: string;
  identificacion: string;
  tipoDoc: string;
} | null {
  if (!cert) return null;

  let nombre = cert.nombre || cert.propietarioNombre || '';
  let apellido = cert.apellido || cert.propietarioApellido || '';

  if (!nombre && !apellido && cert.propietario) {
    const split = splitColombianOwnerName(cert.propietario);
    apellido = split.apellido;
    nombre = split.nombre;
  }

  const identificacion = String(
    cert.identificacion
    || cert.propietarioIdentificacion
    || cert.identificacionPropietario
    || '',
  ).replace(/\D/g, '');

  if (!nombre && !apellido && !identificacion) return null;

  let tipoDoc = cert.tipoDoc || 'E';
  if (cert.tipoDocPropietario) {
    const u = cert.tipoDocPropietario.toUpperCase();
    if (u.includes('NIT') || u === 'J') tipoDoc = 'J';
    else tipoDoc = 'E';
  }

  return { nombre, apellido, identificacion, tipoDoc };
}
