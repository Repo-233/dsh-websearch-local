# REUSE Compliance for dsh-websearch-local

This project complies with the REUSE Specification v3.3 for software licensing compliance.

## What is REUSE?

REUSE is not a new license, but an open source compliance specification created by the Free Software Foundation Europe (FSFE). It aims to solve the problem of scattered copyright statements and machine-identifiable information in open source projects.

## Project Compliance Structure

### 1. Centralized License Declarations (REUSE.toml)

Instead of adding copyright headers to every source file, we use `REUSE.toml` to declare copyright and license information for groups of files:

- **Source files** (`src/**/*.js`): Declared with proper copyright and GPL-3.0-or-later license
- **Client interface** (`client/**/*.js`): Inherited from original author
- **Configuration files**: Included for completeness

### 2. License Text Storage

Complete license text is stored in the `LICENSES/` directory:
- `LICENSES/GPL-3.0-or-later.txt` - Full GPL-3.0 license text

### 3. Copyright Attribution

Following the original project's copyright pattern:
- **Original Author**: MYCF711 (2026)
- **Local Modifications**: Applied to maintain compliance

## How to Verify Compliance

1. **Install REUSE tool**:
   ```bash
   pip install reuse
   ```

2. **Check compliance**:
   ```bash
   reuse lint
   ```

3. **View compliance report**:
   ```bash
   reuse compliance
   ```

## Why REUSE Compliance Matters

- **Legal Compliance**: Ensures proper licensing attribution and compliance
- **Machine-Readable**: Makes copyright information easily processable
- **Maintainable**: Centralized declarations are easier to manage than individual file headers
- **Future-Proof**: Aligns with modern open source licensing best practices

## File Changes Made

1. **Removed** individual SPDX headers from JavaScript files (to avoid duplication)
2. **Added** `REUSE.toml` for centralized declarations
3. **Added** `LICENSES/` directory with license text
4. **Maintained** original copyright attribution from `client/client.js`

This approach ensures compliance while keeping source code clean and maintainable.