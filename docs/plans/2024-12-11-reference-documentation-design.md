# Reference Documentation Design

**Date:** 2024-12-11
**Status:** Implemented

---

## Goal

Create comprehensive reference documentation for the CV Sorting project covering all components: CAP services, Fiori apps, Python ML service, n8n workflows, and their integrations.

---

## Requirements

1. **Target audience:** New developers, operations teams, and future maintainers
2. **Structure:** Tiered approach - high-level overview + deep dives for critical areas
3. **Critical areas for deep dive:**
   - CAP services & data model
   - Python ML service & vector search
   - Integration points between components
4. **High-level coverage:**
   - Fiori applications
   - Workflows (n8n, BPA)
5. **Optional sections included:**
   - Troubleshooting guide
   - Local development setup
   - API quick reference

---

## Design Decision

### Documentation Structure

Chose: **Structured docs folder** (`docs/reference/`) with index and sub-documents.

**Rationale:** Most navigable for large documentation sets. Allows focused reading without overwhelming single files.

### Files Created

```
docs/reference/
├── README.md                    # Index with navigation
├── architecture-overview.md     # High-level system architecture
├── cap-services.md              # Deep dive: CAP backend services
├── data-model.md                # Deep dive: Database schema
├── ml-service.md                # Deep dive: Python ML service
├── integrations.md              # Deep dive: Component connections
├── fiori-apps.md                # High-level: UI applications
├── workflows.md                 # High-level: n8n & BPA workflows
├── local-development.md         # Setup guide
├── api-reference.md             # Endpoint quick reference
└── troubleshooting.md           # Common issues & solutions
```

### Replaced

- Removed: `PROJECT_REFERENCE.md` (old single-file reference)

---

## Key Documentation Decisions

1. **ASCII diagrams over images** - Version control friendly, no external dependencies
2. **Code examples inline** - Easier to copy/paste and validate
3. **Tables for quick reference** - Scannable, consistent format
4. **Environment variables documented** - Critical for onboarding
5. **Troubleshooting structured by component** - Faster problem resolution

---

## Summary

Created 11 documentation files totaling ~150KB covering:
- System architecture and component relationships
- All CAP service endpoints, actions, and functions
- Complete data model with entity definitions
- Python ML service API and configuration
- Integration patterns and data flows
- Local development setup instructions
- API quick reference tables
- Common troubleshooting scenarios
