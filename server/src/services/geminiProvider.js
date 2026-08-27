/**
 * Gemini OCR provider — versión pro con fallback automático y reintentos.
 *
 * Estrategia para garantizar lectura al 100 %:
 *   1. Intenta primero con el modelo más capable (`gemini-2.5-pro` por default).
 *   2. Si falla por error transitorio (5xx, rate limit, timeout) reintenta 2x
 *      con backoff exponencial.
 *   3. Si falla de forma permanente o el resultado no tiene campos críticos,
 *      cae al siguiente modelo de la cadena: pro → flash → flash-lite.
 *   4. Solo declara fallo si TODOS los modelos de la cadena fallan.
 *
 * Variables de entorno:
 *   GEMINI_API_KEY   Requerido.
 *   GEMINI_MODEL     Opcional. Modelo principal. Default: gemini-2.5-pro.
 *   GEMINI_MODELS    Opcional. Cadena CSV de fallback. Default:
 *                    "gemini-2.5-pro,gemini-2.5-flash,gemini-2.5-flash-lite".
 *   GEMINI_MAX_RETRIES Opcional. Reintentos por modelo. Default: 2.
 */

const fs = require('fs/promises');
const { GoogleGenAI, Type } = require('@google/genai');

const DEFAULT_PRIMARY_MODEL = 'gemini-2.5-pro';
const DEFAULT_FALLBACK_CHAIN = [
  'gemini-2.5-pro',
  'gemini-2.5-flash',
  'gemini-2.5-flash-lite',
];

const SUPPORTED_MIME = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
  'application/pdf',
]);

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY no esta configurado en .env');
  }
  cachedClient = new GoogleGenAI({ apiKey });
  return cachedClient;
}

/**
 * Cadena de modelos a intentar en orden. Si el usuario configuró GEMINI_MODEL
 * lo ponemos primero y dejamos los demás como respaldo. GEMINI_MODELS lo
 * sobreescribe completamente si está definido.
 */
function getModelChain() {
  const explicit = process.env.GEMINI_MODELS;
  if (explicit) {
    return explicit.split(',').map(s => s.trim()).filter(Boolean);
  }
  const primary = process.env.GEMINI_MODEL || DEFAULT_PRIMARY_MODEL;
  const chain = [primary];
  for (const m of DEFAULT_FALLBACK_CHAIN) {
    if (!chain.includes(m)) chain.push(m);
  }
  return chain;
}

/**
 * Indica si un error es transitorio y merece reintento (5xx, rate limit,
 * timeout, abort). Usamos heurística porque @google/genai no expone códigos
 * estandarizados.
 */
