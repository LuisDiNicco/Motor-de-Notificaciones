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
| **Backend — Testing** | ✅ 161/161 unit, 44/44 E2E | 36 suites, 11 E2E suites |
| **Frontend — Todas las fases** | ✅ Completo | Auth, dashboard, detalle, portfolio, alertas, watchlist, preferencias, notificaciones |
| **Frontend — Testing** | ✅ 77/77 unit, 3/3 E2E | 28 archivos de test |
| **Infraestructura** | ✅ Completo | Docker Compose, scripts de QA |

### Problemas Conocidos del MVP

- Datos de mercado inestables (Data912 caídas, Yahoo Finance falla con `.BA`)
- LECAPs posiblemente vencidas en catálogo
- Sin validación cruzada de datos entre fuentes
- Sin indicadores de frescura en la UI
- Gráficos vacíos para algunos activos (sin datos históricos)

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
| R2-B07 | Renta Fija — TIR, TNA/TEA | ✅ Completa | Cálculo `YTM` para bonos, `TNA/TEA` para LECAP/BONCAP, calendario estático de cupones (AL30/AL35/GD30/GD35/GD38/GD41/GD46), enriquecimiento de `GET /api/v1/market-data/assets/:ticker` y tests unitarios |
| R2-B08 | MEP/CCL — Cálculo Propio | ✅ Completa | `MEPCCLCalculationService` con cálculo por paridad de bonos (AL30/AL30D y GD30/GD30 NYSE), `MEPCCLCalculationJob` (cron mercado abierto cada 5 min), persistencia de `DOLLAR_MEP_CALC`/`DOLLAR_CCL_CALC`, publicación WebSocket y validación cruzada vs MEP/CCL externos |
| R2-B09 | Datos Históricos — Backfill | ✅ Completa | `HistoricalBackfillService` con backfill diario de 1 año para top 20 `STOCK` + top 20 `CEDEAR`, persistencia en `market_quotes` con deduplicación por upsert, fallback de proveedor histórico y `HistoricalBackfillJob` cron diario 4 AM |
| R2-B10 | Noticias — Agregación RSS | ✅ Completa | Nuevo módulo `news` (hexagonal) con `NewsArticle`, `INewsRepository`, `FetchLatestNewsUseCase`, `GetNewsByTickerUseCase`, `TypeOrmNewsRepository`, `RSSFeedClient` (Ámbito/Cronista/Infobae, deduplicación por URL, ticker detection por catálogo), `NewsAggregationJob` cada 30 min + limpieza TTL 7 días, endpoint `GET /api/v1/news` (filtro `ticker`) y evento WebSocket `news:latest` |
| R2-B11 | Enrichment de Cotizaciones | ✅ Completa | Migración en `market_quotes` para `source` + `sourceTimestamp` + `confidence`, enriquecimiento opcional propagado a dominio/repositorio/servicio, respuestas de market-data y eventos WebSocket `market:quote` con metadata backward-compatible, tests de DTO/serialización verdes |
| R2-B12 | Alertas — Validación E2E Real | ✅ Completa | Test E2E realista `test/alert-flow-real.e2e-spec.ts`, métricas de ciclo en `AlertEvaluationConsumer` (evaluated/triggered/published/durationMs) y smoke script `scripts/alert-flow-smoke.js` |
| R2-B13 | Portfolio — Precios Reales | ✅ Completa | `PortfolioService` prioriza quotes persistidas (`market_quotes`) para holdings/performance, usa `sourceTimestamp`, expone `priceAge` + `isStale` y mantiene interpolación por último valor conocido con tests de stale/interpolación |
| R2-B14 | QA de Datos Automatizado | ✅ Completa | `market-data-quality.js` compara precios de backend vs referencia Rava, reporta desvíos >3%, faltantes y stale; `market-assets-quality.js` valida vencidos activos + cobertura panel Merval; `provider-health-check.js` valida snapshot interno + ping HTTP directo por provider; comando unificado `npm run verify:data:quality` |
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
| Tests unitarios backend | 161 passing | +~50 nuevos |
| Tests E2E backend | 44 passing | +~15 nuevos |
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
| 2026-03-02 | R2-B07 completada: `FixedIncomeCalculator` con `calculateYTM` (bonos) y `calculateTNATEA` (zero coupon), dataset estático `FixedIncomeReferenceData` con calendario de cupones para AL30/AL35/GD30/GD35/GD38/GD41/GD46, enriquecimiento del endpoint `GET /api/v1/market-data/assets/:ticker` con bloque `fixedIncome` y cobertura de tests unitarios en `MarketDataService` + cálculos financieros. |
| 2026-03-02 | R2-B08 completada: implementación de `MEPCCLCalculationService` usando `ProviderOrchestrator` para precios de bonos (AL30/AL30D y GD30/GD30), cálculo de dólar MEP/CCL por paridad, persistencia en `dollar_quotes` como `DOLLAR_MEP_CALC` y `DOLLAR_CCL_CALC`, `MEPCCLCalculationJob` (cron cada 5 min en mercado abierto), emisión por WebSocket y validación cruzada con fuentes externas (`MEP`/`CCL`) con warning por desvío >2%. |
| 2026-03-02 | R2-B09 completada: implementación de `HistoricalBackfillService` para backfill de históricos (1 año) en top 20 acciones + top 20 CEDEARs, persistencia por lotes en `market_quotes` con estrategia idempotente (upsert), fallback a proveedor histórico secundario cuando falla el primario, `HistoricalBackfillJob` diario (4 AM) y cobertura de tests unitarios del servicio. |
| 2026-03-02 | R2-B10 completada: creación del módulo `news` con arquitectura hexagonal, migración `news_articles`, `RSSFeedClient` para feeds RSS/Atom de Ámbito/Cronista/Infobae con extracción de metadatos y detección de tickers contra catálogo activo, `FetchLatestNewsUseCase` con deduplicación por URL y limpieza de noticias antiguas (TTL), `NewsAggregationJob` cada 30 minutos, endpoint `GET /api/v1/news` con filtro `ticker`, emisión WebSocket `news:latest`, tests unitarios (parsing/dedup/ticker detection) y test E2E del endpoint. |
| 2026-03-02 | R2-B11 completada: migración `AddQuoteEnrichmentFields` para `market_quotes` (`source`, `sourceTimestamp`, `confidence`), actualización de `MarketQuote`/`MarketQuoteEntity`/`TypeOrmQuoteRepository` para persistir y leer metadatos de fuente/confianza, enriquecimiento al refrescar cotizaciones en `MarketDataService` (incluye metadatos en eventos publicados y updates), actualización de payload WebSocket `market:quote` con campos opcionales y tests de serialización/DTO (`market-data.e2e` + `MarketQuote.spec`) en verde. |
| 2026-03-02 | R2-B12 completada: validación E2E realista del flujo market→alert→notification en `test/alert-flow-real.e2e-spec.ts` (repositorios in-memory + servicios reales), extensión de `AlertEvaluationEngine` con variantes `WithStats` para medir evaluadas/disparadas, logging de métricas por ciclo en `AlertEvaluationConsumer` y script smoke operativo `scripts/alert-flow-smoke.js` con publicación real a RabbitMQ y verificación de notificaciones vía API. |
| 2026-03-02 | R2-B13 completada: `PortfolioService` ahora calcula holdings con precio más reciente y `sourceTimestamp`, expone frescura por holding (`priceAge`, `isStale`) usando threshold configurable (`DATA_STALE_THRESHOLD_MINUTES`), y genera performance por período con interpolación de días sin cotización manteniendo último valor conocido (sin ceros artificiales); cobertura agregada en `PortfolioService.spec` para stale/interpolación. |
| 2026-03-02 | R2-B14 completada: actualización de scripts de calidad en runtime: `scripts/market-data-quality.js` (comparación backend vs referencia Rava, desvíos >3%, precios faltantes y stale > threshold), `scripts/market-assets-quality.js` (validación de activos vencidos marcados como activos y cobertura de tickers del panel líder Merval), nuevo `scripts/provider-health-check.js` (reporte y umbrales de salud por provider), y comando unificado `npm run verify:data:quality` integrado en `verify:backend:runtime`. |
| 2026-03-02 | Auditoría profunda backend (B01–B14): cierre de desvíos finos — B13 ajustado para priorizar lectura de `market_quotes` persistida en holdings/performance antes de fallback a proveedor; B14 ajustado para que `scripts/provider-health-check.js` ejecute ping HTTP directo por provider además del snapshot interno. Revalidación completa en verde (`lint`, `test:unit`, `test:e2e`). |
