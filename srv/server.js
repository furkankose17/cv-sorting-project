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