function isTransientError(err) {
  if (!err) return false;
  const msg = String(err.message || err.toString()).toLowerCase();
  if (err.code === 'ETIMEDOUT' || err.code === 'ECONNRESET' || err.code === 'ECONNABORTED') return true;
  if (err.status >= 500 && err.status < 600) return true;
  if (err.status === 429 || msg.includes('rate limit') || msg.includes('quota') || msg.includes('exceeded')) return true;
  if (msg.includes('timeout') || msg.includes('aborted') || msg.includes('temporarily') || msg.includes('unavailable')) return true;
  return false;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Gemini a veces devuelve la palabra "NULL" como string en vez de null JSON. */
function isNullishOcrValue(value) {
  if (value == null) return true;
  const s = String(value).trim();
  if (!s) return true;
  const u = s.toUpperCase();
  return u === 'NULL' || u === 'N/A' || u === 'NA' || u === 'NONE' || u === 'ND' || u === 'N/D';
}

function sanitizeOcrString(value) {
  if (isNullishOcrValue(value)) return null;
  return String(value).trim();
}

function sanitizeVinOrMotor(value) {
  const s = sanitizeOcrString(value);
  if (!s) return null;
  const u = s.toUpperCase();
  return u.includes('*') ? null : u;
}

/** Placa INTT Venezuela (ej. AC124KB) — no confundir con Colombia (SWK284). */
function looksLikeVePlacaNacional(placa) {
  const p = String(placa || '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return false;
  return /^[A-Z]{2}\d{3}[A-Z]{2}$/.test(p) || /^[A-Z]{2}\d{5}$/.test(p);
}

function looksLikeCoPlaca(placa) {
  const p = String(placa || '').replace(/[\s-]/g, '').toUpperCase();
  if (!p) return false;
  return /^[A-Z]{3}\d{2,3}[A-Z]?$/.test(p);
}

/** PROPIETARIO: APELLIDO(S) Y NOMBRE(S) — Colombia licencia de tránsito. */
function splitColombianOwnerName(full) {
  const parts = String(full || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { apellido: '', nombre: '' };
  if (parts.length === 1) return { apellido: parts[0], nombre: '' };
  const mid = Math.floor(parts.length / 2);
  return {
    apellido: parts.slice(0, mid).join(' '),
    nombre: parts.slice(mid).join(' '),
  };
}

function mapColombianOwnerDocType(raw) {
  const u = String(raw || 'CC').toUpperCase().replace(/\./g, '').trim();
  if (u.includes('NIT') || u === 'J') return 'J';
  // Cédula colombiana en flujo VE → extranjero
  return 'E';
}

function mapVenezuelanOwnerDocType(raw) {
  const u = String(raw || '').toUpperCase().replace(/\./g, '').trim();
  if (u.includes('NIT') || u === 'J') return 'J';
  if (u.includes('E') || u.includes('EXTRANJ')) return 'E';
  return 'V';
}

function normalizeIdentificacionDigits(raw) {
  return String(raw ?? '').replace(/\D/g, '');
}

function isColombianIdentityDoc(fields) {
  if (!fields || typeof fields !== 'object') return false;
  const pais = String(fields.paisEmisor || fields.paisDocumento || '').toUpperCase();
  if (pais === 'CO' || pais.includes('COLOMB')) return true;
  const tipo = String(fields.tipoDoc || '').toUpperCase();
  if (tipo === 'E' || tipo === 'CC' || tipo === 'CE') return true;
  const hint = [
    fields.documentoEmisor,
    fields.tituloDocumento,
    fields.nacionalidad,
  ]
    .filter(Boolean)
    .join(' ')
    .toUpperCase();
  return hint.includes('COLOMB') || hint.includes('CIUDADAN');
}

function normalizeCedulaFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const raw = fields.identificacion ?? fields.cedula ?? fields.numeroDocumento ?? fields.numero;
  const digits = normalizeIdentificacionDigits(raw);
  if (digits) fields.identificacion = digits;
  if (!fields.tipoDoc && raw) {
    const m = String(raw).trim().toUpperCase().match(/^([VEJP])[-\s.]*\d/);
    if (m) fields.tipoDoc = m[1] === 'P' ? 'P' : m[1];
  }
  if (isColombianIdentityDoc(fields)) {
    fields.tipoDoc = 'E';
    fields.paisEmisor = 'CO';
  } else if (!fields.tipoDoc && digits) {
    fields.tipoDoc = 'V';
  }
  delete fields.paisDocumento;
  delete fields.documentoEmisor;
  delete fields.tituloDocumento;
  delete fields.nacionalidad;
  delete fields.numero;
  return fields;
}

function normalizeLicenciaFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;
  const raw = fields.numeroLicencia ?? fields.numero ?? fields.numeroDocumento;
  if (raw != null && !isNullishOcrValue(raw)) {
    fields.numeroLicencia = String(raw).replace(/\s+/g, '').trim();
  }
  delete fields.numero;
  delete fields.numeroDocumento;
  return fields;
}

function mapOwnerFromCarnet(fields, mapDocType, order = 'apellido_first') {
  const ownerRaw = fields.propietario || fields.propietarioCompleto;
  if (ownerRaw && !isNullishOcrValue(ownerRaw)) {
    const parts = String(ownerRaw).trim().split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      const mid = Math.floor(parts.length / 2);
      const firstHalf = parts.slice(0, mid).join(' ');
      const secondHalf = parts.slice(mid).join(' ');
      
      if (order === 'nombre_first') {
        fields.propietarioNombre = firstHalf;
        fields.propietarioApellido = secondHalf;
      } else {
        fields.propietarioApellido = firstHalf;
        fields.propietarioNombre = secondHalf;
      }
      
      fields.apellido = fields.propietarioApellido;
      fields.nombre = fields.propietarioNombre;
    } else if (parts.length === 1) {
      fields.apellido = parts[0];
    }
  }

  let idRaw =
    fields.identificacionPropietario
    || fields.propietarioIdentificacion
    || fields.identificacion;
  if (idRaw != null && !isNullishOcrValue(idRaw)) {
    const digits = normalizeIdentificacionDigits(idRaw);
    if (digits) {
      fields.propietarioIdentificacion = digits;
      fields.identificacion = digits;
    }
  }

  if (fields.identificacion || fields.nombre || fields.apellido) {
    fields.tipoDoc = mapDocType(fields.tipoDocPropietario || fields.tipoDoc);
  }
}

function mapPropietarioFromBinacionalCarnet(fields) {
  const ownerRaw = fields.propietario || fields.propietarioCompleto;
  if (ownerRaw && !isNullishOcrValue(ownerRaw)) {
    const { apellido, nombre } = splitColombianOwnerName(ownerRaw);
    fields.propietarioApellido = apellido;
    fields.propietarioNombre = nombre;
    fields.apellido = apellido;
    fields.nombre = nombre;
  }

  let idRaw =
    fields.identificacionPropietario
    || fields.propietarioIdentificacion
    || fields.identificacion;
  if (idRaw != null && !isNullishOcrValue(idRaw)) {
    const digits = normalizeIdentificacionDigits(idRaw);
    if (digits) {
      fields.propietarioIdentificacion = digits;
      fields.identificacion = digits;
    }
  }

  if (fields.identificacion || fields.nombre || fields.apellido) {
    fields.tipoDoc = mapColombianOwnerDocType(fields.tipoDocPropietario || fields.tipoDoc);
  }
}

