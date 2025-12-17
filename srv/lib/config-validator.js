'use strict';

const cds = require('@sap/cds');
const LOG = cds.log('config-validator');

/**
 * Configuration Validator
 *
 * Validates environment variables on service startup and provides
 * helpful error messages for missing or invalid configuration.
 */

class ConfigValidator {
    constructor() {
        this.errors = [];
        this.warnings = [];
    }

    /**
     * Validate all email automation configuration
     * @returns {Object} { isValid: boolean, errors: string[], warnings: string[] }
     */
    validate() {
        LOG.info('Validating email automation configuration...');

        // Validate required variables
        this._validateWebhookUrl();

        // Validate optional variables with defaults
        this._validateBooleanFlag('ENABLE_WEBHOOKS', false);
        this._validateBooleanFlag('ENABLE_STATUS_TRACKING', true);
        this._validateBooleanFlag('ENABLE_AUTO_NOTIFICATIONS', true);

        this._validatePositiveInteger('WEBHOOK_TIMEOUT_MS', 5000, 1000, 60000);
        this._validatePositiveInteger('WEBHOOK_RETRIES', 2, 0, 10);
        this._validatePositiveInteger('NOTIFICATION_WINDOW_HOURS', 24, 1, 168);
        this._validatePositiveInteger('NOTIFICATION_COOLDOWN_HOURS', 24, 1, 168);
        this._validatePositiveInteger('RATE_LIMIT_EMAIL_REQUESTS', 50, 1, 1000);
        this._validatePositiveInteger('RATE_LIMIT_EMAIL_WINDOW_MS', 60000, 1000, 3600000);

        // Log validation results
        this._logResults();

        return {
            isValid: this.errors.length === 0,
            errors: this.errors,
            warnings: this.warnings
        };
    }

    /**
     * Validate webhook URL configuration
     * @private
     */
    _validateWebhookUrl() {
        const url = process.env.N8N_WEBHOOK_URL;

        if (!url) {
            this.warnings.push(
                'N8N_WEBHOOK_URL is not set. Using default: http://localhost:5678/webhook'
            );
            this._addConfigHint('N8N_WEBHOOK_URL', 'http://localhost:5678/webhook');
            return;
        }

        // Validate URL format
        try {
            const parsedUrl = new URL(url);

            // Warn about non-HTTPS in production
            if (process.env.NODE_ENV === 'production' && parsedUrl.protocol !== 'https:') {
                this.warnings.push(
                    `N8N_WEBHOOK_URL uses HTTP in production. HTTPS is strongly recommended: ${url}`
                );
            }

            // Warn about localhost in production
            if (process.env.NODE_ENV === 'production' &&
                (parsedUrl.hostname === 'localhost' || parsedUrl.hostname === '127.0.0.1')) {
                this.errors.push(
                    `N8N_WEBHOOK_URL points to localhost in production: ${url}. ` +
                    'Use a proper hostname or domain.'
                );
            }

        } catch (error) {
            this.errors.push(
                `N8N_WEBHOOK_URL is not a valid URL: ${url}. ` +
                'Expected format: http://localhost:5678/webhook or https://your-domain.com/webhook'
            );
        }
    }

    /**
     * Validate boolean flag
     * @private
     */
    _validateBooleanFlag(varName, defaultValue) {
        const value = process.env[varName];

        if (!value) {
            this.warnings.push(
                `${varName} is not set. Using default: ${defaultValue}`
            );
            this._addConfigHint(varName, defaultValue);
            return;
        }

        if (value !== 'true' && value !== 'false') {
            this.errors.push(
                `${varName} must be 'true' or 'false', got: '${value}'`
            );
        }
    }

    /**
     * Validate positive integer with range
     * @private
     */
    _validatePositiveInteger(varName, defaultValue, min = 1, max = Infinity) {
        const value = process.env[varName];

        if (!value) {
            this.warnings.push(
                `${varName} is not set. Using default: ${defaultValue}`
            );
            this._addConfigHint(varName, defaultValue);
            return;
        }

        const parsed = parseInt(value);

        if (isNaN(parsed)) {
            this.errors.push(
                `${varName} must be a number, got: '${value}'`
            );
            return;
        }

        if (parsed < min) {
            this.errors.push(
                `${varName} must be >= ${min}, got: ${parsed}`
            );
        }

        if (parsed > max) {
            this.warnings.push(
                `${varName} is ${parsed}, which is quite high (max recommended: ${max}). ` +
                'This may impact performance.'
            );
        }
    }

