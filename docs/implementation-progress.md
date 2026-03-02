# NotiFinance — Progreso de Implementación

**Última actualización:** 2026-03-02  

---

## Estado del Proyecto

### Release 1 (MVP) — COMPLETADA

El MVP fue entregado con la siguiente cobertura:

| Área | Estado | Detalle |
|---|---|---|
| **Backend — Auth** | ✅ Completo | JWT RS256, registro, login, refresh, perfil |
| **Backend — Market Data** | ✅ Completo (con limitaciones) | Data912, MultiSourceDollar, RiskProvider, Yahoo fallback |
| **Backend — Alertas** | ✅ Completo | Motor de evaluación, 4 tipos, cron, persistencia |
| **Backend — Notificaciones** | ✅ Completo | Templating, WebSocket, persistencia, mark-read |
| **Backend — Portfolio** | ✅ Completo | Holdings, performance, P&L |
| **Backend — Watchlist** | ✅ Completo | CRUD, favoritos, watchlist por defecto |
| **Backend — Preferences** | ✅ Completo | Preferencias por usuario |
| **Backend — Template** | ✅ Completo | 7 plantillas de notificación |
| **Backend — Ingestion** | ✅ Completo | Event-driven con RabbitMQ |
| **Backend — Testing** | ✅ 124/124 unit, 40/40 E2E | 20 suites, 9 E2E suites |
| **Frontend — Todas las fases** | ✅ Completo | Auth, dashboard, detalle, portfolio, alertas, watchlist, preferencias, notificaciones |
| **Frontend — Testing** | ✅ 77/77 unit, 3/3 E2E | 28 archivos de test |
| **Infraestructura** | ✅ Completo | Docker Compose, scripts de QA |

### Problemas Conocidos del MVP

- Datos de mercado inestables (Data912 caídas, Yahoo Finance falla con `.BA`)
- LECAPs posiblemente vencidas en catálogo
- Sin validación cruzada de datos entre fuentes
- Sin indicadores de frescura en la UI
- Gráficos vacíos para algunos activos (sin datos históricos)
- Alertas no validadas end-to-end con datos reales

---

## Release 2 — Confiabilidad y Calidad de Datos

### Tracking por Fase

| Fase | Nombre | Estado | Notas |
|---|---|---|---|
| R2-B01 | Provider Health Tracking | ✅ Completa | Endpoint `GET /api/v1/health/providers`, tracker + job + tests unit/e2e |
| R2-B02 | Dólar — Nuevas fuentes y validación | ✅ Completa | `ArgentinaDatosClient` + `BCRAClient`, consenso extendido y validación cruzada oficial >2% |
| R2-B03 | Acciones/CEDEARs — Scraper Rava | ✅ Completa | `RavaScraperClient` con robots/rate-limit/user-agent + tests con HTML fixture (sin activar como fuente principal aún) |
| R2-B04 | Acciones/CEDEARs — Cliente BYMA Data | ✅ Completa | `BYMADataClient` con mapeo a formato interno + tests unitarios con fixture (sin activar como fuente principal aún) |
| R2-B05 | Provider Scoring y Orquestación | ✅ Completa | `ProviderScorer` + `ProviderOrchestrator` integrados en refresh de quotes con fallback por score/confianza |
| R2-B06 | Catálogo Dinámico y Limpieza | ✅ Completa | `CatalogMaintenanceJob` semanal, columnas de catálogo (`maturityDate`, `lastCatalogCheck`), detección de tickers nuevos en Data912, filtros de activos inactivos con override explícito |
| R2-B07 | Renta Fija — TIR, TNA/TEA | ⬜ No iniciada | — |
| R2-B08 | MEP/CCL — Cálculo Propio | ⬜ No iniciada | — |
| R2-B09 | Datos Históricos — Backfill | ⬜ No iniciada | — |
| R2-B10 | Noticias — Agregación RSS | ⬜ No iniciada | — |
| R2-B11 | Enrichment de Cotizaciones | ⬜ No iniciada | — |
| R2-B12 | Alertas — Validación E2E Real | ⬜ No iniciada | — |
| R2-B13 | Portfolio — Precios Reales | ⬜ No iniciada | — |
| R2-B14 | QA de Datos Automatizado | ⬜ No iniciada | — |
| R2-F01 | FreshnessIndicator | ⬜ No iniciada | — |
| R2-F02 | Mensajes de Error Contextuales | ⬜ No iniciada | — |
| R2-F03 | Dashboard — Dólar y Riesgo País | ⬜ No iniciada | — |
| R2-F04 | Dashboard — Top Movers y Mercado | ⬜ No iniciada | — |
| R2-F05 | Detalle — Acciones y CEDEARs | ⬜ No iniciada | — |
| R2-F06 | Detalle — Bonos y LECAPs | ⬜ No iniciada | — |
| R2-F07 | Widget de Noticias | ⬜ No iniciada | — |
| R2-F08 | Panel de Salud de Providers | ⬜ No iniciada | — |
| R2-F09 | Portfolio — Indicadores Frescura | ⬜ No iniciada | — |
| R2-F10 | QA Visual y Testing E2E Frontend | ⬜ No iniciada | — |

