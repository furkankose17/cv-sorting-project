/**
 * File Validation Utilities
 * Provides secure file validation including magic byte verification and size limits
 */

const { ApplicationError } = require('./errors');

// Maximum file size: 50MB (configurable via environment)
const MAX_FILE_SIZE = parseInt(process.env.MAX_FILE_SIZE_MB || 50) * 1024 * 1024;

// File type magic bytes (file signatures)
const FILE_SIGNATURES = {
    'application/pdf': [
        { signature: '25504446', offset: 0, description: 'PDF' } // %PDF
    ],
    'image/jpeg': [
        { signature: 'FFD8FF', offset: 0, description: 'JPEG' }
    ],
    'image/jpg': [
        { signature: 'FFD8FF', offset: 0, description: 'JPG' }
    ],
    'image/png': [
        { signature: '89504E47', offset: 0, description: 'PNG' } // .PNG
    ],
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': [
        { signature: '504B0304', offset: 0, description: 'DOCX (ZIP)' }, // PK.. (ZIP format)
        { signature: '504B0506', offset: 0, description: 'DOCX (ZIP empty)' },
        { signature: '504B0708', offset: 0, description: 'DOCX (ZIP spanned)' }
    ],
    'application/msword': [
        { signature: 'D0CF11E0', offset: 0, description: 'DOC (MS Office)' } // ....
    ]
};

// Allowed MIME types
const ALLOWED_MIME_TYPES = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/png',
    'image/jpeg',
    'image/jpg'
];

/**
 * Validate file size
 * @param {Buffer} buffer - File buffer
 * @param {string} fileName - File name for error reporting
 * @returns {void}
 * @throws {ApplicationError} if file is too large
 */
function validateFileSize(buffer, fileName) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new ApplicationError('Invalid file buffer', 400);
    }

    if (buffer.length === 0) {
        throw new ApplicationError(`File is empty: ${fileName}`, 400);
    }

    if (buffer.length > MAX_FILE_SIZE) {
        const sizeMB = (buffer.length / (1024 * 1024)).toFixed(2);
        const maxSizeMB = (MAX_FILE_SIZE / (1024 * 1024)).toFixed(0);
        throw new ApplicationError(
            `File too large: ${sizeMB}MB. Maximum allowed: ${maxSizeMB}MB`,
            413 // Payload Too Large
        );
    }
}

/**
 * Validate MIME type
 * @param {string} mimeType - MIME type to validate
 * @returns {void}
 * @throws {ApplicationError} if MIME type not allowed
 */
function validateMimeType(mimeType) {
    if (!mimeType || typeof mimeType !== 'string') {
        throw new ApplicationError('MIME type is required', 400);
    }

    if (!ALLOWED_MIME_TYPES.includes(mimeType)) {
        throw new ApplicationError(
            `Unsupported file type: ${mimeType}. Allowed types: ${ALLOWED_MIME_TYPES.join(', ')}`,
            400
        );
    }
}

/**
 * Verify file signature (magic bytes) matches declared MIME type
 * Prevents files with spoofed MIME types
 * @param {Buffer} buffer - File buffer
 * @param {string} declaredMimeType - MIME type declared by client
 * @returns {boolean} true if signature matches
 * @throws {ApplicationError} if signature doesn't match
 */
function verifyFileSignature(buffer, declaredMimeType) {
    if (!buffer || !Buffer.isBuffer(buffer)) {
        throw new ApplicationError('Invalid file buffer for signature verification', 400);
    }

    if (buffer.length < 4) {
        throw new ApplicationError('File too small to verify signature', 400);
    }

    const signatures = FILE_SIGNATURES[declaredMimeType];
    if (!signatures || signatures.length === 0) {
        throw new ApplicationError(`No signature definition for MIME type: ${declaredMimeType}`, 500);
    }

    // Extract first 8 bytes as hex string
    const headerHex = buffer.slice(0, 8).toString('hex').toUpperCase();

    // Check if any of the signatures match
    const signatureMatch = signatures.some(sig => {
        const sigUpper = sig.signature.toUpperCase();
        return headerHex.startsWith(sigUpper);
    });

    if (!signatureMatch) {
        const expectedSigs = signatures.map(s => s.description).join(' or ');
        throw new ApplicationError(
            `File signature validation failed. Expected ${expectedSigs} but file appears to be a different format. This could indicate a spoofed or corrupted file.`,
            400
        );
    }

    return true;
}

/**
 * Validate file extension matches MIME type
 * @param {string} fileName - File name with extension
 * @param {string} mimeType - MIME type
 * @returns {void}
 * @throws {ApplicationError} if extension doesn't match MIME type
 */
