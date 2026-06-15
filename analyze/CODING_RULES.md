# Universal Code Generator - Coding Rules & Standards

**Son Güncelleme:** 7 Mayıs 2026  
**Versiyon:** 1.0.0

---

## 📚 İçindekiler

0. [Proje Scope ve Core Principle](#0-proje-scope-ve-core-principle)
1. [Genel Prensipler](#1-genel-prensipler)
2. [Mimari Kuralları](#2-mimari-kuralları)
3. [Kod Organizasyonu](#3-kod-organizasyonu)
4. [TypeScript Standartları](#4-typescript-standartları)
5. [Error Handling](#5-error-handling)
6. [Dosya ve Klasör Yapısı](#6-dosya-ve-klasör-yapısı)
7. [Naming Conventions](#7-naming-conventions)
8. [Yeni Feature Ekleme](#8-yeni-feature-ekleme)
9. [Testing](#9-testing)
10. [Yasaklar](#10-yasaklar)

---

## 0. Proje Scope ve Core Principle

### 0.0 Proje Hakkında

**Universal Code Generator**, backend ve frontend CRUD kodlarını otomatik üreten bir Electron desktop uygulamasıdır.

### 0.1 Application Tech Stack

- **Desktop Runtime:** Electron 28
- **Renderer:** React 18, TypeScript, Redux Toolkit, Material-UI
- **Main Process:** Node.js, TypeScript
- **Template Engine:** Handlebars
- **Build:** Vite, esbuild

### 0.2 Desteklenen / Planlanan Stack'ler

- **Backend:**
  - Node.js + Express + Mongoose: aktif
  - Node.js + TypeORM: planlanan
  - .NET + Entity Framework: planlanan
- **Frontend:**
  - React + Redux Toolkit: aktif
  - React Native Service Integration: planlanan

### Core Generation Principle

Raw model files are never passed directly to templates.

Flow:

Model File  
-> Parser  
-> NormalizedModel  
-> Template Context  
-> Handlebars Template  
-> Generated Files

### 0.3 Development Scripts (Local)

```bash
# Electron dev (Vite + Electron)
yarn dev

# Web-only dev (sadece Vite)
yarn web:dev

# Electron build assets + Vite build
yarn build
```

Example shape:

```typescript
type NormalizedModel = {
  name: string;
  camelName: string;
  pascalName: string;
  kebabName: string;
  fields: NormalizedField[];

  ownership?: {
    field: string;
    normalApiFromAuth: boolean;
    adminApiBodyAllowed: boolean;
    adminApiFilterable: boolean;
  };
};

type NormalizedField = {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'date' | 'objectId' | 'array' | 'object';
  required: boolean;
  filterable?: boolean;
  filterType?: 'regex' | 'exact' | 'objectId' | 'range' | 'boolean' | 'date-range';
  relation?: {
    target: string;
    type: 'oneToOne' | 'oneToMany' | 'manyToOne' | 'manyToMany';
    displayField?: string;
  };
};
```

---

## 1. Genel Prensipler

### 1.1 DRY (Don't Repeat Yourself)

```typescript
// ❌ YANLIŞ: Kod tekrarı
function generateBackend() {
  const content = readFileSync(path, 'utf-8');
  if (!existsSync(dir)) mkdirSync(dir);
  writeFileSync(output, content);
}

function generateFrontend() {
  const content = readFileSync(path, 'utf-8'); // TEKRAR!
  if (!existsSync(dir)) mkdirSync(dir); // TEKRAR!
  writeFileSync(output, content); // TEKRAR!
}

// ✅ DOĞRU: Utility kullan
import { safeReadFile, safeWriteFile, ensureDirectory } from './utils/fileUtils.js';

function generateBackend() {
  const result = safeReadFile(path);
  ensureDirectory(dir);
  safeWriteFile(output, result.content);
}
```

### 1.2 Single Responsibility Principle

```typescript
// ❌ YANLIŞ: Bir fonksiyon çok fazla iş yapıyor
function generateAndInjectAndLog(schema: Schema) {
  // Template render
  const template = Handlebars.compile(readFileSync(...));
  const code = template(schema);

  // File write
  writeFileSync(path, code);

  // Injection
  const indexContent = readFileSync(indexPath);
  // ... injection logic

  // Logging
  log('Generated successfully');
}

// ✅ DOĞRU: Her fonksiyon tek bir iş yapar
class Generator {
  private renderTemplate() { }
  private writeFile() { }
  private injectToIndex() { }
  private logSuccess() { }

  public generate() {
    const code = this.renderTemplate();
    this.writeFile(code);
    this.injectToIndex();
    this.logSuccess();
  }
}
```

### 1.3 Separation of Concerns

```
MAIN PROCESS (Node.js)
├─ Business Logic (generators/)
├─ File Operations (utils/)
├─ IPC Handlers (ipc/)
└─ Templates (templates/)

RENDERER PROCESS (React)
├─ UI Components (components/)
├─ State Management (store/)
├─ Pages (pages/)
└─ Types (types/)
```

**KURAL:** Main process'e UI kodu yazma, Renderer'a file I/O yazma!

---

## 2. Mimari Kuralları

### 2.1 Class-Based Generators

**KURAL:** Tüm generator'lar `BaseGenerator`'dan türemeli

```typescript
// ✅ DOĞRU
export class BackendGenerator extends BaseGenerator {
  constructor(options: BackendGenerateOptions) {
    super(options);  // Validation ve setup
  }

  protected setupDirectories(): string[] {
    return this.getCommonDirectories();
  }

  public generate(): GenerateResult {
    // Implementation
  }
}

// ❌ YANLIŞ
export function generateBackend(...10params) {
  // 300 satır kod
}
```

### 2.2 Utility Usage

**ZORUNLU Utilities:**

```typescript
// File Operations
import { safeReadFile, safeWriteFile, ensureDirectory } from './utils/fileUtils.js';

// Template Engine
import { renderTemplate, compileTemplate } from './utils/templateEngine.js';

// Validation
import { validateSchema, validateDirectory } from './utils/validationUtils.js';

// Error Handling
import { handleError, ErrorCode } from './utils/errorHandler.js';
```

**KURAL:** Asla doğrudan `fs` modülü kullanma, her zaman utility kullan!

```typescript
// ❌ YANLIŞ
import { readFileSync, writeFileSync } from 'fs';
const content = readFileSync(path, 'utf-8');
writeFileSync(output, code);

// ✅ DOĞRU
import { safeReadFile, safeWriteFile } from './utils/fileUtils.js';
const result = safeReadFile(path);
if (result.success) {
  safeWriteFile(output, result.content);
}
```

### 2.3 Template Engine

**KURAL:** Template caching kullan, asla manuel compile etme!

```typescript
// ❌ YANLIŞ
const templateContent = readFileSync(templatePath, 'utf-8');
const template = Handlebars.compile(templateContent); // Her seferinde compile!
const code = template(data);

// ✅ DOĞRU
import { renderTemplate } from './utils/templateEngine.js';
const result = renderTemplate('templateName', data, 'backend');
if (result.success) {
  // Use result.content
}
```

### 2.4 Error Handling Pattern

**KURAL:** Her zaman structured error döndür

```typescript
// ❌ YANLIŞ
function doSomething() {
  throw new Error('Failed'); // Generic error
}

// ✅ DOĞRU
import { handleError, ErrorCode } from './utils/errorHandler.js';

function doSomething(): Result {
  try {
    // Logic
    return { success: true };
  } catch (error) {
    const appError = handleError(error as Error, ErrorCode.GENERATION_FAILED, { context: 'additional info' });
    return {
      success: false,
      error: appError.userMessage,
      code: appError.code
    };
  }
}
```

### 2.5 Safe Update / Custom Block Standardı

Generated files may be updated, but custom blocks must be preserved.

Update existing files aktif olduğunda sıralı akış:

1. Mevcut dosya okunur
2. Custom block'lar extract edilir
3. Yeni template render edilir
4. Custom block'lar yeni output'a merge edilir
5. Dosya yazılır

Kurallar:

- Custom block'lar overwrite edilemez
- Generated alanlar update edilebilir
- Eksik closing marker varsa işlem durmalı
- Eksik marker warning/error olarak loglanmalı

Markers:

```typescript
// <custom-imports>
// </custom-imports>

// <custom-methods>
// </custom-methods>

// <custom-routes>
// </custom-routes>
```

---

## 3. Kod Organizasyonu

### 3.1 Dosya Yapısı

```
src/main/
├── generators/              # ✅ Generator classes buraya
│   ├── BaseGenerator.ts
│   ├── BackendGenerator.ts
│   └── FrontendGenerator.ts
├── ipc/                     # ✅ IPC wrappers (backward compatibility)
│   ├── backendGenerator.ts  # Wrapper function
│   └── frontendGenerator.ts # Wrapper function
├── utils/                   # ✅ Shared utilities
│   ├── fileUtils.ts
│   ├── templateEngine.ts
│   ├── validationUtils.ts
│   └── errorHandler.ts
├── templates/               # ✅ Handlebars templates
│   ├── backend/
│   └── frontend/
└── index.ts                 # ✅ IPC handlers
```

### 3.2 Import Sıralaması

```typescript
// 1. Node.js built-ins
import { join } from 'path';

// 2. Third-party
import Handlebars from 'handlebars';

// 3. Internal - Generators
import { BaseGenerator } from '../generators/BaseGenerator.js';

// 4. Internal - Utils
import { safePathExists, safeWriteFile } from '../utils/fileUtils.js';
import { renderTemplate } from '../utils/templateEngine.js';

// 5. Internal - Types
import { SchemaDefinition } from './schemaParser.js';

// 6. Internal - Logger (always last)
import { log } from '../utils/logger.js';
```

---

## 4. TypeScript Standartları

### 4.1 Type Safety

```typescript
// ❌ YANLIŞ
function generate(options: any) {
  // any kullanma!
  const result: any = doSomething();
  return result;
}

// ✅ DOĞRU
interface GenerateOptions {
  schema: SchemaDefinition;
  projectPath: string;
  sourceType?: SourceType;
}

interface GenerateResult {
  success: boolean;
  files?: Record<string, string>;
  error?: string;
}

function generate(options: GenerateOptions): GenerateResult {
  // Implementation
}
```

### 4.2 Interface Naming

```typescript
// ✅ Generator Options
interface BackendGenerateOptions extends GenerateOptions {}
interface FrontendGenerateOptions extends GenerateOptions {}

// ✅ Results
interface GenerateResult {}
interface FileReadResult {}
interface ValidationResult {}

// ✅ Configs
interface WebhookConfig {}
interface TemplateConfig {}
```

### 4.3 Enum Usage

```typescript
// ✅ DOĞRU: Error codes
export enum ErrorCode {
  FILE_NOT_FOUND = 'FILE_NOT_FOUND',
  INVALID_SCHEMA = 'INVALID_SCHEMA',
  GENERATION_FAILED = 'GENERATION_FAILED'
}

// ✅ DOĞRU: String literal union
export type SourceType = 'nodejs-mongoose' | 'nodejs-typeorm' | 'dotnet-ef';

// ❌ YANLIŞ: Magic strings
if (type === 'mongoose') {
} // Use SourceType!
```

---

## 5. Error Handling

### 5.1 Error Structure

```typescript
// ✅ DOĞRU: Structured error
import { handleError, ErrorCode } from './utils/errorHandler.js';

try {
  // Logic
} catch (error) {
  const appError = handleError(error as Error, ErrorCode.GENERATION_FAILED, {
    entityName: schema.entityName,
    filePath: outputPath
  });

  log(appError.message, 'error');

  return {
    success: false,
    error: appError.userMessage, // Türkçe, user-friendly
    code: appError.code
  };
}
```

### 5.2 User-Friendly Messages

```typescript
// ❌ YANLIŞ
return { error: 'ENOENT: no such file or directory' };

// ✅ DOĞRU
return {
  error: 'Dosya bulunamadı: /path/to/file\nDosya yolunu kontrol edin.',
  code: ErrorCode.FILE_NOT_FOUND
};
```

---

## 6. Dosya ve Klasör Yapısı

### 6.1 Generator Dosyaları

```
src/main/generators/
├── BaseGenerator.ts         # Abstract base class
├── BackendGenerator.ts      # Backend generation
├── FrontendGenerator.ts     # Frontend generation
└── [NewGenerator.ts]        # Yeni generator buraya
```

**KURAL:** Her yeni generator `BaseGenerator`'dan türemeli!

### 6.2 Utility Dosyaları

```
src/main/utils/
├── fileUtils.ts            # File I/O operations
├── templateEngine.ts       # Template rendering
├── validationUtils.ts      # Input validation
├── errorHandler.ts         # Error handling
├── logger.ts               # Logging
├── injector.ts             # Code injection
└── templateHelpers.ts      # Handlebars helpers
```

**KURAL:** Yeni utility eklerken, benzer utility var mı kontrol et!

### 6.3 Template Dosyaları

```
src/main/templates/
├── backend/
│   └── express-mongoose/
│       ├── model.hbs
│       ├── crud.hbs
│       ├── filters.hbs
│       ├── types.hbs
│       ├── service.hbs
│       ├── admin.service.hbs
│       ├── schema.hbs
│       ├── routes.hbs
│       └── routes.admin.hbs
└── frontend/
    ├── react-mui/
    └── react-native-service/
```

**KURAL:** Template'ler stack tipine göre organize edilmeli!

### 6.4 Backend Generated Module Standard

Each backend module must generate/update the following files:

- `{module}.model.ts`
- `{module}.crud.ts`
- `{module}.filters.ts`
- `{module}.types.ts`
- `{module}.service.ts`
- `{module}.admin.service.ts`
- `{module}.schema.ts`
- `{module}.routes.ts`
- `{module}.routes.admin.ts`

---

## 7. Naming Conventions

### 7.1 Files

```
✅ DOĞRU:
- BackendGenerator.ts       (PascalCase for classes)
- fileUtils.ts              (camelCase for utilities)
- backendGenerator.ts       (camelCase for wrappers)

❌ YANLIŞ:
- backend-generator.ts      (kebab-case kullanma)
- Backend_Generator.ts      (snake_case kullanma)
```

### 7.2 Functions & Methods

```typescript
// ✅ DOĞRU
function generateBackend() {}
function parseModelFile() {}
function safeReadFile() {}

class Generator {
  public generate() {}
  private renderTemplate() {}
  protected setupDirectories() {}
}

// ❌ YANLIŞ
function GenerateBackend() {} // PascalCase fonksiyon için yanlış
function parse_model_file() {} // snake_case kullanma
```

### 7.3 Variables

```typescript
// ✅ DOĞRU
const entityName = 'User';
const camelEntityName = 'user';
const isProtectedRoute = true;

// ❌ YANLIŞ
const EntityName = 'User'; // PascalCase değişken için yanlış
const entity_name = 'User'; // snake_case kullanma
```

---

## 8. Yeni Feature Ekleme

### 8.1 Yeni Generator Ekleme

**Adımlar:**

1. **Generator Class Oluştur:**

```typescript
// src/main/generators/SpringBootGenerator.ts
import { BaseGenerator, GenerateOptions } from './BaseGenerator.js';

export interface SpringBootGenerateOptions extends GenerateOptions {
  // Spring Boot specific options
}

export class SpringBootGenerator extends BaseGenerator {
  constructor(options: SpringBootGenerateOptions) {
    super(options);
  }

  protected setupDirectories(): string[] {
    return [
      // Spring Boot directories
    ];
  }

  public generate(): GenerateResult {
    // Implementation
  }
}
```

2. **Wrapper Function Oluştur:**

```typescript
// src/main/ipc/springBootGenerator.ts
import { SpringBootGenerator } from '../generators/SpringBootGenerator.js';

export function generateSpringBoot(
  schema: SchemaDefinition,
  projectPath: string
  // ... parameters
): GenerateResult {
  const generator = new SpringBootGenerator({
    schema,
    projectPath
    // ... options
  });

  return generator.generate();
}
```

3. **IPC Handler Ekle:**

```typescript
// src/main/index.ts
import { generateSpringBoot } from './ipc/springBootGenerator.js';

ipcMain.handle('project:generateSpringBoot', async (_, args) => {
  try {
    return generateSpringBoot(...args);
  } catch (error) {
    // Error handling
  }
});
```

4. **Templates Ekle:**

```
src/main/templates/spring/
├── entity.hbs
├── repository.hbs
├── service.hbs
└── controller.hbs
```

### 8.2 Yeni Utility Ekleme

```typescript
// src/main/utils/[newUtil].ts

/**
 * [Utility Description]
 * [Purpose and usage]
 */

// Interfaces
export interface UtilityResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
}

// Main function
export function utilityFunction(param: string): UtilityResult<string> {
  try {
    // Implementation
    return { success: true, data: result };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}
```

---

## 9. Testing

### 9.1 Test Structure (Gelecek için)

```typescript
// __tests__/utils/fileUtils.test.ts
import { describe, it, expect } from 'vitest';
import { safeReadFile, safeWriteFile } from '../utils/fileUtils';

describe('fileUtils', () => {
  describe('safeReadFile', () => {
    it('should read file successfully', () => {
      const result = safeReadFile('/path/to/file');
      expect(result.success).toBe(true);
      expect(result.content).toBeDefined();
    });

    it('should handle file not found', () => {
      const result = safeReadFile('/nonexistent');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });
  });
});
```

### 9.2 Test Coverage Hedefleri

```
✅ Utilities: %80+ coverage
✅ Generators: %70+ coverage
✅ IPC Handlers: %60+ coverage
✅ Templates: Manual testing
```

---

## 10. Yasaklar

### 10.1 ❌ ASLA YAPMA

```typescript
// ❌ 1. Doğrudan fs kullanma
import { readFileSync } from 'fs';
const content = readFileSync(path);

// ❌ 2. any kullanma
function process(data: any) { }

// ❌ 3. console.log kullanma (logger kullan)
console.log('Generated');

// ❌ 4. Magic strings/numbers
if (status === 200) { }
if (type === 'mongoose') { }

// ❌ 5. Template'i manuel compile etme
const template = Handlebars.compile(content);

// ❌ 6. Generic error messages
throw new Error('Error');
return { error: 'Failed' };

// ❌ 7. Kod tekrarı
function a() { /* same code */ }
function b() { /* same code */ }

// ❌ 8. Senkron file operations (utility dışında)
writeFileSync(path, content);

// ❌ 9. IPC'de business logic
ipcMain.handle('generate', async (_, data) => {
  // 100 satır business logic ❌
});

// ❌ 10. Renderer'da file I/O
// React component içinde:
fs.readFileSync(...) // ❌ ASLA!
```

### 10.2 ✅ HER ZAMAN YAP

```typescript
// ✅ 1. Utility kullan
import { safeReadFile } from './utils/fileUtils.js';

// ✅ 2. Type safety
function process(data: ProcessData): Result { }

// ✅ 3. Logger kullan
import { log } from './utils/logger.js';
log('Generated successfully', 'info');

// ✅ 4. Constants kullan
const HTTP_OK = 200;
enum SourceType { MONGOOSE = 'mongoose' }

// ✅ 5. Template engine kullan
import { renderTemplate } from './utils/templateEngine.js';

// ✅ 6. Structured errors
const appError = handleError(error, ErrorCode.FAILED, context);

// ✅ 7. Utility'e taşı
import { sharedFunction } from './utils/common.js';

// ✅ 8. Async/await + utility
const result = await safeWriteFile(path, content);

// ✅ 9. Class'ta business logic
class Generator {
  public generate() { /* business logic */ }
}

// ✅ 10. IPC bridge kullan
window.electronAPI.project.generate(...)
```

---

## 11. Code Review Checklist

Her PR'da kontrol edilecekler:

```
□ BaseGenerator'dan türetilmiş mi?
□ Utilities kullanılmış mı? (fs, Handlebars direct kullanımı yok mu?)
□ Type safety var mı? (any yok mu?)
□ Error handling doğru mu? (structured errors)
□ Logging var mı?
□ Validation yapılmış mı?
□ Backward compatibility korunmuş mu?
□ Kod tekrarı var mı?
□ Naming conventions uygun mu?
□ Comments yeterli mi?
□ Build başarılı mı?
□ Manual test yapılmış mı?
```

---

## 12. Performance Best Practices

```typescript
// ✅ Template Caching (otomatik yapılıyor)
const result = renderTemplate('name', data, 'backend');

// ✅ Ordered Generation: dependency order korunur
const files = [
  await generateFile('model'),
  await generateFile('crud'),
  await generateFile('filters'),
  await generateFile('types'),
  await generateFile('service'),
  await generateFile('admin.service'),
  await generateFile('schema'),
  await generateFile('routes'),
  await generateFile('routes.admin')
];

// ✅ Parallel Generation: sadece bağımsız dosyalarda
const independentFiles = await Promise.all([generateFile('readme'), generateFile('docs')]);

// ✅ Lazy Loading
const heavyUtil = await import('./heavyUtil.js');

// ❌ Repeated Compilation
for (const item of items) {
  const template = Handlebars.compile(content); // YANLIŞ!
}
```

---

## 13. Logging Standards

```typescript
// ✅ DOĞRU
logInfo('Model parsed', {
  step: 'model-parse',
  model: normalizedModel.name
});

logError('Generation failed', {
  step: 'service-generation',
  module: 'user-watch-list',
  error
});

// ❌ YANLIŞ
console.log('Started'); // console kullanma
logError('Error'); // Context yok
logInfo(JSON.stringify(obj)); // Structured context yerine dump
```

**Log Levels:**

- `info`: Normal operations
- `warn`: Uyarılar (devam ediyor ama dikkat)
- `error`: Hatalar (işlem başarısız)
- `debug`: Development debugging (production'da kapalı)

---

**Son Güncelleme:** 6 Mayıs 2026
