# Teknik Detaylar ve Kod Analizi

**Analiz Tarihi:** 25 Aralık 2025

---

## 📊 Kod Metrikleri ve İstatistikler

### Dosya Bazlı Analiz

| Kategori | Dosya Sayısı | Toplam LoC (Tahmini) |
|----------|-------------|---------------------|
| **Main Process** | 7 | ~3,500 |
| **Renderer (Pages)** | 3 | ~1,400 |
| **Renderer (Components)** | 1 | ~500 |
| **Redux (Slices/Store)** | 3 | ~800 |
| **Utils** | 4 | ~600 |
| **Types** | 3 | ~200 |
| **Templates (Backend)** | 5 | ~500 |
| **Templates (Frontend)** | 7 | ~1,500 |
| **TOPLAM** | ~33 | ~9,000 |

### Stack Dağılımı

```
TypeScript: 85%
Handlebars: 10%
JSON/Config: 5%
```

### Complexity Analizi

**En Karmaşık Dosyalar:**
1. `modelCreator.ts` - 845 LoC, Cyclomatic Complexity: High
2. `schemaParser.ts` - 753 LoC, Cyclomatic Complexity: High
3. `frontendGenerator.ts` - 615 LoC, Cyclomatic Complexity: Medium-High
4. `SchemaDesignPage.tsx` - 696 LoC, Cyclomatic Complexity: Medium

**Refactoring Gerektiren Fonksiyonlar:**
- `parseMongooseSchema()` - 150+ LoC
- `generateMongooseModel()` - 200+ LoC
- `generateFrontend()` - 100+ LoC
- `generateBackend()` - 100+ LoC

---

## 🔍 Detaylı Kod İncelemesi

### 1. Schema Parser Detayları

#### 1.1 Mongoose Parsing Algoritması

```typescript
// schemaParser.ts - Mongoose Schema Parsing
function parseMongooseSchema(content: string): SchemaDefinition {
  // STEP 1: Find Schema Definition
  const schemaRegex = /new\s+Schema\s*<([^>]*)>\s*\(\s*\{([\s\S]*?)\}\s*,/;
  const match = content.match(schemaRegex);
  
  if (!match) {
    throw new Error('Schema definition not found');
  }
  
  const [_, interfaceName, schemaBody] = match;
  
  // STEP 2: Parse Field Definitions
  const fields = parseSchemaFields(schemaBody);
  
  // STEP 3: Parse Interface (for type info)
  const interfaceFields = parseInterface(content, interfaceName);
  
  // STEP 4: Merge schema + interface data
  return mergeFieldData(fields, interfaceFields);
}
```

**Parsing Challenges:**

1. **Nested Objects**
```typescript
// Complex case:
address: {
  type: {
    street: { type: String },
    city: { type: String }
  }
}

// Solution: Recursive parsing
function parseNestedSchema(obj: any, depth = 0): SchemaField[] {
  if (depth > 3) throw new Error('Too deep nesting');
  // ... recursive logic
}
```

2. **Array Types**
```typescript
// Case 1: Simple array
tags: [String]

// Case 2: Schema array
tags: [{ type: String }]

// Case 3: Schema.Types array
tags: [{ type: Schema.Types.ObjectId, ref: 'Tag' }]

// Detection logic:
const isArray = /^\[/.test(fieldValue);
const arrayType = extractArrayType(fieldValue);
```

3. **Ref (Relations)**
```typescript
// Pattern: ref: 'User'
const refMatch = fieldDef.match(/ref:\s*['"]([^'"]+)['"]/);
if (refMatch) {
  field.ref = refMatch[1];
  field.type = 'schema'; // Mark as relation
}
```

#### 1.2 Type Mapping

