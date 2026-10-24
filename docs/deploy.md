# Деплой на igrotvorec.games

Приложение и Caddy в Docker Compose на домашнем сервере. Сервер должен быть в одной сети с прокси LLM (`LLM_BASE_URL`), снаружи открыты только 80 и 443.

## Один раз

1. **DNS.** У регистратора домена записи `A` для `igrotvorec.games` и `www.igrotvorec.games` → внешний IP сервера (или роутера). Проверка: `dig +short igrotvorec.games`.
2. **Роутер.** Проброс TCP 80, TCP 443 и UDP 443 (HTTP/3) на сервер. Без 80 Caddy не получит сертификат Let's Encrypt.
3. **Код.** `git clone` репозитория на сервер.
4. **Настройки.** `cp .env.production.example .env`, вписать `LLM_API_KEY`. Остальное уже под домен: `DOMAIN`, `PUBLIC_URL=https://igrotvorec.games` (из него строятся ссылки и QR-коды), лимит `RATE_LIMIT_PER_HOUR=30` на IP.
5. **Демо-галерея.** Перенести `data-demo` с ноутбука в `./data` на сервере. Перед копированием сбросить журнал SQLite, чтобы копия была целой:
   ```sh
   sqlite3 data-demo/gamegen.sqlite "PRAGMA wal_checkpoint(TRUNCATE);"
   rsync -a data-demo/ server:~/beeline-hackaton/data/
   ```
   В папке лежат игры, снимки, БД и `.thumb-secret`. Без переноса сервер стартует с пустой галереей.
6. **Запуск.** `docker compose up -d --build`. Сборка образа прогоняет проверку типов и собирает фронт. Caddy стартует, когда пройдёт healthcheck приложения.

## Проверка

```sh
curl -s https://igrotvorec.games/api/health      # {"ok":true,"runtimeVersion":"…"}
docker compose ps                                 # app — healthy
docker compose logs -f app                        # ошибки генерации
```

В браузере: главная, генерация одной игры, `/play/<id>` с телефона по мобильному интернету, а не по Wi-Fi.

## Обновление

```sh
git pull && docker compose up -d --build
```

Игры, собранные прежним рантаймом, сервер пересобирает сам при первом открытии (метка версии рантайма в HTML), отдельный шаг не нужен.

## Резервная копия

Всё состояние лежит в `./data` (или в `DATA_PATH`). Копировать с остановкой приложения или после `wal_checkpoint`, как в шаге 5.

## Что важно знать

- **Лимит генераций.** 30 операций в час на IP. Если жюри будет генерировать из одной сети, на время защиты можно поднять `RATE_LIMIT_PER_HOUR` в `.env` и выполнить `docker compose up -d`.
- **Правка без авторизации.** Править любую игру из галереи может любой посетитель. Новая версия появляется в истории, старые версии и ссылки на них сохраняются.