function validateFileExtension(fileName, mimeType) {
    if (!fileName || typeof fileName !== 'string') {
        throw new ApplicationError('File name is required', 400);
    }

    const extension = fileName.split('.').pop()?.toLowerCase();
    if (!extension) {
        throw new ApplicationError('File must have an extension', 400);
    }

    const extensionMap = {
        'pdf': 'application/pdf',
        'doc': 'application/msword',
        'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'png': 'image/png',
        'jpg': 'image/jpeg',
        'jpeg': 'image/jpeg'
    };

    const expectedMimeType = extensionMap[extension];
    if (!expectedMimeType) {
        throw new ApplicationError(
            `Unsupported file extension: .${extension}. Allowed: pdf, doc, docx, png, jpg, jpeg`,
            400
        );
    }

    if (expectedMimeType !== mimeType && !(extension === 'jpg' && mimeType === 'image/jpg')) {
        throw new ApplicationError(
            `File extension .${extension} does not match MIME type ${mimeType}`,
            400
        );
    }
}

/**
 * Sanitize file name to prevent path traversal and other attacks
 * @param {string} fileName - Original file name
 * @returns {string} Sanitized file name
 */
function sanitizeFileName(fileName) {
    // Check for null/undefined/non-string, but allow empty strings to be processed
    if (fileName == null || typeof fileName !== 'string') {
        return 'unknown';
    }

    // Remove path separators and null bytes
    let sanitized = fileName
        .replace(/[\/\\]/g, '_')  // Replace path separators
        .replace(/\0/g, '')        // Remove null bytes
        .replace(/\.\./g, '_')     // Replace double dots (path traversal)
        .trim();

    // Limit length
    if (sanitized.length > 255) {
        const extension = sanitized.split('.').pop();
        const nameWithoutExt = sanitized.substring(0, sanitized.lastIndexOf('.'));
        sanitized = nameWithoutExt.substring(0, 250 - extension.length) + '.' + extension;
    }

    // Ensure we have a valid file name
    if (sanitized.length === 0 || sanitized === '.') {
        sanitized = 'document';
    }

    return sanitized;
}

/**
 * Comprehensive file validation
 * Validates size, MIME type, extension, and file signature
 * @param {Object} fileData - File data object
 * @param {string} fileData.fileName - File name
 * @param {Buffer} fileData.buffer - File buffer
 * @param {string} fileData.mimeType - MIME type
 * @returns {Object} Validation result with sanitized file name
 * @throws {ApplicationError} if validation fails
 */
function validateFile(fileData) {
    const { fileName, buffer, mimeType } = fileData;

    // 1. Validate MIME type
    validateMimeType(mimeType);

    // 2. Validate file size
    validateFileSize(buffer, fileName);

    // 3. Sanitize file name
    const sanitizedFileName = sanitizeFileName(fileName);

    // 4. Validate file extension
    validateFileExtension(sanitizedFileName, mimeType);

    // 5. Verify file signature (magic bytes)
    verifyFileSignature(buffer, mimeType);

    return {
        isValid: true,
        sanitizedFileName,
        fileSize: buffer.length,
        fileSizeMB: (buffer.length / (1024 * 1024)).toFixed(2)
    };
}

/**
 * Check if file appears to be malicious based on basic heuristics
 * This is NOT a replacement for proper antivirus scanning
 * @param {Buffer} buffer - File buffer
 * @param {string} fileName - File name
 * @returns {Object} Analysis result
 */
function performBasicMalwareCheck(buffer, fileName) {
    const warnings = [];

    // Check for double extensions (e.g., document.pdf.exe)
    const parts = fileName.split('.');
    if (parts.length > 2) {
        const extensions = parts.slice(1);
        const suspiciousExtensions = ['exe', 'bat', 'cmd', 'com', 'scr', 'vbs', 'js'];
        const hasSuspicious = extensions.some(ext =>
            suspiciousExtensions.includes(ext.toLowerCase())
        );
        if (hasSuspicious) {
            warnings.push('File has multiple extensions including executable extension');
        }
    }

    // Check for suspicious content (very basic)
    const contentStr = buffer.toString('utf8', 0, Math.min(buffer.length, 1000));
    const suspiciousPatterns = [
        /<script/i,
        /javascript:/i,
        /vbscript:/i,
        /onerror=/i,
        /onclick=/i
    ];

    for (const pattern of suspiciousPatterns) {
        if (pattern.test(contentStr)) {
            warnings.push(`Suspicious content pattern detected: ${pattern}`);
        }
    }

    return {
        isSuspicious: warnings.length > 0,
        warnings,
        recommendation: warnings.length > 0
            ? 'File should be scanned with antivirus before processing'
            : 'Basic checks passed'
    };
}

module.exports = {
    validateFile,
    validateFileSize,
    validateMimeType,
    validateFileExtension,
    verifyFileSignature,
    sanitizeFileName,
    performBasicMalwareCheck,
    MAX_FILE_SIZE,
    ALLOWED_MIME_TYPES,
    FILE_SIGNATURES
};
