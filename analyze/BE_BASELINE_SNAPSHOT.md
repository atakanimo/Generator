# BE Baseline Snapshot (Updated)

Tarih: 7 Mayıs 2026

## Scope

Bu snapshot, BE refactor Phase-1 başlangıcında kontrat ve davranış bazını dondurur.

## Runtime Akış

`SchemaDesignPage -> projectSlice.generateBackend -> preload.generateBackend -> ipcMain('project:generateBackend') -> ipc/backendGenerator.generateBackend -> BackendGenerator.generate`

## Güncellenen Result Kontratı

`GenerateBackendResult.files` alanı aşağıdaki artifact anahtarlarını destekler:

- `model`
- `crud`
- `filters`
- `types`
- `service`
- `serviceAdmin`
- `schema`
- `route`
- `routeAdmin`

## Phase-1'de Bilinçli Olarak Korunanlar

- IPC channel adı değişmedi: `project:generateBackend`
- Renderer çağrı imzası değişmedi
- Route injection davranışı korunur ancak artık update moduna bağlıdır:
  - `updateExistingFiles=false` iken `index.ts/app.ts/server.ts` içine inject yapılmaz
  - `updateExistingFiles=true` iken inject yapılır (idempotent)

## Phase-1'de Değiştirilenler

- BE artifact üretimi manifest/sıralı modele geçiyor.
- Update mode'da delete-and-recreate yerine merge-safe update stratejisi uygulanıyor.
- Output layout module-centric oldu:
  - `src/modules/<module-name>/<module-name>.*.ts`
