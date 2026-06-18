const swaggerJsdoc = require('swagger-jsdoc');

const options = {
  definition: {
    openapi: '3.0.3',
    info: {
      title: 'Exelixi · Módulo OCR',
      version: '1.0.0',
      description: `
## Módulo OCR — Lectura inteligente de documentos venezolanos

Analiza y extrae datos de documentos de identidad (cédula, licencia de conducir, certificado de circulación y RIF) usando **Google Gemini 2.5 Pro** con múltiples intentos y fallback automático.

### Flujo de uso
1. El cliente sube el documento via \`multipart/form-data\`.
2. El servidor normaliza la imagen (escala, contraste, orientación).
3. Gemini extrae los campos estructurados.
4. Se devuelve el objeto \`ocr\` con todos los datos detectados.

### Integración con otros módulos
El objeto \`ocr\` del response se usa para **precargar automáticamente** el formulario en **Módulo Formulario** (paso 2).

### Autenticación (OAuth 2.0)
Este módulo está protegido. Debe incluir un **Access Token** en la cabecera HTTP \`Authorization: Bearer <token>\`.
El token se obtiene intercambiando su **API Key** en el endpoint \`/api/access/token\` del servidor central (Nexus API).
      `.trim(),
      contact: {
        name: 'Exelixi / La Mundial de Seguros',
        email: 'soporte@lamundialdeseguros.com',
      },
    },
    servers: [
      { url: 'http://localhost:4001', description: 'Desarrollo local' },
    ],
    tags: [
      { name: 'Documentos', description: 'Subida y análisis OCR de documentos' },
      { name: 'Sistema',    description: 'Estado del servicio' },
    ],
    security: [
      {
        bearerAuth: [],
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Ingrese su Access Token temporal (obtenido desde Nexus API vía /api/access/token)',
        },
      },
      schemas: {
        OcrResult: {
          type: 'object',
          description: 'Campos extraídos del documento por el OCR',
          properties: {
            nombre:         { type: 'string', example: 'JUAN CARLOS' },
            apellido:       { type: 'string', example: 'PEREZ RODRIGUEZ' },
            identificacion: { type: 'string', example: 'V-12345678' },
            tipoDoc:        { type: 'string', enum: ['V','E','J','G','P'], example: 'V' },
            fechaNacimiento:{ type: 'string', format: 'date', example: '1985-06-15' },
            sexo:           { type: 'string', enum: ['M','F'], example: 'M' },
            estadoCivil:    { type: 'string', example: 'SOLTERO' },
            numeroLicencia: { type: 'string', example: 'LCA-12345678' },
            categoria:      { type: 'string', example: '3RA' },
            vencimiento:    { type: 'string', format: 'date', example: '2026-12-31' },
            placa:          { type: 'string', example: 'ABC123D' },
            marca:          { type: 'string', example: 'TOYOTA' },
            modelo:         { type: 'string', example: 'COROLLA' },
            año:            { type: 'string', example: '2019' },
            serial:         { type: 'string', example: '8NFBT28B9KW123456' },
            color:          { type: 'string', example: 'BLANCO' },
            rif:            { type: 'string', example: 'J-12345678-9' },
            razonSocial:    { type: 'string', example: 'EMPRESA DEMO C.A.' },
          },
        },
        DocumentFile: {
          type: 'object',
          properties: {
            id:       { type: 'string', format: 'uuid' },
            name:     { type: 'string', example: 'cedula.jpg' },
            size:     { type: 'integer', example: 245000 },
            mimeType: { type: 'string', example: 'image/jpeg' },
            url:      { type: 'string', example: '/files/a3f1b2c4-....jpg' },
          },
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: false },
            code:    { type: 'string', example: 'DOC_TYPE_MISMATCH' },
            message: { type: 'string', example: 'El documento no coincide con el tipo seleccionado.' },
          },
        },
      },
    },
    paths: {
      '/api/access/token': {
        post: {
          tags: ['Autenticación'],
          summary: 'Canjear API Key por Access Token',
          description: 'Obtiene un JWT temporal de 1 hora. **Nota:** Este endpoint es atendido por el servidor central (Nexus API).',
          servers: [{ url: 'http://192.168.8.120:3092' }],
          security: [],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: { tenantToken: { type: 'string', example: 'sk_test_123...' } }
                }
              }
            }
          },
          responses: {
            200: {
              description: 'Token generado exitosamente',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean', example: true },
                      access_token: { type: 'string', example: 'eyJhbGciOiJIUzI1NiIs...' },
                      expires_in: { type: 'integer', example: 3600 },
                      token_type: { type: 'string', example: 'Bearer' }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
  },
  apis: ['./src/routes/*.js'],
};

module.exports = swaggerJsdoc(options);
