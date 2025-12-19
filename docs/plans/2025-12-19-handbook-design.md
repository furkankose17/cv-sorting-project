# CV Sorting Application Handbook - Design Document

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Create a professional, publishable marketing handbook with Playwright-captured screenshots showcasing all application features.

**Target Audience:** Executives, Decision Makers, Sales/Marketing Teams

**Deliverables:** PDF Document, HTML Website, PowerPoint Deck

---

## 1. Handbook Specifications

### Branding
- **Product Name:** CV Sorting Application
- **Tagline:** "Reduce Screening Time by 80% with AI-Powered Candidate Matching"
- **Value Proposition:** Time savings + AI-powered intelligence

### Format
- **Style:** Corporate Enterprise (clean, professional, blue/gray tones, formal language)
- **Depth:** Feature Showcase (2-3 sentences per feature, 30-40 pages)
- **Screenshots:** Populated with realistic demo data

---

## 2. Visual Design System

### Color Palette
| Color | Hex | Usage |
|-------|-----|-------|
| Primary Blue | #0854A0 | Headers, CTAs, links |
| Dark Gray | #32363A | Body text |
| Light Gray | #F5F6F7 | Backgrounds, frames |
| Accent Green | #107E3E | Success states, positive metrics |
| White | #FFFFFF | Content areas |

### Typography
- **Cover Title:** 72pt Display
- **Section Headers:** 28pt Bold
- **Body Text:** 11pt Regular
- **Captions:** 9pt Italic

### Screenshot Treatment
- Drop shadow: 0 4px 12px rgba(0,0,0,0.15)
- Border radius: 8px
- Width: 1200px capture
- Browser chrome removed

### Page Layout
- Full-bleed hero screenshots for chapter openers
- 2-column layouts for feature comparisons
- 1-inch margins for print quality
- Page numbers with section name in footer

### Callout Elements
- "Time Saved" badges with clock icon
- "AI Powered" indicators with brain icon
- Key metrics in blue highlight boxes

---

## 3. Handbook Structure (35 pages)

### Cover Page (1 page)
- Product name centered
- Tagline
- Subtle app screenshot background at 20% opacity
- Company info at bottom

### Chapter 1: The Challenge (2 pages)
**Page 1: "The Modern Recruitment Crisis"**
- Headline stat: "HR teams spend 23 hours screening CVs for a single hire"
- Pain points:
  - Manual CV review is time-consuming
  - Inconsistent candidate evaluation
  - Top talent slips through the cracks
  - Slow time-to-hire loses candidates

**Page 2: Visual Infographic**
- Broken hiring funnel diagram
- Statistics on recruitment inefficiencies

### Chapter 2: The Solution (2 pages)
**Page 1: "Introducing CV Sorting Application"**
- Elevator pitch paragraph
- Three benefit icons:
  - Speed: 80% faster screening
  - Intelligence: AI-powered matching
  - Control: End-to-end workflow

**Page 2: Platform Overview**
- Hero screenshot: `01-dashboard-overview.png`
- Annotated callouts to key areas

### Chapter 3: Upload & Processing (3 pages)
**Screenshots:** `02-upload-dropzone.png`, `03-upload-processing.png`

- Drag-and-drop CV upload
- Bulk processing capabilities
- Automatic text extraction
- Supported formats (PDF, DOCX, images)
- **Time Saved Badge:** "Process 100 CVs in minutes, not hours"

### Chapter 4: Candidate Management (4 pages)
**Screenshots:** `04-candidates-list.png`, `05-candidate-detail.png`, `06-cv-review.png`

- Comprehensive candidate database
- Smart filtering and search
- Detailed candidate profiles
- AI-extracted skills and experience
- Status tracking workflow
- **AI Powered Badge:** "Automatic skill extraction and categorization"

### Chapter 5: Job Postings & Matching (4 pages)
**Screenshots:** `07-jobs-list.png`, `08-job-detail.png`, `09-match-results.png`, `10-run-matching-dialog.png`

- Job posting management
- Required skills configuration
- AI-powered candidate matching
- Match score explanations
- Hot/Warm/Cold candidate triage
- **Key Metric:** "Find your best candidates in seconds"

### Chapter 6: Document Intelligence (3 pages)
**Screenshots:** `11-documents-list.png`

- Centralized document repository
- OCR processing for scanned documents
- Version tracking
- Secure storage
- **AI Powered Badge:** "Extract text from any document format"

### Chapter 7: Analytics Dashboard (3 pages)
**Screenshots:** `12-analytics-overview.png`, `20-priority-dashboard.png`

- Real-time hiring metrics
- Pipeline visualization
- Performance tracking
- Priority candidate alerts
- **Key Metric:** "Data-driven hiring decisions"

### Chapter 8: Email Automation Center (4 pages)
**Screenshots:** `13-email-dashboard.png`, `14-email-history.png`, `15-email-templates.png`, `16-email-settings.png`

- Automated candidate communications
- Email template library
- Notification history and tracking
- n8n workflow integration
- Delivery analytics
- **Time Saved Badge:** "Automate repetitive communications"

