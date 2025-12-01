/**
 * CAP Server Bootstrap
 * Following SAP CAP Best Practices
 */
'use strict';

const cds = require('@sap/cds');
const { correlationMiddleware } = require('./lib/logger');

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
        try {
            // Check database connectivity
            await cds.db.run('SELECT 1 FROM DUMMY');
            res.json({
                status: 'READY',
                database: 'connected',
                timestamp: new Date().toISOString()
            });
        } catch (error) {
            res.status(503).json({
                status: 'NOT_READY',
                database: 'disconnected',
                error: error.message
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