```typescript
const mongooseTypeMap: Record<string, string> = {
  'String': 'string',
  'Number': 'number',
  'Boolean': 'boolean',
  'Date': 'Date',
  'Schema.Types.ObjectId': 'schema',
  'mongoose.Types.ObjectId': 'schema',
  'ObjectId': 'schema',
  'Mixed': 'any',
  'Array': 'array',
  'Buffer': 'Buffer',
  'Map': 'Map',
};

function mapMongooseTypeToTS(mongooseType: string): string {
  return mongooseTypeMap[mongooseType] || 'any';
}
```

#### 1.3 Interface Parsing

```typescript
// Pattern matching for interface
const interfaceRegex = /interface\s+(\w+)(?:\s+extends\s+(\w+))?\s*\{([\s\S]*?)\}/g;

function parseInterface(content: string, interfaceName: string): FieldInfo[] {
  const match = content.match(new RegExp(
    `interface\\s+${interfaceName}[\\s\\S]*?\\{([\\s\\S]*?)\\}`
  ));
  
  if (!match) return [];
  
  const body = match[1];
  const fields: FieldInfo[] = [];
  
  // Parse each line
  const lines = body.split('\n');
  for (const line of lines) {
    // Pattern: name: type; or name?: type;
    const fieldMatch = line.match(/(\w+)(\?)?:\s*([^;]+);/);
    if (fieldMatch) {
      const [_, name, optional, type] = fieldMatch;
      fields.push({
        name,
        type: type.trim(),
        required: !optional,
        isArray: type.includes('[]')
      });
    }
  }
  
  return fields;
}
```

---

### 2. Code Generation Engine

#### 2.1 Handlebars Template Compilation

```typescript
// codeGenerator.ts
export function generateCode(
  templateName: string,
  schema: SchemaDefinition,
  outputPath: string,
  outputFileName: string
): GenerateCodeResult {
  // 1. Register helpers (custom functions)
  registerHandlebarsHelpers();
  
  // 2. Load template file
  const templatePath = join(templatesDir, `${templateName}.hbs`);
  const templateContent = readFileSync(templatePath, 'utf-8');
  
  // 3. Compile template
  const template = Handlebars.compile(templateContent);
  
  // 4. Render with data
  let code = template(schema);
  
  // 5. Post-processing (placeholder replacement)
  code = code.replace(/OBJ_START/g, '{');
  code = code.replace(/OBJ_END/g, '}');
  
  // 6. Write file
  writeFileSync(outputFilePath, code, 'utf-8');
  
  return { success: true, filePath: outputFilePath };
}
```

#### 2.2 Template Data Structure

**Schema Object Passed to Templates:**

```typescript
{
  entityName: "User",
  camelEntityName: "user",
  fields: [
    {
      name: "email",
      type: "string",
      tsType: "string",
      mongooseType: "String",
      required: true,
      isArray: false,
      unique: true,
      trim: true,
      // UI Config
      label: "E-posta",
      uiComponent: "TextField",
      showInTable: true,
      showInForm: true,
      isSearchable: true
    },
    {
      name: "userId",
      type: "schema",
      tsType: "mongoose.Types.ObjectId",
      mongooseType: "Schema.Types.ObjectId",
      ref: "User",
      required: true,
      isArray: false,
      // Relation Config
      includeRelation: true,
      relationEntityName: "User",
      relationProperty: "name",
      // UI Config
      label: "Kullanıcı",
      uiComponent: "Select",
      showInTable: true,
      showInForm: true
    }
  ],
  hasTimestamps: true,
  timestamps: {
    createdAt: true,
    updatedAt: true
  },
  // Computed properties (via helpers)
  hasSearchableFields: true,
  hasSchemaType: true
}
```

#### 2.3 Handlebars Helper Functions