function mapPropietarioFromNacionalCarnet(fields) {
  mapOwnerFromCarnet(fields, mapVenezuelanOwnerDocType, 'nombre_first');
}

/** Documento colombiano (Licencia de Tránsito) → placa extranjera, no binacional. */
function isExtranjeroCarnetColombia(fields, tipoRaw, placaNorm, hasLinea) {
  if (tipoRaw === 'extranjero') return true;
  if (tipoRaw === 'colombia' || tipoRaw === 'colombiano') return true;
  if (looksLikeCoPlaca(placaNorm)) return true;
  return Boolean(
    hasLinea
    && (fields.cilindrada != null || fields.vin || fields.numeroMotor || fields.serialMotor),
  );
}

/**
 * Mapeo de campos Licencia de Tránsito Colombia (LINEA→modelo, MODELO→año, etc.).
 * Usado en flujo extranjero (vehículo/documento colombiano).
 */
function applyColombiaTransitDocMapping(fields) {
  const linea = String(fields.linea || '').trim();
  const modeloRaw = String(fields.modelo || '').trim();
  const modeloIsYear = /^(19|20)\d{2}$/.test(modeloRaw);
  let yearCandidate = fields.anio ?? fields['año'];
  if ((yearCandidate == null || yearCandidate === '') && modeloIsYear) {
    yearCandidate = modeloRaw;
  }
  fields.modelo = (linea || (!modeloIsYear ? modeloRaw : '') || null);
  if (fields.modelo) fields.modelo = String(fields.modelo).toUpperCase();

  if (yearCandidate != null && yearCandidate !== '') {
    const yearStr = String(yearCandidate).match(/(?:19|20)\d{2}/)?.[0];
    const añoNum = yearStr ? parseInt(yearStr, 10) : NaN;
    const maxYear = new Date().getFullYear() + 1;
    fields['año'] =
      Number.isFinite(añoNum) && añoNum >= 1980 && añoNum <= maxYear
        ? String(añoNum)
        : null;
  }

  fields.serial = sanitizeVinOrMotor(fields.serial);
  fields.serialMotor = sanitizeVinOrMotor(fields.serialMotor);
  if (isNullishOcrValue(fields.modelo)) fields.modelo = null;
  if (fields.cilindrada != null && fields.cilindrada !== '') {
    fields.cilindrada = String(fields.cilindrada).trim();
  } else {
    fields.cilindrada = null;
  }
  if (fields.placa) {
    fields.placa = String(fields.placa).replace(/[\s-]/g, '').toUpperCase();
  }
  if (fields.marca) fields.marca = String(fields.marca).trim().toUpperCase();
  if (fields.color) {
    const c = String(fields.color).trim();
    fields.color = c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : null;
  }

  mapPropietarioFromBinacionalCarnet(fields);

  delete fields.anio;
  delete fields.vin;
  delete fields.numeroMotor;
  delete fields.numero_motor;
}

/**
 * Normaliza campos del carnet vehicular.
 * - nacional: Venezuela INTT
 * - extranjero: Colombia (Licencia de Tránsito) → tipoPlaca extranjera
 * - binacional: vehículo venezolano hacia Colombia (no confundir con docs CO)
 */
function normalizeCertificadoFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;

  for (const key of ['marca', 'modelo', 'linea', 'placa', 'serial', 'serialMotor', 'color', 'cilindrada', 'vin', 'numeroMotor', 'numero_motor']) {
    if (key in fields && isNullishOcrValue(fields[key])) fields[key] = null;
  }

  const tipoRaw = String(fields.tipoCarnet || fields.tipo_carnet || '').toLowerCase();
  const hasLinea = Boolean(sanitizeOcrString(fields.linea));
  const placaNorm = String(fields.placa || '').replace(/[\s-]/g, '').toUpperCase();

  if (fields.vin && !fields.serial) fields.serial = fields.vin;
  if (fields.numeroMotor && !fields.serialMotor) fields.serialMotor = fields.numeroMotor;
  if (fields.numero_motor && !fields.serialMotor) fields.serialMotor = fields.numero_motor;

  const isExtranjero = isExtranjeroCarnetColombia(fields, tipoRaw, placaNorm, hasLinea);
  const isBinacional = !isExtranjero && tipoRaw === 'binacional';

  if (isExtranjero) {
    fields.tipoCarnet = 'extranjero';
    fields.tipoPlaca = 'extranjera';
    applyColombiaTransitDocMapping(fields);
    return fields;
  }

  if (isBinacional) {
    fields.tipoCarnet = 'binacional';
    fields.tipoPlaca = 'binacional';
    applyColombiaTransitDocMapping(fields);
    return fields;
  }

  // ── Nacional (Venezuela INTT) ────────────────────────────────────────────
  fields.tipoCarnet = 'nacional';
  fields.tipoPlaca = 'nacional';

  const modeloRaw = String(fields.modelo || '');
  let yearRaw = fields.anio ?? fields['año'];

  if (yearRaw != null && yearRaw !== '') {
    let yearStr = String(yearRaw).trim();

    const dualYear = yearStr.match(/^((?:19|20)\d{2})\s*\/\s*((?:19|20)\d{2})$/);
    if (dualYear) {
      yearStr = dualYear[1];
    } else {
      const embedded = yearStr.match(/(?:19|20)\d{2}/);
      if (embedded && yearStr.length > 4) {
        yearStr = embedded[0];
      }
    }

    const añoNum = parseInt(yearStr, 10);
    const suffixMatch = modeloRaw.match(/\/\s*(\d{1,2})\s*$/);
    if (suffixMatch) {
      const falseYear = 2000 + parseInt(suffixMatch[1], 10);
      if (añoNum === falseYear) {
        console.warn(
          `[OCR] año ${falseYear} descartado: parece sufijo del modelo "${modeloRaw}"`,
        );
        yearRaw = null;
      }
    }

    const maxYear = new Date().getFullYear() + 1;
    if (
      yearRaw != null &&
      Number.isFinite(añoNum) &&
      añoNum >= 1980 &&
      añoNum <= maxYear
    ) {
      fields['año'] = String(añoNum);
    } else if (yearRaw != null) {
      fields['año'] = null;
    }
  }

  const strippedModelo = modeloRaw.replace(/\s*\/\s*\d{1,2}\s*$/u, '').trim();
  const codeMatch = modeloRaw.match(/\b([A-Za-z]{1,4}\d{2,4}(?:-\d+)?)\b/);
  const fromLine = codeMatch ? codeMatch[1].replace(/\s*\/\s*\d{1,2}\s*$/u, '').trim() : '';

  const geminiModelo = String(fields.modelo || '').trim();
  let modelo = strippedModelo || geminiModelo;
  if (fromLine.length > modelo.length) modelo = fromLine;
  if (geminiModelo.length > modelo.length) modelo = geminiModelo;

  fields.modelo = isNullishOcrValue(modelo) ? null : modelo.toUpperCase();

  if (fields.placa) {
    fields.placa = String(fields.placa).replace(/[\s-]/g, '').toUpperCase();
  }

  fields.serial = sanitizeVinOrMotor(fields.serial);
  fields.serialMotor = sanitizeVinOrMotor(fields.serialMotor);
  if (fields.marca) fields.marca = String(fields.marca).trim().toUpperCase();
  if (fields.color) {
    const c = String(fields.color).trim();
    fields.color = c ? c.charAt(0).toUpperCase() + c.slice(1).toLowerCase() : null;
  }

  mapPropietarioFromNacionalCarnet(fields);

  delete fields.anio;
  delete fields.vin;
  delete fields.numeroMotor;
  delete fields.numero_motor;
  return fields;
}

/**
 * Campos críticos que validamos por tipo de documento. Si están vacíos en la
 * primera respuesta, intentamos con el siguiente modelo de la cadena.
 */
const CRITICAL_FIELDS = {
  cedula:      ['identificacion', 'nombre', 'apellido'],
  licencia:    ['numeroLicencia'],
  certificado: ['placa'],
  rif:         ['rif'],
};

/**
 * Verifica que los campos críticos del resultado estén presentes y no vacíos.
 * Devuelve { ok, missing[] } para diagnóstico.
 */
function validateCriticalFields(docType, fields) {
  const required = CRITICAL_FIELDS[docType] || [];
  const missing = [];
  for (const f of required) {
    const v = fields ? fields[f] : null;
    if (v == null || String(v).trim() === '') missing.push(f);
  }
  return { ok: missing.length === 0, missing };
}

/**
 * Campo de validacion compartido por todos los esquemas.
 * Gemini SIEMPRE debe identificar el tipo de documento real en la imagen,
 * independientemente del slot donde se subio.
 *
 * Headers oficiales que la IA debe reconocer:
 *   - cedula:      "REPUBLICA BOLIVARIANA DE VENEZUELA" + "CEDULA DE IDENTIDAD"
 *   - licencia:    "Licencia para Conducir" + INTT
 *   - certificado: INTT VE ("CERTIFICADO DE CIRCULACION" / "TITULO DE PROPIEDAD")
 *                  O Colombia ("LICENCIA DE TRANSITO" / "TARJETA DE REGISTRO DE REMOLQUE…")
 *   - rif:         "REGISTRO UNICO DE INFORMACION FISCAL" + SENIAT
 */