    /**
     * Add configuration hint for missing variables
     * @private
     */
    _addConfigHint(varName, defaultValue) {
        // Don't spam hints for every variable
        if (this.warnings.length === 1) {
            LOG.info(
                'Configuration hint: Create a .env file from .env.example to customize defaults:\n' +
                '  cp .env.example .env\n' +
                '  # Edit .env with your values'
            );
        }
    }

    /**
     * Log validation results
     * @private
     */
    _logResults() {
        if (this.errors.length > 0) {
            LOG.error('Configuration validation FAILED:');
            this.errors.forEach(error => LOG.error(`  - ${error}`));
            LOG.error('\nPlease fix the configuration errors above.');
            LOG.error('See docs/EMAIL_AUTOMATION_CONFIG.md for detailed configuration guide.');
        }

        if (this.warnings.length > 0 && this.errors.length === 0) {
            LOG.warn('Configuration validation passed with warnings:');
            this.warnings.forEach(warning => LOG.warn(`  - ${warning}`));
        }

        if (this.errors.length === 0 && this.warnings.length === 0) {
            LOG.info('Configuration validation passed successfully.');
        }

        // Log current configuration summary
        this._logConfigSummary();
    }

    /**
     * Log configuration summary
     * @private
     */
    _logConfigSummary() {
        const webhooksEnabled = process.env.ENABLE_WEBHOOKS === 'true';
        const statusTracking = process.env.ENABLE_STATUS_TRACKING !== 'false'; // Default true
        const autoNotifications = process.env.ENABLE_AUTO_NOTIFICATIONS !== 'false'; // Default true

        LOG.info('Email Automation Configuration Summary:');
        LOG.info(`  Webhooks:           ${webhooksEnabled ? 'ENABLED' : 'DISABLED'}`);
        LOG.info(`  Status Tracking:    ${statusTracking ? 'ENABLED' : 'DISABLED'}`);
        LOG.info(`  Auto Notifications: ${autoNotifications ? 'ENABLED' : 'DISABLED'}`);
        LOG.info(`  Webhook URL:        ${process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook (default)'}`);
        LOG.info(`  Webhook Timeout:    ${process.env.WEBHOOK_TIMEOUT_MS || '5000'} ms`);
        LOG.info(`  Webhook Retries:    ${process.env.WEBHOOK_RETRIES || '2'}`);
        LOG.info(`  Notification Window: ${process.env.NOTIFICATION_WINDOW_HOURS || '24'} hours`);
        LOG.info(`  Notification Cooldown: ${process.env.NOTIFICATION_COOLDOWN_HOURS || '24'} hours`);

        // Warn if webhooks are enabled but status tracking is disabled
        if (webhooksEnabled && !statusTracking && !autoNotifications) {
            LOG.warn(
                'WARNING: Webhooks are enabled but both status tracking and auto notifications are disabled. ' +
                'No webhooks will be sent. Enable at least one feature or disable ENABLE_WEBHOOKS.'
            );
        }
    }

    /**
     * Validate configuration and throw if invalid
     * @static
     */
    static validateOrThrow() {
        const validator = new ConfigValidator();
        const result = validator.validate();

        if (!result.isValid) {
            const errorMessage =
                'Email automation configuration is invalid:\n' +
                result.errors.map(e => `  - ${e}`).join('\n') + '\n\n' +
                'See docs/EMAIL_AUTOMATION_CONFIG.md for configuration guide.';

            throw new Error(errorMessage);
        }

        return result;
    }

    /**
     * Validate configuration and log warnings but don't throw
     * @static
     */
    static validateAndWarn() {
        const validator = new ConfigValidator();
        return validator.validate();
    }
}

module.exports = ConfigValidator;
