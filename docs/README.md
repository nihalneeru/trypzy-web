# Documentation Index

This directory contains all project documentation organized by category.

## Structure

### `/api/`
API endpoint documentation and specifications.

- **[AVAILABILITY_API_DOCS.md](./api/AVAILABILITY_API_DOCS.md)** - Availability submission API documentation
  - Three payload formats: per-day, broad range, and weekly blocks
  - Backward compatibility notes
  - Validation rules

### `/features/`
Feature specifications, guides, and summaries.

- **[PROMISING_WINDOWS_DOCS.md](./features/PROMISING_WINDOWS_DOCS.md)** - Promising Windows feature technical documentation
- **[PROMISING_WINDOWS_SUMMARY.md](./features/PROMISING_WINDOWS_SUMMARY.md)** - Quick reference for Promising Windows implementation

### `/tests/`
Testing documentation, procedures, and results.

- **[TEST_SUMMARY.md](./tests/TEST_SUMMARY.md)** - Testing infrastructure overview and status
- **[AVAILABILITY_TEST_STEPS.md](./tests/AVAILABILITY_TEST_STEPS.md)** - Step-by-step testing procedures for availability features
- **[PROMISING_WINDOWS_TEST.md](./tests/PROMISING_WINDOWS_TEST.md)** - Testing guide for Promising Windows feature
- **[SYSTEM_MESSAGES_TEST.md](./tests/SYSTEM_MESSAGES_TEST.md)** - Manual test checklist for system messages and chat scope
- **[test_result.md](./tests/test_result.md)** - Testing protocol and results tracking (for agent communication)

## Root Documentation

Main documentation files are kept at the repository root:

- **[../README.md](../README.md)** - Project overview and quick start
- **[../SETUP.md](../SETUP.md)** - Setup and installation guide
- **[../scheduling_mvp.md](../scheduling_mvp.md)** - Scheduling MVP specification (source of truth)