const DOC_TYPE_PROP = {
  type: Type.STRING,
  enum: ['cedula', 'licencia', 'certificado', 'rif', 'desconocido'],
  description:
    'Tipo de documento DETECTADO en la imagen, INDEPENDIENTE de lo que se haya pedido. ' +
    'Devuelve "cedula" si la imagen es documento de identidad personal: ' +
    '"CEDULA DE IDENTIDAD" (Venezuela) O "CEDULA DE CIUDADANIA" / "REPUBLICA DE COLOMBIA" (Colombia). ' +
    'Devuelve "licencia" si es licencia de conducir: ' +
    '"Licencia para Conducir" (INTT Venezuela) O "Licencia de Conduccion" (Colombia / Ministerio de Transporte). ' +
    'Devuelve "certificado" si es documento vehicular: ' +
    '"CERTIFICADO DE CIRCULACION" / "TITULO DE PROPIEDAD" (INTT Venezuela) ' +
    'O "LICENCIA DE TRANSITO" / "TARJETA DE REGISTRO DE REMOLQUE O SEMIRREMOLQUE" ' +
    '(Republica de Colombia / Ministerio de Transporte). ' +
    'Devuelve "rif" si dice "REGISTRO UNICO DE INFORMACION FISCAL" (SENIAT). ' +
    'Devuelve "desconocido" si no es ninguno de los anteriores.',
};

/**
 * Esquemas de respuesta por tipo de documento.
 */
const SCHEMAS = {
  cedula: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      nombre: { type: Type.STRING, description: 'Primer nombre del titular' },
      apellido: { type: Type.STRING, description: 'Primer apellido del titular' },
      identificacion: {
        type: Type.STRING,
        description:
          'Numero de documento, solo digitos sin prefijo ni puntos. ' +
          'Venezuela: sin V-/E-. Colombia: campo NUMERO (ej. 1007028627).',
      },
      tipoDoc: {
        type: Type.STRING,
        enum: ['V', 'E', 'P'],
        description:
          'V=venezolano, E=extranjero/colombiano (C.C. Colombia), P=pasaporte',
      },
      paisEmisor: {
        type: Type.STRING,
        enum: ['VE', 'CO'],
        description: 'VE=Venezuela, CO=Colombia (Cedula de Ciudadania)',
      },
      fechaNacimiento: {
        type: Type.STRING,
        description: 'Fecha de nacimiento en formato YYYY-MM-DD',
      },
      sexo: {
        type: Type.STRING,
        enum: ['Masculino', 'Femenino'],
      },
      estadoCivil: {
        type: Type.STRING,
        enum: ['Soltero(a)', 'Casado(a)', 'Divorciado(a)', 'Viudo(a)'],
        description:
          'Estado civil del titular. La cedula venezolana lo trae con codigo: ' +
          'S=Soltero(a), C=Casado(a), D=Divorciado(a), V=Viudo(a). ' +
          'Devuelve siempre el valor expandido entre parentesis (ej. "Soltero(a)").',
      },
    },
    required: ['documentoTipo'],
  },

  licencia: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      numeroLicencia: { type: Type.STRING },
      categoria: {
        type: Type.STRING,
        description: 'Grado o categoria (1ra, 2da, 3ra, 4ta, 5ta, A, B, C)',
      },
      vencimiento: {
        type: Type.STRING,
        description: 'Fecha de vencimiento en formato YYYY-MM-DD',
      },
    },
    required: ['documentoTipo'],
  },

  certificado: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      tipoCarnet: {
        type: Type.STRING,
        enum: ['nacional', 'binacional', 'extranjero'],
        description:
          'Variante del documento vehicular. "nacional" = Venezuela INTT ' +
          '(CERTIFICADO DE CIRCULACION / TITULO DE PROPIEDAD). ' +
          '"extranjero" = Colombia Ministerio de Transporte ' +
          '(LICENCIA DE TRANSITO / TARJETA DE REGISTRO DE REMOLQUE O SEMIRREMOLQUE) — placa extranjera. ' +
          '"binacional" = vehiculo venezolano con permiso binacional hacia Colombia (NO es documento colombiano).',
      },
      placa: {
        type: Type.STRING,
        description: 'Placa del vehiculo, sin espacios ni guiones (ej. AE123KT o WON028)',
      },
      marca: { type: Type.STRING, description: 'Marca o fabricante del vehiculo (ej. BERA, BMW, SHACMAN)' },
      linea: {
        type: Type.STRING,
        description:
          'Solo Colombia extranjero: valor del campo LINEA / LINEA (ej. X5000, T800, 320I, LUV). ' +
          'En documentos venezolanos deja null.',
      },
      modelo: {
        type: Type.STRING,
        description:
          'Venezuela: codigo completo del modelo bajo la marca (ej. "BR200-2" desde "BR200-2 / 22"). ' +
          'Colombia: NO pongas aqui el ano; el ano va en "anio". Si no hay LINEA separada, ' +
          'puedes repetir la linea aqui; preferible llenar "linea".',
      },
      anio: {
        type: Type.STRING,
        description:
          'Ano del vehiculo en 4 digitos (ej. "2025"). ' +
          'Venezuela INTT: esquina INFERIOR DERECHA AAAA/AAAA — usa el primer ano. ' +
          'Colombia: campo etiquetado MODELO (es el ano, NO la linea). ' +
          'NO uses numeros tras "/" en la linea del modelo venezolano (ej. "BR200-2 / 22").',
      },
      serial: {
        type: Type.STRING,
        description:
          'VIN / serial de carroceria. Venezuela: serial carroceria. ' +
          'Colombia: campo VIN, o NÚMERO DE IDENTIFICACIÓN / NÚMERO DE CHASIS / NÚMERO DE SERIE. ' +
          'Si aparece enmascarado con ****** devuelve null.',
      },
      serialMotor: {
        type: Type.STRING,
        description:
          'Numero de motor. Colombia: NÚMERO DE MOTOR. Remolques/semirremolques suelen no tenerlo (null). ' +
          'Si aparece ****** devuelve null.',
      },
      cilindrada: {
        type: Type.STRING,
        description:
          'Cilindrada CC tal como aparece (ej. "13.000", "1.998", "2.300"). ' +
          'Solo documentos colombianos con CILINDRADA CC. Remolques: null.',
      },
      color: {
        type: Type.STRING,
        description:
          'Color principal de la carroceria (ej: "Blanco", "Negro", "Plata", "Azul"). ' +
          'Capitaliza la primera letra. Si hay dos colores con "/", usa el primero. ' +
          'Si no aparece, null.',
      },
      propietario: {
        type: Type.STRING,
        description:
          'Nombre completo del propietario. Colombia: PROPIETARIO APELLIDO(S) Y NOMBRE(S). ' +
          'Venezuela INTT: titular en TITULO DE PROPIEDAD / CERTIFICADO DE CIRCULACION.',
      },
      identificacionPropietario: {
        type: Type.STRING,
        description:
          'Cédula del propietario (solo digitos). Colombia: tras C.C. / C.E. ' +
          'Venezuela INTT: C.I. / Cédula / RIF del titular si aparece en el documento.',
      },
      tipoDocPropietario: {
        type: Type.STRING,
        description:
          'Prefijo del documento del propietario (V, E, J, CC, CE, NIT). ' +
          'Venezuela: V o E según C.I.; Colombia: CC, CE o NIT.',
      },
    },
    required: ['documentoTipo', 'tipoCarnet'],
  },

  rif: {
    type: Type.OBJECT,
    properties: {
      documentoTipo: DOC_TYPE_PROP,
      rif: {
        type: Type.STRING,
        description: 'RIF en formato J-XXXXXXXX-X o V-XXXXXXX-X',
      },
      razonSocial: {
        type: Type.STRING,
        description: 'Razon social o nombre completo del contribuyente',
      },
    },
    required: ['documentoTipo'],
  },
};

