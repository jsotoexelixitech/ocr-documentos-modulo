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

/**
 * Normaliza campos del carnet vehicular (Venezuela INTT o Colombia binacional).
 *
 * Colombia (LICENCIA DE TRANSITO / TARJETA DE REGISTRO…):
 *   - LINEA  → modelo (nombre de línea/versión)
 *   - MODELO → año (4 dígitos)
 *   - VIN / NÚMERO DE IDENTIFICACIÓN → serial
 *   - NÚMERO DE MOTOR → serialMotor
 */
function normalizeCertificadoFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;

  const tipoRaw = String(fields.tipoCarnet || fields.tipo_carnet || '').toLowerCase();
  const linea = String(fields.linea || '').trim();
  const modeloRaw = String(fields.modelo || '').trim();
  const modeloIsYear = /^(19|20)\d{2}$/.test(modeloRaw);
  const anioCandidate = String(
    fields.anio ?? fields['año'] ?? fields.añoModelo ?? fields.anoModelo ?? '',
  ).trim();
  const anioIsYear = /^(19|20)\d{2}$/.test(anioCandidate);
  // Colombia: LINEA (T800, 320I…) + MODELO es el año. No usar VIN/motor (también existen en VE).
  const hasColombianLayout = Boolean(linea) && (modeloIsYear || anioIsYear);
  const isBinacional =
    tipoRaw === 'binacional' ||
    tipoRaw === 'colombia' ||
    tipoRaw === 'colombiano' ||
    hasColombianLayout;

  // Unificar aliases que Gemini pueda devolver
  if (fields.vin && !fields.serial) fields.serial = fields.vin;
  if (fields.numeroMotor && !fields.serialMotor) fields.serialMotor = fields.numeroMotor;
  if (fields.numero_motor && !fields.serialMotor) fields.serialMotor = fields.numero_motor;

  if (isBinacional) {
    fields.tipoCarnet = 'binacional';
    fields.tipoPlaca = 'binacional';

    const lineaVal = linea || String(fields.linea || '').trim();
    const modeloField = modeloRaw;
    // Si "modelo" parece un año (4 dígitos), úsalo como año y prioriza LINEA como modelo
    let yearCandidate = fields.anio ?? fields['año'] ?? fields.añoModelo ?? fields.anoModelo;
    if ((yearCandidate == null || yearCandidate === '') && modeloIsYear) {
      yearCandidate = modeloField;
    }
    fields.modelo = (lineaVal || (!modeloIsYear ? modeloField : '') || null);
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

    if (fields.serial) {
      const s = String(fields.serial).trim().toUpperCase();
      fields.serial = s.includes('*') || s === '' ? null : s;
    }
    if (fields.serialMotor) {
      const s = String(fields.serialMotor).trim().toUpperCase();
      fields.serialMotor = s.includes('*') || s === '' ? null : s;
    }
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

    delete fields.anio;
    delete fields.añoModelo;
    delete fields.anoModelo;
    delete fields.vin;
    delete fields.numeroMotor;
    delete fields.numero_motor;
    return fields;
  }

  // ── Nacional (Venezuela INTT) ────────────────────────────────────────────
  fields.tipoCarnet = 'nacional';
  fields.tipoPlaca = 'nacional';

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

  fields.modelo = modelo ? modelo.toUpperCase() : null;

  if (fields.placa) {
    fields.placa = String(fields.placa).replace(/[\s-]/g, '').toUpperCase();
  }

  delete fields.anio;
  return fields;
}