```typescript
// templateHelpers.ts

// 1. Date Helper
Handlebars.registerHelper('currentDate', () => {
  return new Date().toLocaleString('tr-TR');
});

// 2. Equality Helper
Handlebars.registerHelper('eq', (a, b) => a === b);

// Usage in template:
// {{#if (eq field.type "string")}}
//   <TextField />
// {{/if}}

// 3. camelCase Helper
Handlebars.registerHelper('toCamelCase', (str: string) => {
  return str.charAt(0).toLowerCase() + str.slice(1);
});

// 4. Searchable Fields Check
Handlebars.registerHelper('hasSearchableFields', (fields) => {
  return fields.some(f => f.isSearchable === true);
});

// 5. Type Mapping Helper
Handlebars.registerHelper('getType', (type: string) => {
  if (type === 'schema') return 'mongoose.Types.ObjectId';
  if (type === 'date') return 'Date';
  return type;
});
```

#### 2.4 Template Example Analysis

**Backend Model Template (`model.hbs`):**

```handlebars
{{!-- Auto-generated header --}}
// Auto Generated By Generator - {{currentDate}}

{{!-- Imports --}}
import mongoose, { Document, Schema } from 'mongoose';

{{!-- Interface Definition --}}
export interface {{interfaceName}} extends Document {
{{#each fields}}
  {{name}}: {{tsType}}{{#if isArray}}[]{{/if}};
{{/each}}
}

{{!-- Schema Definition --}}
const {{schemaName}} = new Schema<{{interfaceName}}>(
  {
{{#each fields}}
    {{name}}: {
      type: {{mongooseType}}{{#if isArray}}[]{{/if}},
      {{#if required}}required: true,{{/if}}
      {{#if unique}}unique: true,{{/if}}
      {{#if ref}}ref: '{{ref}}',{{/if}}
    }{{#unless @last}},{{/unless}}
{{/each}}
  },
  {
    {{#if hasTimestamps}}
    timestamps: true,
    {{/if}}
    versionKey: false
  }
);

{{!-- Model Export --}}
export default mongoose.model<{{interfaceName}}>(
  '{{entityName}}',
  {{schemaName}}
);
```

**Output Example:**

```typescript
// Auto Generated By Generator - 25.12.2025 15:30:00
import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  name: string;
  email: string;
  age: number;
  tags: string[];
}

const UserSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
    },
    age: {
      type: Number,
    },
    tags: {
      type: [String],
    }
  },
  {
    timestamps: true,
    versionKey: false
  }
);

export default mongoose.model<IUser>('User', UserSchema);
```

---

### 3. Code Injection Mekanizması

#### 3.1 Route Injection

**Problem:** Yeni route'u `src/routes/index.ts`'e eklemek

**Solution:**

```typescript
// injector.ts
export function injectRoute(
  routesIndexPath: string,
  entityName: string,
  importStatement: string,
  useStatement: string
): void {
  // 1. Read existing file
  let content = existsSync(routesIndexPath)
    ? readFileSync(routesIndexPath, 'utf-8')
    : createDefaultRoutesIndex();
  
  // 2. Check if already exists
  if (content.includes(importStatement)) {
    log('Route already exists, skipping injection');
    return;
  }
  
  // 3. Find injection points
  const lastImportIndex = findLastImportIndex(content);
  const lastUseIndex = findLastAppUseIndex(content);
  
  // 4. Inject import
  content = injectAt(content, lastImportIndex, importStatement + '\n');
  
  // 5. Inject use statement
  content = injectAt(content, lastUseIndex, useStatement + '\n');
  
  // 6. Write back
  writeFileSync(routesIndexPath, content, 'utf-8');
  log(`Route injected: ${entityName}`);
}

function findLastImportIndex(content: string): number {
  const importRegex = /import .+ from .+;/g;
  const matches = Array.from(content.matchAll(importRegex));
  
  if (matches.length === 0) {
    // No imports, insert at beginning
    return 0;
  }
  
  const lastImport = matches[matches.length - 1];
  return lastImport.index! + lastImport[0].length;
}

function findLastAppUseIndex(content: string): number {
  const useRegex = /router\.use\(.+\);/g;
  const matches = Array.from(content.matchAll(useRegex));
  
  if (matches.length === 0) {
    // No uses, insert before export
    const exportIndex = content.indexOf('export default');
    return exportIndex !== -1 ? exportIndex : content.length;
  }
  
  const lastUse = matches[matches.length - 1];
  return lastUse.index! + lastUse[0].length;
}
```