const VALIDATION_PREAMBLE =
  'PASO 1 (OBLIGATORIO): Identifica el HEADER del documento y devuelve documentoTipo: ' +
  '"cedula" si ves documento de identidad personal: ' +
  '"CEDULA DE IDENTIDAD" (Venezuela) O "CEDULA DE CIUDADANIA" / "REPUBLICA DE COLOMBIA"; ' +
  '"licencia" si ves licencia de conducir: ' +
  '"Licencia para Conducir" (INTT Venezuela) O "Licencia de Conduccion" (Colombia); ' +
  '"certificado" si ves documento de vehiculo: ' +
  '"CERTIFICADO DE CIRCULACION" / "TITULO DE PROPIEDAD" (INTT Venezuela) ' +
  'O "LICENCIA DE TRANSITO" / "TARJETA DE REGISTRO DE REMOLQUE O SEMIRREMOLQUE" ' +
  '(Republica de Colombia / Ministerio de Transporte); ' +
  '"rif" si ves "REGISTRO UNICO DE INFORMACION FISCAL" del SENIAT; ' +
  '"desconocido" en cualquier otro caso. ' +
  'PASO 2: Si y SOLO SI documentoTipo coincide con el tipo solicitado, extrae los demas campos. ' +
  'Si NO coincide, devuelve solamente documentoTipo y deja el resto en null. ' +
  'NUNCA inventes datos para forzar el tipo solicitado. ';

