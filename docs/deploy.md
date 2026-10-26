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

## Сервер server.example (общий Caddy)

На сервере порты 80/443 уже держит общий Caddy (`~/caddy`, host-сеть), поэтому там поднимается только приложение: `docker-compose.vps.yml`, host-сеть, слушает `127.0.0.1:18787`. Прокси LLM ставится на этот же сервер, `LLM_BASE_URL=http://127.0.0.1:8317/v1`.

- Код и сборка: `deploy/deploy.sh` (rsync без данных и `.env`, затем `docker compose -f docker-compose.vps.yml up -d --build`). С `--data` ещё и заменяет данные на сервере демо-галереей из `data-demo`.
- `.env` на сервере: `~/igrotvorec/.env`. После установки прокси вписать `LLM_API_KEY` и выполнить `docker compose -f docker-compose.vps.yml up -d` в `~/igrotvorec`.
- Сайт: `deploy/igrotvorec.caddy` лежит в `~/caddy/etc/`. Подключить строкой `import /etc/caddy/igrotvorec.caddy` в `~/caddy/etc/Caddyfile` и перезагрузить: `docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile`.
- DNS в Cloudflare: `A igrotvorec.games → <IP сервера>` и `CNAME www → igrotvorec.games`, без прокси (серое облако). Тогда Caddy сам получает сертификат и передаёт приложению настоящий адрес клиента. При включённом прокси Cloudflare нужен режим SSL «Full» и строка с `CF-Connecting-IP` из комментария в `deploy/igrotvorec.caddy`.

## Резервная копия

Всё состояние лежит в `./data` (или в `DATA_PATH`). Копировать с остановкой приложения или после `wal_checkpoint`, как в шаге 5.

## Что важно знать

- **Лимит генераций.** 30 операций в час на IP. Если жюри будет генерировать из одной сети, на время защиты можно поднять `RATE_LIMIT_PER_HOUR` в `.env` и выполнить `docker compose up -d`.
- **Правка без авторизации.** Править любую игру из галереи может любой посетитель. Новая версия появляется в истории, старые версии и ссылки на них сохраняются.
