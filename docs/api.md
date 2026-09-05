# API 계약

CORS는 `CORS_ORIGINS`에 등록된 origin만 허용한다. 모든 오류는
`{ "error": { "code": "...", "message": "..." } }` 형태로 반환한다.

## 수집 API — `/v1/events/*` (인증 없음, CORS로만 보호)

정적 사이트의 클라이언트 JS가 직접 호출한다. `visitor_id`는 클라이언트가
`localStorage`에 보관하는 UUID로, 재방문 시 같은 값을 계속 보낸다.

### `POST /v1/events/visit`

방문(탭) 시작 시 1회 호출한다.

```json
{ "visitor_id": "<uuid>", "referrer": "https://example.com/" }
```

- `referrer`는 선택.
- 응답 `201`: `{ "visitor_id": "<uuid>", "visit_id": "<uuid>" }`. 이후 요청에 `visit_id`를 그대로 사용한다.
- 국가는 Cloudflare가 붙여주는 요청 정보에서, 브라우저/OS는 `User-Agent` 헤더에서 서버가 직접 뽑는다.

### `POST /v1/events/visit/heartbeat`

탭이 열려 있는 동안 주기적으로(예: 30초마다) 호출해 "지금 접속 중"을 유지한다.

```json
{ "visit_id": "<uuid>" }
```

### `POST /v1/events/visit/end`

탭을 닫거나 페이지를 떠날 때 `navigator.sendBeacon`으로 호출한다.

```json
{ "visit_id": "<uuid>" }
```

### `POST /v1/events/listen/start`

채널 재생을 시작할 때(최초 재생, 채널 전환) 호출한다.

```json
{ "visitor_id": "<uuid>", "visit_id": "<uuid>", "channel_id": "kbs.1radio.seoul" }
```

- 응답 `201`: `{ "session_id": "<uuid>" }`.

### `POST /v1/events/listen/heartbeat`

재생 중인 동안 주기적으로(예: 20~30초마다) 호출한다. `listen/start`보다 짧거나 같은
주기를 권장한다 — 하트비트 간격이 벌어질수록 실제 청취 시간과의 오차가 커진다.

```json
{ "session_id": "<uuid>" }
```

### `POST /v1/events/listen/end`

일시정지, 채널 전환, 탭 종료 시 호출한다(`sendBeacon` 권장).

```json
{ "session_id": "<uuid>" }
```

- 이미 종료된 세션에 다시 호출해도 안전하다(중복 집계하지 않고 `{"status":"already_ended"}` 반환).

## 관리자 API — `/v1/admin/stats/*` (Bearer `ADMIN_TOKEN` 필요)

### `GET /v1/admin/stats/summary`

전체 통계 한 화면 분량.

```json
{
  "visitors_total": 1234,
  "visitors_today": 87,
  "currently_online": 12,
  "currently_listening": 9,
  "listen_seconds_today_total": 456000,
  "listen_seconds_alltime_total": 98765432,
  "live_threshold_seconds": 90
}
```

### `GET /v1/admin/stats/live`

지금 접속해 듣고 있는 목록.

```json
{
  "live_threshold_seconds": 90,
  "by_channel": [{ "channel_id": "kbs.1radio.seoul", "listeners": 5 }],
  "sessions": [
    {
      "session_id": "...",
      "visitor_id": "...",
      "channel_id": "kbs.1radio.seoul",
      "started_at": "...",
      "duration_seconds": 320,
      "country": "KR",
      "browser": "Chrome",
      "os": "Mac OS",
      "device_type": "desktop"
    }
  ]
}
```

### `GET /v1/admin/stats/visitors?limit=50&offset=0`

방문자별 요약 목록(최근 방문순).

### `GET /v1/admin/stats/visitors/:id`

방문자 상세: 기본 정보, 최근 방문/청취 세션, 날짜별 청취 시간, 채널별 청취 시간.