const PROMPTS = {
  cedula:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: DOCUMENTO DE IDENTIDAD PERSONAL (Venezuela o Colombia — flujo RCV extranjero). ' +
    '=== Venezuela === ' +
    'Header "CEDULA DE IDENTIDAD". tipoDoc="V" si VENEZOLANO, "E" si EXTRANJERO. ' +
    '=== Colombia === ' +
    'Header "REPUBLICA DE COLOMBIA" + "CEDULA DE CIUDADANIA". paisEmisor="CO", tipoDoc="E". ' +
    'apellido = campo APELLIDOS; nombre = campo NOMBRES; identificacion = NUMERO (solo digitos). ' +
    'fechaNacimiento si aparece (DD-MM-YYYY o similar → YYYY-MM-DD). ' +
    'El campo identificacion debe contener solo digitos. ' +
    'Para estadoCivil venezolano: S->"Soltero(a)", C->"Casado(a)", D->"Divorciado(a)", V->"Viudo(a)".',
  licencia:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: LICENCIA DE CONDUCIR (Venezuela INTT o Colombia — flujo RCV extranjero). ' +
    '=== Venezuela === "Licencia para Conducir" INTT. ' +
    '=== Colombia === "Licencia de Conduccion" Republica de Colombia / Ministerio de Transporte. ' +
    'numeroLicencia = numero del documento (campo No.). ' +
    'Pon especial atencion a la fecha de vencimiento y al grado o categoria.',
  certificado:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: DOCUMENTO VEHICULAR (carnet de circulacion). ' +
    'Detecta la variante en tipoCarnet: ' +
    '"nacional" si es Venezuela INTT (CERTIFICADO DE CIRCULACION / TITULO DE PROPIEDAD); ' +
    '"extranjero" si es Colombia (LICENCIA DE TRANSITO o TARJETA DE REGISTRO DE REMOLQUE/SEMIRREMOLQUE ' +
    'del Ministerio de Transporte / Republica de Colombia — placa extranjera). ' +
    '"binacional" SOLO si es carnet venezolano INTT con indicacion explicita de permiso binacional ' +
    '(vehiculo venezolano hacia Colombia; NO uses binacional para documentos colombianos). ' +
    'La placa debe ir sin espacios ni guiones. ' +
    '=== SI tipoCarnet=nacional (Venezuela) === ' +
    'ANO: esquina INFERIOR DERECHA AAAA/AAAA; solo el primer ano. ' +
    'NUNCA uses el numero tras "/" en la linea del MODELO (ej. "BR200-2 / 22"). ' +
    'MODELO: codigo completo bajo la marca (ej. "BR200-2"). linea y cilindrada y serialMotor: null. ' +
    'serial: serial de carroceria. Extrae COLOR si aparece. ' +
    'propietario = nombre del titular si aparece en el documento. ' +
    'identificacionPropietario = C.I. / cédula del titular (solo digitos). ' +
    'tipoDocPropietario = V, E o J segun el prefijo del documento. ' +
    '=== SI tipoCarnet=extranjero (Colombia — placa extranjera) === ' +
    'PLACA = campo PLACA / No. DE PLACA. ' +
    'linea = campo LINEA (equivale al modelo comercial: X5000, T800, 320I…). ' +
    'anio = campo MODELO (en Colombia MODELO es el ANO en 4 digitos, ej. 2023). ' +
    'marca = MARCA. color = COLOR si existe. ' +
    'serial = VIN, o NÚMERO DE IDENTIFICACIÓN / NÚMERO DE CHASIS / NÚMERO DE SERIE (prioriza VIN). ' +
    'serialMotor = NÚMERO DE MOTOR (null en remolques/semirremolques). ' +
    'cilindrada = CILINDRADA CC tal cual (ej. "13.000"). ' +
    'propietario = PROPIETARIO APELLIDO(S) Y NOMBRE(S) completo. ' +
    'identificacionPropietario = numero tras C.C. / C.E. (solo digitos). ' +
    'tipoDocPropietario = CC, CE o NIT segun el carnet. ' +
    'Si un valor esta enmascarado con ****** usa null. ' +
    'NO confundas la LICENCIA DE TRANSITO colombiana con la licencia de conducir venezolana.',
  rif:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: REGISTRO UNICO DE INFORMACION FISCAL (RIF) venezolano (SENIAT). ' +
    'Mantiene el formato canonico con guiones (ej. J-12345678-9).',
};

const SYSTEM_INSTRUCTION =
  'Eres un extractor OCR estricto de documentos oficiales de vehiculos e identidad ' +
  '(Venezuela y Colombia: carnets vehiculares, cedulas de ciudadania, licencias de conduccion). ' +
  'SIEMPRE empiezas verificando el header del documento (titulo y emisor) ' +
  'para determinar `documentoTipo`. Devuelve EXCLUSIVAMENTE un JSON con ' +
  'los campos pedidos. Si un campo no es legible o no aparece, usa null. ' +
  'NUNCA inventes datos. NUNCA fuerces datos cuando el documento no coincide ' +
  'con el tipo solicitado. Devuelve fechas en formato YYYY-MM-DD. Responde en espanol.';

/**
 * Llama a Gemini con un modelo específico y reintentos automáticos para errores
 * transitorios (5xx, rate-limit, timeout). Devuelve el JSON parseado o lanza.
 */