**Generated Injection:**

```typescript
// Before:
import { Router } from 'express';
const router = Router();

// Add routes here

export default router;

// After:
import { Router } from 'express';
import userRoutes from './user'; // INJECTED

const router = Router();

// Add routes here
router.use('/user', userRoutes); // INJECTED

export default router;
```

#### 3.2 Reducer Injection

```typescript
// injector.ts
export function injectReducer(
  storeIndexPath: string,
  entityName: string,
  sliceImport: string,
  reducerEntry: string
): void {
  let content = existsSync(storeIndexPath)
    ? readFileSync(storeIndexPath, 'utf-8')
    : createDefaultStore();
  
  // Check if already exists
  if (content.includes(sliceImport)) {
    return;
  }
  
  // Find reducer object
  const reducerRegex = /reducer:\s*\{([^}]*)\}/;
  const match = content.match(reducerRegex);
  
  if (match) {
    const existingReducers = match[1];
    const newReducers = existingReducers.trim()
      ? `${existingReducers},\n    ${reducerEntry}`
      : `\n    ${reducerEntry}\n  `;
    
    content = content.replace(
      reducerRegex,
      `reducer: {${newReducers}}`
    );
  }
  
  // Inject import at top
  const lastImportIndex = findLastImportIndex(content);
  content = injectAt(content, lastImportIndex, sliceImport + '\n');
  
  writeFileSync(storeIndexPath, content, 'utf-8');
}
```

**Generated Injection:**

```typescript
// Before:
import { configureStore } from '@reduxjs/toolkit';
import appReducer from './features/appSlice';

export const store = configureStore({
  reducer: {
    app: appReducer
  }
});

// After:
import { configureStore } from '@reduxjs/toolkit';
import appReducer from './features/appSlice';
import userReducer from './slices/user.slice'; // INJECTED

export const store = configureStore({
  reducer: {
    app: appReducer,
    user: userReducer // INJECTED
  }
});
```

---

### 4. IPC Communication Pattern

#### 4.1 Main Process Handler

```typescript
// src/main/index.ts
ipcMain.handle(
  'project:generateBackend',
  async (event, { schema, projectPath, isProtectedRoute, sourceType }) => {
    try {
      const result = generateBackend(
        schema,
        projectPath,
        isProtectedRoute,
        sourceType
      );
      
      return result; // { success: true, files: {...} }
    } catch (error) {
      log(`Error: ${error.message}`, 'error');
      return {
        success: false,
        error: error.message
      };
    }
  }
);
```

#### 4.2 Preload Script (IPC Bridge)

```typescript
// src/preload/index.ts
import { contextBridge, ipcRenderer } from 'electron';

contextBridge.exposeInMainWorld('electronAPI', {
  project: {
    generateBackend: (args: GenerateBackendArgs) => 
      ipcRenderer.invoke('project:generateBackend', args),
    
    generateFrontend: (args: GenerateFrontendArgs) =>
      ipcRenderer.invoke('project:generateFrontend', args),
    
    // ... other methods
  },
  
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory')
  }
});

// TypeScript declarations
declare global {
  interface Window {
    electronAPI: {
      project: {
        generateBackend: (args: GenerateBackendArgs) => Promise<Result>;
        generateFrontend: (args: GenerateFrontendArgs) => Promise<Result>;
      };
      dialog: {
        openDirectory: () => Promise<OpenDialogResult>;
      };
    };
  }
}
```

#### 4.3 Renderer Process (React + Redux)