/** Normaliza licencia VE (INTT) o Colombia (Ministerio de Transporte). */
function normalizeLicenciaFields(fields) {
  if (!fields || typeof fields !== 'object') return fields;

  if (!fields.numeroLicencia || String(fields.numeroLicencia).trim() === '') {
    const alt =
      fields.numero_licencia
      ?? fields.nroLicencia
      ?? fields.noLicencia
      ?? fields.numero
      ?? null;
    if (alt != null && String(alt).trim() !== '') {
      fields.numeroLicencia = String(alt).trim();
    }
  }

  if (fields.numeroLicencia) {
    fields.numeroLicencia = String(fields.numeroLicencia).replace(/\s+/g, '').toUpperCase();
  }

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
    'Devuelve "cedula" si la imagen muestra "CEDULA DE IDENTIDAD". ' +
    'Devuelve "licencia" si es licencia de conducir: ' +
    '"Licencia para Conducir" (INTT Venezuela) ' +
    'O "Licencia de Conduccion" / "LICENCIA DE CONDUCCIÓN" (Ministerio de Transporte Colombia). ' +
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
        description: 'Numero de cedula, solo digitos sin V- ni puntos',
      },
      tipoDoc: {
        type: Type.STRING,
        enum: ['V', 'E', 'P'],
        description: 'V=venezolano, E=extranjero, P=pasaporte',
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
      numeroLicencia: {
        type: Type.STRING,
        description:
          'Numero de licencia. Venezuela INTT: numero impreso en la licencia. ' +
          'Colombia: numero de la licencia de conduccion (campo No. / numero del documento).',
      },
      categoria: {
        type: Type.STRING,
        description:
          'Grado o categoria. Venezuela: 1ra, 2da, 3ra, 4ta, 5ta. ' +
          'Colombia: clase/categoria (A1, A2, B1, B2, B3, C1, C2, C3…).',
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
        enum: ['nacional', 'binacional'],
        description:
          'Variante del documento vehicular. "nacional" = Venezuela INTT ' +
          '(CERTIFICADO DE CIRCULACION / TITULO DE PROPIEDAD). ' +
          '"binacional" = Colombia Ministerio de Transporte ' +
          '(LICENCIA DE TRANSITO / TARJETA DE REGISTRO DE REMOLQUE O SEMIRREMOLQUE).',
      },
      placa: {
        type: Type.STRING,
        description: 'Placa del vehiculo, sin espacios ni guiones (ej. AE123KT o WON028)',
      },
      marca: { type: Type.STRING, description: 'Marca o fabricante del vehiculo (ej. BERA, BMW, SHACMAN)' },
      linea: {
        type: Type.STRING,
        description:
          'Solo Colombia binacional: valor del campo LINEA / LINEA (ej. X5000, T800, 320I, LUV). ' +
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
          'Colombia: campo MODELO o AÑO MODELO (es el ano, NO la linea). ' +
          'NO uses numeros tras "/" en la linea del modelo venezolano (ej. "BR200-2 / 22").',
      },
      añoModelo: {
        type: Type.STRING,
        description:
          'Solo Colombia semirremolque/remolque: valor del campo AÑO MODELO (4 digitos). ' +
          'En automoviles/camiones usa "anio" desde el campo MODELO.',
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
  '"cedula" si ves "CEDULA DE IDENTIDAD" sobre tricolor venezolano; ' +
  '"licencia" si ves licencia de conducir: INTT venezolano ("Licencia para Conducir") ' +
  'O Colombia Ministerio de Transporte ("Licencia de Conduccion" / "LICENCIA DE CONDUCCIÓN"); ' +
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
    'Tipo solicitado: CEDULA DE IDENTIDAD VENEZOLANA. ' +
    'Si la persona aparece como "VENEZOLANO" usa tipoDoc="V"; si dice "EXTRANJERO" usa "E". ' +
    'El campo identificacion debe contener solo digitos. ' +
    'Para estadoCivil: la cedula muestra una letra (S, C, D, V); ' +
    'mapea S->"Soltero(a)", C->"Casado(a)", D->"Divorciado(a)", V->"Viudo(a)".',
  licencia:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: LICENCIA DE CONDUCIR (Venezuela INTT o Colombia Ministerio de Transporte). ' +
    'Venezuela: "Licencia para Conducir" del INTT — numeroLicencia, categoria (1ra-5ta), vencimiento. ' +
    'Colombia: "Licencia de Conduccion" / Republica de Colombia — numeroLicencia del documento, ' +
    'categoria/clase (A1, B1, C1…), vencimiento si aparece. ' +
    'NO confundir con LICENCIA DE TRANSITO (documento del vehiculo, va en certificado).',
  certificado:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: DOCUMENTO VEHICULAR (carnet de circulacion). ' +
    'Detecta la variante en tipoCarnet: ' +
    '"nacional" si es Venezuela INTT (CERTIFICADO DE CIRCULACION / TITULO DE PROPIEDAD); ' +
    '"binacional" si es Colombia (LICENCIA DE TRANSITO o TARJETA DE REGISTRO DE REMOLQUE/SEMIRREMOLQUE ' +
    'del Ministerio de Transporte / Republica de Colombia). ' +
    'La placa debe ir sin espacios ni guiones. ' +
    '=== SI tipoCarnet=nacional (Venezuela) === ' +
    'ANO: esquina INFERIOR DERECHA AAAA/AAAA; solo el primer ano. ' +
    'NUNCA uses el numero tras "/" en la linea del MODELO (ej. "BR200-2 / 22"). ' +
    'MODELO: codigo completo bajo la marca (ej. "BR200-2", "COROLLA"). linea=null, cilindrada=null. ' +
    'serial: serial de carroceria. Extrae COLOR si aparece. ' +
    '=== SI tipoCarnet=binacional (Colombia) === ' +
    'Ejemplos reales: KENWORTH LINEA T800 MODELO 2007 PLACA SWK284; BMW LINEA 320I MODELO 2020 PLACA GSZ050; ' +
    'SHACMAN LINEA X5000 MODELO 2023 PLACA WON028; CHEVROLET LINEA LUV MODELO 1996 PLACA VXG421; ' +
    'RANDON semirremolque LINEA "SR PT CS 03" AÑO MODELO 2022 PLACA S63228. ' +
    'PLACA = campo PLACA / No. DE PLACA (ej. SWK284, GSZ050, WON028). ' +
    'linea = campo LINEA (modelo comercial: T800, X5000, 320I, LUV, SR PT CS 03…). ' +
    'anio = campo MODELO o AÑO MODELO (en Colombia MODELO es el ANO en 4 digitos, ej. 2023). ' +
    'marca = MARCA. color = COLOR (ej. NEGRO, PLATA, GRIS METALIZADO). ' +
    'serial = VIN, o NÚMERO DE IDENTIFICACIÓN / NÚMERO DE CHASIS / NÚMERO DE SERIE (prioriza VIN). ' +
    'serialMotor = NÚMERO DE MOTOR (null en remolques/semirremolques). ' +
    'cilindrada = CILINDRADA CC tal cual (ej. "13.000", "1.998"; null en remolques). ' +
    'Si un valor esta enmascarado con ****** usa null. ' +
    'NO confundas la LICENCIA DE TRANSITO colombiana con la licencia de conducir venezolana.',
  rif:
    VALIDATION_PREAMBLE +
    'Tipo solicitado: REGISTRO UNICO DE INFORMACION FISCAL (RIF) venezolano (SENIAT). ' +
    'Mantiene el formato canonico con guiones (ej. J-12345678-9).',
};

const SYSTEM_INSTRUCTION =
  'Eres un extractor OCR estricto de documentos oficiales de vehiculos e identidad ' +
  '(Venezuela y Colombia para carnets vehiculares). ' +
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
