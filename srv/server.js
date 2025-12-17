/**
 * CAP Server Bootstrap
 * Following SAP CAP Best Practices
 */
'use strict';

const cds = require('@sap/cds');
const multer = require('multer');
const { correlationMiddleware } = require('./lib/logger');

// Configure multer for file uploads (memory storage)
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024 // 10MB limit
    }
});

// Register custom service handlers
cds.on('bootstrap', (app) => {
    // Add correlation ID middleware
    app.use(correlationMiddleware);

    // Health check endpoint
    app.get('/health', (req, res) => {
        res.json({
            status: 'UP',
            timestamp: new Date().toISOString(),
            service: 'cv-sorting-project'
        });
    });

    // Ready check endpoint
    app.get('/ready', async (req, res) => {
        const { createMLClient } = require('./lib/ml-client');
        const mlClient = createMLClient();

        const status = {
            status: 'READY',
            timestamp: new Date().toISOString(),
            components: {
                database: 'unknown',
                mlService: 'unknown'
            }
        };

        // Check database
        try {
            await cds.db.run('SELECT 1 FROM DUMMY');
            status.components.database = 'connected';
        } catch (error) {
            status.components.database = 'disconnected';
            status.status = 'DEGRADED';
        }

        // Check ML service
        try {
            const mlHealth = await mlClient.ping();
            status.components.mlService = mlHealth.status || 'connected';
        } catch (error) {
            status.components.mlService = 'unavailable';
            // ML service is optional, don't mark as degraded
        }

        const httpStatus = status.status === 'READY' ? 200 : 503;
        res.status(httpStatus).json(status);
    });

    // File upload endpoint for CV processing
    app.post('/api/uploadAndProcessCV', upload.single('file'), async (req, res) => {
        const LOG = cds.log('upload');

        try {
            if (!req.file) {
                return res.status(400).json({
                    error: 'No file uploaded'
                });
            }

            // Get file metadata from headers or multipart form data
            const fileName = req.headers['x-file-name']
                ? decodeURIComponent(req.headers['x-file-name'])
                : req.file.originalname;
            const mediaType = req.headers['x-media-type'] || req.file.mimetype;
            const autoCreate = req.headers['x-auto-create'] === 'true';

            LOG.info('File upload received', {
                fileName,
                mediaType,
                fileSize: req.file.size,
                autoCreate
            });

            // Load the OCR handler
            const ocrHandler = require('./handlers/ocr-handler');

            // Create mock request object for the action handler
            const mockReq = {
                data: {
                    fileName,
                    fileContent: req.file.buffer,
                    mediaType,
                    autoCreate
                },
                user: req.user || { id: 'anonymous' },
                reject: (code, msg) => {
                    throw new Error(`${code}: ${msg}`);
                },
                error: (code, msg) => {
                    throw new Error(`${code}: ${msg}`);
                }
            };

            // Call the uploadAndProcessCV action handler
            const result = await ocrHandler.uploadAndProcessCV(mockReq);

            LOG.info('File processed successfully', {
                documentId: result.documentId,
                ocrStatus: result.ocrStatus
            });

            // Return success response
            res.status(201).json(result);

        } catch (error) {
            LOG.error('File upload failed', {
                error: error.message,
                stack: error.stack
            });

            res.status(500).json({
                error: 'Upload failed',
                message: error.message
            });
        }
    });
});

// Register service implementations
cds.on('serving', (service) => {
    const LOG = cds.log(service.name);
    LOG.info(`Service ${service.name} is being served at ${service.path}`);
});

// Global error handler
cds.on('error', (err, req) => {
    const LOG = cds.log('error');
    LOG.error('Unhandled error:', {
        message: err.message,
        code: err.code,
        stack: err.stack,
        path: req?.path,
        user: req?.user?.id
    });
});

module.exports = cds.server;