```typescript
// src/renderer/src/features/project/projectSlice.ts
import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';

// Async Thunk for IPC call
export const generateBackend = createAsyncThunk(
  'project/generateBackend',
  async (args: GenerateBackendArgs) => {
    const result = await window.electronAPI.project.generateBackend(args);
    
    if (!result.success) {
      throw new Error(result.error);
    }
    
    return result;
  }
);

// Redux Slice
const projectSlice = createSlice({
  name: 'project',
  initialState: {
    generatingBackendStatus: 'idle',
    generatingBackendError: null,
    lastGeneratedBackendFiles: null
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(generateBackend.pending, (state) => {
        state.generatingBackendStatus = 'generating';
        state.generatingBackendError = null;
      })
      .addCase(generateBackend.fulfilled, (state, action) => {
        state.generatingBackendStatus = 'success';
        state.lastGeneratedBackendFiles = action.payload.files;
      })
      .addCase(generateBackend.rejected, (state, action) => {
        state.generatingBackendStatus = 'error';
        state.generatingBackendError = action.error.message;
      });
  }
});
```

#### 4.4 Component Usage

```typescript
// src/renderer/src/pages/SchemaDesignPage.tsx
const SchemaDesignPage = () => {
  const dispatch = useAppDispatch();
  const { generatingBackendStatus, generatingBackendError } = useAppSelector(
    state => state.project
  );
  
  const handleGenerate = () => {
    dispatch(generateBackend({
      schema: selectedModelSchema,
      projectPath,
      isProtectedRoute,
      sourceType
    }));
  };
  
  return (
    <Button
      onClick={handleGenerate}
      disabled={generatingBackendStatus === 'generating'}
    >
      {generatingBackendStatus === 'generating' ? 'Generating...' : 'Generate'}
    </Button>
  );
};
```

---

### 5. Logging System

#### 5.1 Logger Implementation