### Métricas

| Métrica | Valor actual | Target R2 |
|---|---|---|
| Tests unitarios backend | 124 passing | +~50 nuevos |
| Tests E2E backend | 40 passing | +~15 nuevos |
| Tests unitarios frontend | 77 passing | +~30 nuevos |
| Tests E2E frontend | 3 passing | +~5 nuevos |
| Fuentes de datos activas | 5 | 8-10 |
| Precisión dólar vs referencia | No medida | < 2% |
| Cobertura catálogo Merval | Parcial | 100% |
| Cobertura históricos | Baja | Top 20 acciones + CEDEARs |

---

## Log de Cambios

| Fecha | Descripción |
|---|---|
| 2026-02-28 | Documentación R2 creada. Progreso reiniciado para nuevo ciclo de desarrollo. |
| 2026-03-02 | R2-B01 completada: entidad/migración `provider_health`, `ProviderHealthTracker`, `ProviderHealthJob` (cron 5 min), integración en providers HTTP de market-data, endpoint `/api/v1/health/providers` y cobertura de tests unit/e2e. |
| 2026-03-02 | R2-B02 completada: nuevos clientes `ArgentinaDatosClient` y `BCRAClient`, integración en `MultiSourceDollarClient` con consenso ampliado y validación cruzada del dólar oficial contra referencia BCRA (warning >2%), ajuste de job y tests unitarios de clientes/integración. |
| 2026-03-02 | R2-B03 completada: implementación de `RavaScraperClient` (cheerio), validación de `robots.txt`, rate limiting configurable, `User-Agent` configurable, registro en provider health y tests unitarios con fixture HTML de cotizaciones. |
| 2026-03-02 | R2-B04 completada: implementación de `BYMADataClient` para `open.bymadata.com.ar`, mapeo de payload a `MarketQuote`, registro en provider health y tests unitarios con fixture JSON de respuestas. |
| 2026-03-02 | R2-B05 completada: implementación de `ProviderScorer` (uptime/error/latencia/edad), `ProviderOrchestrator` con selección por score y fallback entre `data912`, `rava`, `byma`, `yahoo`, integración en `MarketDataService` para refresh de quotes y cobertura de tests unitarios. |
| 2026-03-02 | R2-B06 completada: nuevas migraciones para catálogo dinámico (`AddAssetCatalogFields`, `UpdateAssetCatalogSeed`), `CatalogMaintenanceJob` semanal (desactiva vencidos, actualiza `lastCatalogCheck`, detecta tickers nuevos en Data912), soporte `includeInactive=true` en listado de activos y tests unitarios del job. |
