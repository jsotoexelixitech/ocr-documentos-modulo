import { normalizeIdentificacionDigits, inferTipoDocFromRaw } from './identificacion';

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

export function splitOwnerName(full: string, order: 'nombre_first' | 'apellido_first' = 'nombre_first'): { nombre: string; apellido: string } {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { nombre: '', apellido: '' };
  if (parts.length === 1) return { nombre: '', apellido: parts[0] };
  const mid = Math.floor(parts.length / 2);
  const firstHalf = parts.slice(0, mid).join(' ');
  const secondHalf = parts.slice(mid).join(' ');
  
  if (order === 'nombre_first') {
    return { nombre: firstHalf, apellido: secondHalf };
  } else {
    return { apellido: firstHalf, nombre: secondHalf };
  }
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
    const isColombian = cert.tipoDocPropietario?.toUpperCase().includes('CC') || cert.tipoDocPropietario?.toUpperCase().includes('CE');
    const split = splitOwnerName(cert.propietario, isColombian ? 'apellido_first' : 'nombre_first');
    apellido = split.apellido;
    nombre = split.nombre;
  }

  const identificacion = normalizeIdentificacionDigits(
    cert.identificacion
    || cert.propietarioIdentificacion
    || cert.identificacionPropietario,
  );

  if (!nombre && !apellido && !identificacion) return null;

  let tipoDoc =
    cert.tipoDoc
    || inferTipoDocFromRaw(cert.identificacion)
    || inferTipoDocFromRaw(cert.identificacionPropietario)
    || 'V';
  if (cert.tipoDocPropietario) {
    const u = cert.tipoDocPropietario.toUpperCase();
    if (u.includes('NIT') || u === 'J') tipoDoc = 'J';
    else if (u.includes('CE') || u === 'E') tipoDoc = 'E';
    else if (u.includes('CC')) tipoDoc = 'E';           // Cédula Colombia → extranjero en VE
    else if (u === 'V' || u.includes('C.I') || u.includes('CI')) tipoDoc = 'V'; // Venezolano
  }

  return { nombre, apellido, identificacion, tipoDoc };
}
