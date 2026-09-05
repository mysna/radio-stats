# radio-stats

`radio.bsod.kr` 라디오 플레이어의 방문자·청취자 분석 API다. `radio-epg`(편성표)와는
관심사를 분리한 별도 서비스이며, 같은 방식(Cloudflare Workers + Turso)으로 동작한다.

방문자는 로그인이 없는 정적 사이트의 특성상 클라이언트가 `localStorage`에 저장하는
익명 UUID(`visitor_id`)로만 식별한다. IP 주소는 국가 코드를 뽑아내는 데만 쓰고 저장하지
않는다(Cloudflare가 요청에 붙여주는 `request.cf.country`를 그대로 쓰므로 이 Worker는애초에
IP 자체를 다루지 않는다).

## 구성

- `src/`: Hono 기반 Worker. `routes/events.ts`가 클라이언트가 보내는 방문·청취 이벤트를
  받고, `routes/admin-stats.ts`가 집계를 관리자에게 보여준다.
- `migrations/`: Turso(libSQL) 마이그레이션.
- `docs/api.md`: 엔드포인트 계약.

## 데이터 모델

- `visitors`: 방문자 1명 = 1행. 최근 국가/브라우저/OS, 최초/최근 방문 시각, 누적 방문 횟수.
- `visits`: 방문(탭) 1회 = 1행. "지금 접속 중"은 `ended_at IS NULL AND last_seen_at`이
  최근인 행으로 판단한다.
- `listen_sessions`: 채널 하나를 끊기지 않고 들은 구간 1개 = 1행. "지금 무엇을 듣고
  있는지"는 `ended_at IS NULL AND last_heartbeat_at`이 최근인 행으로 판단한다.
- `visitor_daily_listen`: 방문자 × 날짜(KST) × 채널 단위로 미리 합산해둔 청취 시간.
  "하루에 몇 시간 들었는지"를 원본 이벤트를 스캔하지 않고 바로 조회하기 위한 집계 테이블이다.

## 로컬 개발

Node.js 22, npm, Turso CLI가 필요하다.

```bash
curl -sSfL https://get.tur.so/install.sh | bash
npm ci
```

```bash
cp .dev.vars.example .dev.vars   # 예제 값을 로컬 전용 난수로 바꾼다
turso dev &                      # 로컬 libSQL 서버, 기본 포트 8080
TURSO_DATABASE_URL=http://127.0.0.1:8080 npm run db:migrate
npx wrangler dev
```

품질 검사:

```bash
npm test -- --run
npm run typecheck
```

`npm test`는 파일별로 격리된 `turso dev` 프로세스를 띄워 실제 마이그레이션을 적용한 뒤
Worker 라우트를 통합 테스트한다(로컬에 `turso` CLI 필요).

## Cloudflare/Turso 최초 설정

`radio-epg`와 같은 Cloudflare/Turso 계정을 사용하되, 데이터베이스와 Worker는 이 서비스
전용으로 새로 만든다.

```bash
npx wrangler login
turso auth login
turso db create radio-stats
turso db show radio-stats --url
turso db tokens create radio-stats
```

`db show --url` 결과를 `wrangler.toml`의 `TURSO_DATABASE_URL`에 넣는다. 토큰은 파일에
쓰지 않고 Worker secret으로만 등록한다.

```bash
TURSO_DATABASE_URL=<REMOTE_URL> TURSO_AUTH_TOKEN=<TOKEN> npm run db:migrate
npx wrangler secret put TURSO_AUTH_TOKEN
python -c 'import secrets; print(secrets.token_urlsafe(32))'
npx wrangler secret put ADMIN_TOKEN   # 위에서 생성한 난수를 붙여넣는다
npx wrangler deploy
```

`ADMIN_TOKEN`은 `/v1/admin/stats/*` 조회 API에 필요한 관리자 전용 비밀값이다. 이 값을
아는 사람만 방문자별 상세 통계를 볼 수 있으므로 안전하게 보관한다.

`/v1/events/*` 수집 API에는 별도 비밀값이 없다 — 정적 사이트의 클라이언트 JS에는 진짜
비밀을 담을 수 없으므로, `wrangler.toml`의 `CORS_ORIGINS`(허용 origin 목록)만으로
보호한다. `radio-epg`처럼 운영 origin과 필요한 로컬 origin만 정확히 지정한다.

## 마이그레이션 자동 적용 (GitHub Actions)

`.github/workflows/migrate.yml`이 `migrations/`가 바뀐 채로 `main`에 푸시될 때마다
자동으로 `npm run db:migrate`를 돌려 운영 Turso DB에 반영한다. Worker 배포 자체는
Cloudflare의 Git 연동(Workers Builds)이 그대로 담당하고, 이 workflow는 그 배포가
새 컬럼/테이블을 참조하는 코드를 마이그레이션 없이 만나 실패하는 일(예: 컬럼이나
테이블이 없어서 나는 오류)을 막기 위한 것이다.

동작하려면 GitHub 저장소 Settings → Secrets and variables → Actions에 아래 두 개를
등록해야 한다(둘 다 로컬 `.dev.vars`/`wrangler.toml`이 아니라 GitHub 쪽에 별도로
등록하는 값이다).

- **Variables** 탭 → `TURSO_DATABASE_URL` = `turso db show radio-stats --url` 결과
  (비밀값 아님)
- **Secrets** 탭 → `TURSO_AUTH_TOKEN` = `turso db tokens create radio-stats` 결과

두 값 모두 Cloudflare Worker secret으로 등록할 때 쓴 것과 같은 값을 그대로 쓰면 된다.
등록 후에는 이 저장소에 마이그레이션 파일을 추가해 `main`에 푸시하기만 하면 별도로
손대지 않아도 운영 DB에 반영된다.

## radio(플레이어) 연동

`radio` 저장소의 클라이언트가 이 API의 `/v1/events/*`를 호출해 방문/청취 이벤트를
보낸다. 자세한 계약은 [`docs/api.md`](docs/api.md)를 참고한다.
