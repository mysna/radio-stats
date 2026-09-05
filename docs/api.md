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
{
  "visitor_id": "<uuid>",
  "visit_id": "<uuid>",
  "channel_id": "kbs.1radio.seoul",
  "channel_name": "KBS 1라디오",
  "broadcaster": "kbs",
  "region_id": "seoul",
  "program_id": "kbs.news.0900",
  "program_title": "KBS 뉴스"
}
```

- `channel_name`/`broadcaster`/`region_id`/`program_id`/`program_title`은 모두 선택
  필드. `channel_id`는 "seoul-011-sbs-lovefm-main"처럼 내부 식별자라서, 화면에 보여줄
  이름("SBS 러브FM")은 `channel_name`으로 따로 받는다. 방송국별/채널별/지역별/프로그램별
  통계에 쓰인다.
- 응답 `201`: `{ "session_id": "<uuid>" }`.

### `POST /v1/events/listen/heartbeat`

재생 중인 동안 주기적으로(예: 20~30초마다) 호출한다. `listen/start`보다 짧거나 같은
주기를 권장한다 — 하트비트 간격이 벌어질수록 실제 청취 시간과의 오차가 커진다.

```json
{ "session_id": "<uuid>", "program_id": "kbs.news.0900", "program_title": "KBS 뉴스" }
```

- `program_id`/`program_title`은 선택이며, 재생 도중 프로그램이 바뀌면 매 하트비트마다
  그 시점의 값을 실어 보낸다 — 그 하트비트가 담당하는 경과 시간이 이 프로그램에 집계된다.

### `POST /v1/events/listen/end`

일시정지, 채널 전환, 탭 종료 시 호출한다(`sendBeacon` 권장).

```json
{ "session_id": "<uuid>", "program_id": "kbs.news.0900", "program_title": "KBS 뉴스" }
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
  "listeners_today": 87,
  "listeners_last_7_days": 320,
  "listeners_last_30_days": 810,
  "listeners_last_365_days": 4200,
  "listeners_all_time": 5100,
  "live_threshold_seconds": 90
}
```

`listeners_*`는 방문이 아니라 실제로 한 번이라도 재생한 고유 방문자 수(trailing window,
오늘/7일/30일/365일/전체)다. `visitors_total`(그냥 방문)과는 다른 지표다.

### `GET /v1/admin/stats/live`

지금 접속해 듣고 있는 목록.

```json
{
  "live_threshold_seconds": 90,
  "by_channel": [{ "channel_id": "kbs.1radio.seoul", "channel_name": "KBS 1라디오", "listeners": 5 }],
  "sessions": [
    {
      "session_id": "...",
      "visitor_id": "...",
      "channel_id": "kbs.1radio.seoul",
      "channel_name": "KBS 1라디오",
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

### `GET /v1/admin/stats/by-broadcaster`

방송국(`broadcaster`, 예: kbs/mbc/sbs)별 누적 청취 시간, 내림차순.

```json
{ "broadcasters": [{ "broadcaster": "kbs", "seconds": 12345 }, ...] }
```

### `GET /v1/admin/stats/by-channel?limit=50`

채널(`channel_id`)별 누적 청취 시간(전체 기간), 내림차순. `channel_name`을 함께 반환한다.

### `GET /v1/admin/stats/by-region`

`region_id`를 수도권/지역 두 그룹으로만 묶은 누적 청취 시간.

```json
{ "regions": [{ "region_group": "수도권", "seconds": 12345 }, { "region_group": "지역", "seconds": 6789 }] }
```

### `GET /v1/admin/stats/by-program?limit=50`

채널×프로그램별 누적 청취 시간, 내림차순. `program_id`가 없는 구간은
`program_key: "unknown"`으로 묶인다.

```json
{ "programs": [{ "channel_id": "kbs.1radio.seoul", "channel_name": "KBS 1라디오", "program_key": "kbs.news.0900", "program_title": "KBS 뉴스", "seconds": 3600 }] }
```

### `GET /v1/admin/stats/daily?days=30`

사이트 전체(모든 방문자 합산) 일별 청취 시간 추이. 오래된 날짜부터 최신순.

```json
{ "days": [{ "listen_date": "2026-07-01", "seconds": 12345, "listeners": 42 }, ...] }
```

### `GET /v1/admin/stats/demographics`

방문자 속성 분포(국가/브라우저/OS/기기는 `visitors` 기준 고유 인원, 유입 경로는
`visits` 기준 방문 횟수). 각 목록은 개수 내림차순 상위 15개.

```json
{
  "countries": [{ "label": "KR", "count": 1200 }, { "label": "US", "count": 34 }],
  "browsers": [{ "label": "Chrome", "count": 900 }],
  "os": [{ "label": "Mac OS", "count": 500 }],
  "devices": [{ "label": "desktop", "count": 700 }, { "label": "mobile", "count": 500 }],
  "referrers": [{ "label": "직접 방문", "count": 800 }, { "label": "https://google.com/", "count": 120 }]
}
```

값이 없으면 `country`/`browser`/`os`/`device_type`은 "알 수 없음", `referrer`는
"직접 방문"으로 묶인다.

### `GET /v1/admin/stats/visitors?limit=50&offset=0`

방문자별 요약 목록(최근 방문순).

### `GET /v1/admin/stats/visitors/:id`

방문자 상세: 기본 정보, 최근 방문/청취 세션, 날짜별 청취 시간, 채널별 청취 시간.

## 대시보드 — `GET /admin`

브라우저로 열면 되는 통계 대시보드 페이지. Worker가 직접 서빙하며 별도 배포가 필요
없다. 최초 접속 시 `ADMIN_TOKEN`을 입력하면 브라우저 `localStorage`에 저장해두고
같은 origin으로 위 관리자 API들을 호출한다.

자주 확인할 것과 어쩌다 볼 것을 나눠 탭으로 구성한다(URL 해시로 상태 유지, 새로고침해도
같은 탭에 남는다):

- **홈**: 지금/오늘 지표(현재 접속·청취, 오늘 방문자·청취자·청취시간), 누적 지표,
  지금 듣는 채널 상위 5개, 최근 30일 청취시간·청취자 수 추이
- **실시간**: 채널별 실시간 청취자 전체, 실시간 접속 세션 테이블
- **채널 분석**: 방송국별/채널별/지역별/프로그램별 누적 청취 시간
- **방문자**: 방문자 목록(탭하면 날짜별·채널별 상세)
- **방문자 속성**: 국가별/브라우저별/OS별/기기별 분포, 유입 경로

탭을 전환하면 그 탭에 필요한 API만 새로 불러온다(홈을 보는 동안엔 채널 분석 API를
호출하지 않는다). 15초마다 지금 보고 있는 탭만 자동 새로고침된다.

차트는 [Chart.js](https://www.chartjs.org/)를 cdnjs에서 `<script>` 태그로 불러와
그린다(빌드 과정 없음). 오프라인이거나 cdnjs가 막힌 네트워크에서는 차트 대신
"Chart is not defined" 콘솔 에러와 함께 그 부분만 비어 보인다 — 통계 타일과 표는
이 스크립트에 의존하지 않으므로 정상 동작한다.