```typescript
// src/main/utils/logger.ts
import { writeFileSync, existsSync, mkdirSync, appendFileSync } from 'fs';
import { join } from 'path';

const LOG_DIR = join(process.cwd(), 'logs');
const isDev = process.env.NODE_ENV === 'development';

type LogLevel = 'info' | 'warn' | 'error' | 'debug';

function getLogFilePath(): string {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  return join(LOG_DIR, `${today}.log`);
}

export function log(message: string, level: LogLevel = 'info'): void {
  const timestamp = new Date().toLocaleString('tr-TR');
  const logEntry = `[${timestamp}] [${level.toUpperCase()}] ${message}\n`;
  
  // Console output (development)
  if (isDev) {
    const colorMap = {
      info: '\x1b[36m',    // Cyan
      warn: '\x1b[33m',    // Yellow
      error: '\x1b[31m',   // Red
      debug: '\x1b[35m'    // Magenta
    };
    console.log(`${colorMap[level]}${logEntry}\x1b[0m`);
  }
  
  // File output
  try {
    if (!existsSync(LOG_DIR)) {
      mkdirSync(LOG_DIR, { recursive: true });
    }
    
    appendFileSync(getLogFilePath(), logEntry, 'utf-8');
  } catch (error) {
    console.error('Failed to write log:', error);
  }
}

export function logGenerate(
  fileName: string,
  filePath: string,
  error?: string
): void {
  if (error) {
    log(`❌ Generation failed: ${fileName} - ${error}`, 'error');
  } else {
    log(`✅ Generated: ${fileName} at ${filePath}`, 'info');
  }
}
```

#### 5.2 Log Format Example

```
[25.12.2025 15:30:45] [INFO] Backend generation started for entity: User
[25.12.2025 15:30:45] [INFO] Using base URL: /api/assety
[25.12.2025 15:30:46] [INFO] ✅ Generated: User.model.ts at /path/to/project/src/models/User.model.ts
[25.12.2025 15:30:46] [INFO] ✅ Generated: user.ts at /path/to/project/src/routes/user.ts
[25.12.2025 15:30:46] [INFO] Route injected: User
[25.12.2025 15:30:46] [ERROR] ❌ Generation failed: service.ts - EACCES: permission denied
```

---

### 6. State Management Akışı

#### 6.1 Redux Store Structure

```typescript
// Global State Shape
interface RootState {
  project: {
    // Project Info
    projectPath: string | null;
    frontendPath: string | null;
    sourceType: SourceType | null;
    
    // Scan Results
    modelsFound: ScannedModel[];
    status: 'idle' | 'scanning' | 'ready' | 'error';
    error: string | null;
    
    // Parsed Schema
    selectedModelSchema: SchemaDefinition | null;
    parsingStatus: 'idle' | 'parsing' | 'success' | 'error';
    parsingError: string | null;
    
    // Generation Status
    generatingBackendStatus: 'idle' | 'generating' | 'success' | 'error';
    generatingBackendError: string | null;
    lastGeneratedBackendFiles: { route?: string; service?: string } | null;
    
    generatingFrontendStatus: 'idle' | 'generating' | 'success' | 'error';
    generatingFrontendError: string | null;
    lastGeneratedFrontendFiles: { page?: string; slice?: string } | null;
    
    // Save Config Status
    savingStatus: 'idle' | 'saving' | 'success' | 'error';
    savingError: string | null;
    lastSavedFilePath: string | null;
    
    // Model Creation
    creatingModelStatus: 'idle' | 'creating' | 'success' | 'error';
    creatingModelError: string | null;
    lastCreatedModelPath: string | null;
  };
}
```

#### 6.2 Action Flow Example

**Scenario: User generates backend code**

```
1. User clicks "Generate Code" button
   ↓
2. Component dispatches action: dispatch(generateBackend({...}))
   ↓
3. Redux Thunk executes async function
   ↓
4. Thunk calls IPC: window.electronAPI.project.generateBackend(...)
   ↓
5. Preload script forwards to Main: ipcRenderer.invoke('project:generateBackend', ...)
   ↓
6. Main process handler executes: generateBackend(schema, path, ...)
   ↓
7. Code generation logic runs (templates, file writes, injection)
   ↓
8. Result returns: { success: true, files: {...} }
   ↓
9. Thunk fulfills, Redux updates state
   ↓
10. React re-renders, shows success snackbar
```

#### 6.3 State Update Patterns

```typescript
// Optimistic Update (not used yet, but could be)
builder.addCase(generateBackend.pending, (state) => {
  state.generatingBackendStatus = 'generating';
  state.generatingBackendError = null;
  // Could optimistically add files to list here
});

// Success Update
builder.addCase(generateBackend.fulfilled, (state, action) => {
  state.generatingBackendStatus = 'success';
  state.lastGeneratedBackendFiles = action.payload.files;
  // Clear error
  state.generatingBackendError = null;
});

// Error Update
builder.addCase(generateBackend.rejected, (state, action) => {
  state.generatingBackendStatus = 'error';
  state.generatingBackendError = action.error.message || 'Unknown error';
  // Clear success data
  state.lastGeneratedBackendFiles = null;
});
```

---

### 7. Performance Considerations

#### 7.1 Bottleneck Analysis

**Measured Operations (Estimated):**

| Operation | Time | Frequency | Impact |
|-----------|------|-----------|--------|
| File Read | 5-20ms | High | Medium |
| Regex Parsing | 50-200ms | Medium | High |
| Template Compilation | 10-50ms | High | Medium |
| File Write | 10-50ms | High | Low |
| Code Injection | 20-100ms | Low | Low |

**Critical Path:**
```
User Action -> IPC Call -> Parse/Generate -> File Write -> Injection -> UI Update
  (instant)    (10ms)      (200-500ms)       (50ms)       (50ms)      (16ms)
```

**Total Time:** ~300-600ms per generation

#### 7.2 Optimization Opportunities

**1. Template Caching:**
```typescript
// Current: Compile every time
const template = Handlebars.compile(templateContent);

// Optimized: Cache compiled templates
const templateCache = new Map<string, HandlebarsTemplateDelegate>();

function getTemplate(name: string): HandlebarsTemplateDelegate {
  if (!templateCache.has(name)) {
    const content = readTemplateFile(name);
    templateCache.set(name, Handlebars.compile(content));
  }
  return templateCache.get(name)!;
}
```

**2. Parallel File Generation:**
```typescript
// Current: Sequential
await generateModel(schema);
await generateRoute(schema);
await generateService(schema);

// Optimized: Parallel
await Promise.all([
  generateModel(schema),
  generateRoute(schema),
  generateService(schema)
]);
```

**3. Lazy Template Loading:**
```typescript
// Only load templates when needed
const templates = {
  get model() { return loadTemplate('model'); },
  get route() { return loadTemplate('route'); },
  // ...
};
```

---

### 8. Error Handling Patterns

#### 8.1 Main Process Errors

```typescript
// Structured error handling
try {
  const result = generateBackend(schema, path, ...);
  return { success: true, ...result };
} catch (error) {
  log(`Generation failed: ${error.message}`, 'error');
  
  // Structured error response
  return {
    success: false,
    error: error instanceof Error ? error.message : 'Unknown error',
    code: error.code,
    stack: isDev ? error.stack : undefined
  };
}
```

#### 8.2 Renderer Process Errors

```typescript
// Redux Thunk error handling
export const generateBackend = createAsyncThunk(
  'project/generateBackend',
  async (args, { rejectWithValue }) => {
    try {
      const result = await window.electronAPI.project.generateBackend(args);
      
      if (!result.success) {
        return rejectWithValue(result.error);
      }
      
      return result;
    } catch (error) {
      return rejectWithValue(
        error instanceof Error ? error.message : 'Network error'
      );
    }
  }
);
```

#### 8.3 User-Friendly Error Display

```typescript
// Component error handling
useEffect(() => {
  if (generatingBackendStatus === 'error') {
    // Parse error and show actionable message
    const errorMessage = parseErrorMessage(generatingBackendError);
    
    setSnackbarMessage(errorMessage);
    setSnackbarSeverity('error');
    setSnackbarOpen(true);
  }
}, [generatingBackendStatus, generatingBackendError]);

function parseErrorMessage(error: string): string {
  if (error.includes('EACCES')) {
    return 'İzin hatası: Dosyaya yazma izni yok. Klasör izinlerini kontrol edin.';
  }
  if (error.includes('ENOENT')) {
    return 'Dosya bulunamadı: Proje yolunu kontrol edin.';
  }
  return `Hata: ${error}`;
}
```

---

## 🔧 Development Workflow

### Build Process

```bash
# 1. Build Electron main process
node build-electron.js
# Outputs: dist-electron/main.js, dist-electron/preload.js

# 2. Build React app
vite build
# Outputs: dist/index.html, dist/assets/

# 3. Package application
electron-builder
# Outputs: Platform-specific installers
```

### Development Mode

```bash
# Terminal 1: Build Electron (watch mode would be manual)
npm run build:electron

# Terminal 2: Start Vite dev server + Electron
npm run electron:dev
# - Starts Vite on http://localhost:5173
# - Waits for server to be ready
# - Launches Electron window
# - Hot reload for React (via Vite)
# - Manual rebuild for Electron main process
```

---

## 📝 Öneriler ve Notlar

### Kod Kalitesi İyileştirmeleri

1. **ESLint ve Prettier Ekle**
```bash
npm install --save-dev eslint @typescript-eslint/parser @typescript-eslint/eslint-plugin prettier
```

2. **Husky + Lint-Staged**
```json
{
  "lint-staged": {
    "*.{ts,tsx}": ["eslint --fix", "prettier --write"]
  }
}
```

3. **Unit Test Framework**
```bash
npm install --save-dev vitest @testing-library/react
```

### Performans İyileştirmeleri

1. Template caching eklenmeli
2. Parallel file generation kullanılmalı
3. Worker threads (büyük dosyalar için)

### Genişletilebilirlik

1. Plugin architecture tasarlanmalı
2. Custom template support eklenmeli
3. API documentation yazılmalı

---

**Doküman Sonu**


