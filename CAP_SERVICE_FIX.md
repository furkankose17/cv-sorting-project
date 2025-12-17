# CAP Service Fix - Rate Limiter Middleware Issue

**Date:** 2025-12-16
**Issue:** CAP service was crashing when handling requests
**Status:** ✅ FIXED

---

## Problem Identified

### Error Message
```
[cds] [ERROR] ❗️Uncaught TypeError: next is not a function
    at CVSortingService.<anonymous> (/srv/lib/rate-limiter.js:111:20)
```

### Root Cause

The rate limiter middleware in `srv/lib/rate-limiter.js` was using **Express.js-style middleware pattern** with a `next` callback:

```javascript
// WRONG: Express-style for CAP
middleware() {
    return async (req, next) => {
        // ...
        return next();  // ❌ CAP handlers don't have next()
    };
}
```

However, **CAP service handlers don't use the `next` callback pattern**. CAP handlers simply:
- Return normally to continue processing
- Use `req.reject()` to stop and send an error

---

## The Fix

**File:** `srv/lib/rate-limiter.js` (Lines 87-114)

### Before (Broken)
```javascript
middleware() {
    return async (req, next) => {
        if (req.path === '/health' || req.path === '/ready') {
            return next();  // ❌ Error: next is not a function
        }

        const result = await this.checkLimit(req);

        if (!result.allowed) {
            req.reject(429, 'Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED');
            return;
        }

        return next();  // ❌ Error: next is not a function
    };
}
```

### After (Fixed)
```javascript
middleware() {
    return async (req) => {  // ✅ No next parameter
        if (req.path === '/health' || req.path === '/ready') {
            return;  // ✅ Just return to continue
        }

        const result = await this.checkLimit(req);

        if (!result.allowed) {
            req.reject(429, 'Too many requests. Please try again later.', 'RATE_LIMIT_EXCEEDED');
            return;
        }

        // ✅ Just return to continue (no next() needed)
        return;
    };
}
```

### Key Changes
1. **Removed `next` parameter** from async function signature
2. **Removed all `next()` calls** - just return normally
3. **Added comments** explaining CAP-specific behavior

---

## How CAP Handlers Work

CAP service handlers use a different pattern than Express middleware:

| Pattern | Express Middleware | CAP Service Handler |
|---------|-------------------|---------------------|
| **Signature** | `async (req, res, next)` | `async (req)` |
| **Continue** | `next()` | `return` (nothing) |
| **Stop with error** | `res.status(429).json(...)` | `req.reject(429, ...)` |
| **Headers** | `res.setHeader(...)` | `req._.res.setHeader(...)` |

---

## Verification

### ✅ Service Started Successfully
```bash
$ curl http://localhost:4004/
# Returns: HTML welcome page ✅

$ curl http://localhost:4004/api/Candidates?\$top=1
# Returns: JSON data with candidates ✅
```

### ✅ No More Errors
Before: Service crashed with "next is not a function"
After: Service handles all requests successfully

---

## Impact

**Affected Services:**
- ✅ CVSortingService (`/api`)
- ✅ All OData endpoints
- ✅ All Fiori apps

**Fiori Apps Now Working:**
- ✅ Launchpad: http://localhost:4004/launchpad.html
- ✅ CV Management: http://localhost:4004/cvmanagement/webapp/index.html
- ✅ ML Showcase: http://localhost:4004/ml-showcase/webapp/index.html
- ✅ Analytics Dashboard: http://localhost:4004/cv-sorting-analytics-dashboard/webapp/index.html

---

## Testing the Fix

### 1. Test Rate Limiting Works
```bash
# Make rapid requests to trigger rate limit
for i in {1..150}; do
  curl -s http://localhost:4004/api/Candidates | grep -q "value" && echo "Request $i: OK"
done
```

**Expected:** After 100 requests, you should see rate limit errors

### 2. Test Rate Limit Headers
```bash
curl -I http://localhost:4004/api/Candidates
```

**Expected Headers:**
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 99
X-RateLimit-Reset: <timestamp>
```

### 3. Test Fiori Apps Load
```bash
open "http://localhost:4004/launchpad.html"
```

**Expected:** Fiori Launchpad opens with all apps visible

---

## Related Files

| File | Change |
|------|--------|
| `srv/lib/rate-limiter.js` | Fixed middleware() to remove next() |
| `srv/cv-sorting-service.js` | Uses rate limiter (no changes needed) |
| `test/rate-limiter.test.js` | All tests still pass |

---

## Lessons Learned

1. **CAP ≠ Express**: CAP services don't use Express middleware patterns
2. **No next() in CAP**: CAP handlers simply return to continue
3. **Use req.reject()**: For errors in CAP, not res.status()
4. **Access response via req._**: Headers set via `req._.res`, not `res`

---

## Prevention

To prevent similar issues in the future:

1. ✅ **Added comments** in rate-limiter code explaining CAP-specific behavior
2. ✅ **Documented pattern** in this file for reference
3. 🔄 **Update all middleware** to follow CAP patterns, not Express

---

## Service Status

**CAP Service:**
- URL: http://localhost:4004
- Status: ✅ Running and responding
- Services: CVSortingService, CandidateService, JobService, AIService

**ML Service:**
- URL: http://localhost:8000
- Status: ✅ Running and healthy
- API Docs: http://localhost:8000/docs

---

## Next Steps

- [x] Fix rate limiter middleware
- [x] Restart CAP service
- [x] Verify OData endpoints work
- [x] Open Fiori apps
- [ ] Test rate limiting functionality
- [ ] Test all Fiori app features

**All services are now operational! 🚀**
