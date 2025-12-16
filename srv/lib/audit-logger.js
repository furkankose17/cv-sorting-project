/**
 * Audit Logging Utility
 * Tracks all data changes for compliance and security auditing
 */

const cds = require('@sap/cds');
const { v4: uuidv4 } = require('uuid');

const LOG = cds.log('audit-logger');

class AuditLogger {
    /**
     * Log a data change event
     * @param {Object} options - Audit log options
     * @param {string} options.entityName - Name of the entity being changed
     * @param {string} options.entityId - ID of the entity being changed
     * @param {string} options.action - Action performed: CREATE, UPDATE, DELETE
     * @param {Object} options.oldValues - Previous values (for UPDATE/DELETE)
     * @param {Object} options.newValues - New values (for CREATE/UPDATE)
     * @param {Object} options.user - User who performed the action
     * @param {Array<string>} options.changedFields - List of fields that changed
     * @param {Object} options.req - CAP request object (optional)
     */
    async log({
        entityName,
        entityId,
        action,
        oldValues = null,
        newValues = null,
        user = null,
        changedFields = [],
        req = null
    }) {
        try {
            const { AuditLogs } = cds.entities('cv.sorting');

            const auditEntry = {
                ID: uuidv4(),
                entityName,
                entityId,
                action: action.toUpperCase(),
                oldValues: oldValues ? JSON.stringify(oldValues) : null,
                newValues: newValues ? JSON.stringify(newValues) : null,
                changedFields,
                modifiedBy: user?.id || req?.user?.id || 'system',
                modifiedAt: new Date().toISOString()
            };

            await INSERT.into(AuditLogs).entries(auditEntry);

            LOG.info('Audit log created', {
                entityName,
                entityId,
                action,
                user: auditEntry.modifiedBy
            });

        } catch (error) {
            // Never fail the main operation due to audit logging errors
            LOG.error('Failed to create audit log', {
                entityName,
                entityId,
                action,
                error: error.message
            });
        }
    }

    /**
     * Log entity creation
     */
    async logCreate(entityName, entityId, newValues, user = null, req = null) {
        return this.log({
            entityName,
            entityId,
            action: 'CREATE',
            newValues,
            user,
            req
        });
    }

    /**
     * Log entity update
     */
    async logUpdate(entityName, entityId, oldValues, newValues, changedFields = [], user = null, req = null) {
        return this.log({
            entityName,
            entityId,
            action: 'UPDATE',
            oldValues,
            newValues,
            changedFields,
            user,
            req
        });
    }

    /**
     * Log entity deletion
     */
    async logDelete(entityName, entityId, oldValues, user = null, req = null) {
        return this.log({
            entityName,
            entityId,
            action: 'DELETE',
            oldValues,
            user,
            req
        });
    }

    /**
     * Compare two objects and return list of changed fields
     */
    getChangedFields(oldObj, newObj) {
        const changed = [];
        const allKeys = new Set([...Object.keys(oldObj || {}), ...Object.keys(newObj || {})]);

        for (const key of allKeys) {
            // Skip metadata fields
            if (['createdAt', 'createdBy', 'modifiedAt', 'modifiedBy'].includes(key)) {
                continue;
            }

            const oldVal = oldObj?.[key];
            const newVal = newObj?.[key];

            if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) {
                changed.push(key);
            }
        }

        return changed;
    }

    /**
     * Get audit trail for an entity
     */
    async getAuditTrail(entityName, entityId) {
        try {
            const { AuditLogs } = cds.entities('cv.sorting');

            return await SELECT.from(AuditLogs)
                .where({ entityName, entityId })
                .orderBy({ modifiedAt: 'desc' });

        } catch (error) {
            LOG.error('Failed to retrieve audit trail', {
                entityName,
                entityId,
                error: error.message
            });
            return [];
        }
    }
}

// Export singleton instance
module.exports = new AuditLogger();