async function callGeminiWithRetry(model, docType, base64, mimetype) {
  const ai = getClient();
  const maxRetries = parseInt(process.env.GEMINI_MAX_RETRIES, 10) || 2;
  let lastErr;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const startedAt = Date.now();
      const response = await ai.models.generateContent({
        model,
        contents: [
          {
            role: 'user',
            parts: [
              { text: PROMPTS[docType] },
              { inlineData: { mimeType: mimetype, data: base64 } },
            ],
          },
        ],
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: SCHEMAS[docType],
          temperature: 0.1,
        },
      });

      const elapsedMs = Date.now() - startedAt;
      const rawText = (response && response.text) ? response.text : '';

      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch (parseErr) {
        // JSON inválido también es transitorio — lo reintentamos.
        throw new Error(
          `Gemini devolvio JSON invalido: ${parseErr.message}. Texto: ${rawText.slice(0, 200)}`
        );
      }

      if (docType === 'certificado' && parsed) {
        normalizeCertificadoFields(parsed);
      }
      if (docType === 'cedula' && parsed) {
        normalizeCedulaFields(parsed);
      }
      if (docType === 'licencia' && parsed) {
        normalizeLicenciaFields(parsed);
      }

      return { fields: parsed, elapsedMs, attempt: attempt + 1 };
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries && isTransientError(err)) {
        const backoffMs = 600 * Math.pow(2, attempt) + Math.floor(Math.random() * 300);
        console.warn(
          `[OCR] modelo=${model} intento=${attempt + 1}/${maxRetries + 1} fallo transitorio, ` +
          `reintentando en ${backoffMs}ms — ${err.message}`
        );
        await sleep(backoffMs);
        continue;
      }
      // Error permanente o ya agotamos reintentos.
      throw err;
    }
  }
  throw lastErr;
}

/**
 * Ejecuta el OCR sobre un archivo guardado por multer.
 *
 * Estrategia: itera la cadena de modelos. Para cada modelo intenta hasta
 * GEMINI_MAX_RETRIES veces si hay errores transitorios. Si el resultado
 * carece de campos críticos, baja al siguiente modelo de la cadena.
 *
 * @param {string} filePath  Ruta absoluta al archivo subido.
 * @param {string} mimetype  MIME del archivo.
 * @param {string} docType   cedula | licencia | certificado | rif.
 * @returns {Promise<{fields:object, meta:object}>}
 */
async function extract(filePath, mimetype, docType) {
  if (!SCHEMAS[docType]) {
    throw new Error(`Tipo de documento no soportado por Gemini: ${docType}`);
  }
  if (!SUPPORTED_MIME.has(mimetype)) {
    throw new Error(
      `Formato ${mimetype} no soportado por Gemini OCR. Usa JPG, PNG, WebP o PDF.`
    );
  }

  const buffer = await fs.readFile(filePath);
  const base64 = buffer.toString('base64');

  const chain = getModelChain();
  const overallStart = Date.now();
  const attemptsLog = [];
  let lastErr;

  for (const model of chain) {
    try {
      const r = await callGeminiWithRetry(model, docType, base64, mimetype);
      const validation = validateCriticalFields(docType, r.fields);

      attemptsLog.push({
        model,
        attempts: r.attempt,
        elapsedMs: r.elapsedMs,
        criticalOk: validation.ok,
        missing: validation.missing,
      });

      // Si el documento no coincide con el slot, devolvemos inmediatamente:
      // los campos críticos no aplican porque legítimamente no es ese doc.
      const detectedDocType = r.fields && r.fields.documentoTipo;
      const isMismatch = detectedDocType && detectedDocType !== docType;

      // Si los campos críticos están bien (o el doc no coincide), devolvemos.
      if (validation.ok || isMismatch) {
        return {
          fields: r.fields,
          meta: {
            provider: 'gemini',
            model,
            elapsedMs: Date.now() - overallStart,
            singleCallMs: r.elapsedMs,
            chainAttempts: attemptsLog,
          },
        };
      }

      // Faltan campos críticos pero la llamada terminó OK. Probamos siguiente
      // modelo con la esperanza de que sea más preciso. Si era el último,
      // devolvemos lo que tenemos para no perder la lectura parcial.
      console.warn(
        `[OCR] modelo=${model} resultado incompleto (faltan: ${validation.missing.join(', ')}), ` +
        `intentando siguiente modelo si hay`
      );
      lastErr = new Error(`Campos críticos vacíos: ${validation.missing.join(', ')}`);
    } catch (err) {
      attemptsLog.push({
        model,
        error: err.message,
        transient: isTransientError(err),
      });
      console.error(`[OCR] modelo=${model} fallo: ${err.message}`);
      lastErr = err;
      // Probamos siguiente modelo
    }
  }

  // Si llegamos acá, ningún modelo dio campos críticos completos. Devolvemos
  // el último intento parseable o lanzamos el último error.
  // Buscamos el último intento con fields parseados aunque falten críticos:
  // re-llamamos al primer modelo y devolvemos lo que sea.
  // Para no encarecer, simplemente lanzamos el último error con el log.
  const errorMsg =
    lastErr ? lastErr.message : 'Todos los modelos Gemini fallaron sin error específico';
  const enhancedErr = new Error(
    `OCR fallo en toda la cadena de modelos [${chain.join(' → ')}]: ${errorMsg}`
  );
  enhancedErr.chainAttempts = attemptsLog;
  enhancedErr.totalElapsedMs = Date.now() - overallStart;
  throw enhancedErr;
}

module.exports = { extract, SUPPORTED_MIME, getModelChain };