### Chapter 9: Key Workflows (4 pages)
**Visual workflow diagrams with screenshots**

**Workflow 1: End-to-End Hiring**
1. Upload CVs → 2. AI Processing → 3. Matching → 4. Review → 5. Interview → 6. Hire

**Workflow 2: Bulk CV Processing**
- Before: 4 hours manual review
- After: 15 minutes with AI

**Workflow 3: AI-Assisted Screening**
- Screenshots: `17-schedule-interview.png`, `18-status-update.png`, `19-advanced-search.png`

### Chapter 10: Technical Excellence (2 pages)
**Architecture Overview**
- SAP Cloud Application Programming Model (CAP)
- SAP UI5 Fiori Design
- AI/ML Services Integration
- Enterprise-grade security

**Integration Capabilities**
- REST APIs
- Webhook automation
- n8n workflow support

**Compliance & Security**
- Data protection
- Role-based access
- Audit logging

### Chapter 11: Next Steps (1 page)
- Call to action: "Transform Your Hiring Process Today"
- Contact information
- QR code to demo/website
- Social media links

---

## 4. Screenshot Capture Plan

### Playwright Configuration
```javascript
viewport: { width: 1400, height: 900 }
format: 'png'
fullPage: false
```

### Screenshot Sequence

| # | Screen | Filename | Navigation |
|---|--------|----------|------------|
| 1 | Dashboard | `01-dashboard-overview.png` | Main page load |
| 2 | Upload Tab | `02-upload-dropzone.png` | Click Upload tab |
| 3 | Upload Processing | `03-upload-processing.png` | Upload sample files |
| 4 | Candidates Tab | `04-candidates-list.png` | Click Candidates tab |
| 5 | Candidate Detail | `05-candidate-detail.png` | Click a candidate row |
| 6 | CV Review | `06-cv-review.png` | Click Review CV button |
| 7 | Jobs Tab | `07-jobs-list.png` | Click Jobs tab |
| 8 | Job Detail | `08-job-detail.png` | Click a job row |
| 9 | Match Results | `09-match-results.png` | View match results section |
| 10 | Run Matching | `10-run-matching-dialog.png` | Open Run Matching dialog |
| 11 | Documents Tab | `11-documents-list.png` | Click Documents tab |
| 12 | Analytics Tab | `12-analytics-overview.png` | Click Analytics tab |
| 13 | Email Dashboard | `13-email-dashboard.png` | Click Email Center tab |
| 14 | Email History | `14-email-history.png` | Click History sub-tab |
| 15 | Email Templates | `15-email-templates.png` | Click Templates sub-tab |
| 16 | Email Settings | `16-email-settings.png` | Click Settings sub-tab |
| 17 | Schedule Interview | `17-schedule-interview.png` | Open interview dialog |
| 18 | Status Update | `18-status-update.png` | Open status dialog |
| 19 | Advanced Search | `19-advanced-search.png` | Open search dialog |
| 20 | Priority Dashboard | `20-priority-dashboard.png` | View priority section |

---

## 5. Output Deliverables

### Directory Structure
```
docs/handbook/
├── index.html              # HTML handbook (master source)
├── cv-sorting-handbook.pdf # Print-ready PDF
├── cv-sorting-handbook.pptx # PowerPoint deck
├── assets/
│   ├── css/
│   │   └── handbook.css
│   ├── images/
│   │   ├── logo.png
│   │   ├── icons/
│   │   └── infographics/
│   └── screenshots/        # Playwright captures
│       ├── 01-dashboard-overview.png
│       ├── 02-upload-dropzone.png
│       └── ... (20 total)
└── README.md
```

### HTML Handbook
- Single-page scrolling design
- Fixed navigation sidebar
- Smooth scroll between sections
- Click-to-enlarge screenshots
- Responsive for tablet/desktop
- Print stylesheet for PDF generation

### PDF Document
- A4 Landscape format
- Generated from HTML with print styles
- Embedded fonts
- High-resolution screenshots (300 DPI)
- Bleed marks for professional printing

### PowerPoint Deck
- 20-25 slides (condensed)
- One key message per slide
- Speaker notes included
- Consistent branding throughout
- Editable for customization

---

## 6. Implementation Approach

### Phase 1: Setup
- Create directory structure
- Set up Playwright test file
- Configure screenshot capture

### Phase 2: Screenshot Capture
- Start application server
- Navigate through all screens
- Capture 20 screenshots

### Phase 3: HTML Handbook
- Build HTML structure
- Apply CSS styling
- Embed screenshots
- Add content copy

### Phase 4: PDF Generation
- Optimize print stylesheet
- Generate PDF from HTML

### Phase 5: PowerPoint Creation
- Create slide deck
- Import key screenshots
- Add speaker notes

---

## Approval

- [x] Handbook structure approved
- [x] Visual design system approved
- [x] Screenshot capture plan approved
- [x] Content outline approved
- [x] Multi-format output strategy approved

**Ready for implementation.**
