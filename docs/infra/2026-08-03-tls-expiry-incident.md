# [장애] ilgayo.co.kr TLS 인증서 만료 — 조치 요청

> **작성일** 2026-08-03
> **대상** 인프라 담당
> **상태** 🔴 **진행 중 장애 — 서비스 전면 불가**
> **진단** 서버 SSH 접속으로 직접 확인 (아래 근거는 전부 실측이며 추측이 아니다)
> **필요 권한** 서버 `sudo` + **가비아 DNS 관리 콘솔**

---

## 0. 세 줄 요약

1. `ilgayo.co.kr` 인증서가 **2026-08-03 06:39 (KST) 에 만료**됐고, 앱은 서버에 붙지 못한다.
2. **자동 갱신이 실패한 게 아니다.** 이 인증서는 `authenticator = manual` 로 발급돼서
   **처음부터 자동 갱신이 불가능**했다. 타이머는 90일 내내 정상 동작하며 매번 건너뛰었다.
3. 그래서 **`certbot renew` 로는 안 고쳐진다.** 수동 재발급(DNS TXT) + **컨테이너 reload** 가 필요하고,
   재발 방지를 같이 하지 않으면 **11월에 똑같이 만료된다.**

---

## 1. 현재 상태

```
Subject:   CN = ilgayo.co.kr
Issuer:    CN = E8, O = Let's Encrypt, C = US
NotBefore: 2026-05-05 06:39:16 KST
NotAfter:  2026-08-03 06:39:15 KST   ← 만료됨
```

| 확인 | 결과 |
|---|---|
| `curl https://ilgayo.co.kr/` | **실패** — `SEC_E_CERT_EXPIRED` / `certificate has expired` |
| `curl -k https://ilgayo.co.kr/` (검증 우회) | **200 OK** |

**서버와 애플리케이션은 정상 가동 중이다. TLS 신뢰만 끊겼다.**

### 영향

- **모바일 앱은 우회 수단이 없다.** React Native / Expo 의 fetch 는 OS 트러스트 스토어를 사용하고,
  프로덕션 빌드에 인증서 검증 예외를 넣는 선택지는 없다(넣어서도 안 된다).
  **로그인부터 모든 API 호출이 실패한다.**
- 정책 페이지(`/terms`·`/privacy`)를 여는 사람은 브라우저 경고를 만난다.
  **Google Play 심사가 이 링크를 확인하므로 출시 일정과 직접 부딪친다.**
- 프론트엔드 개발·검증 환경도 같은 이유로 막혀 있다.

---

## 2. 원인 — "갱신 실패" 가 아니다

`/etc/letsencrypt/renewal/ilgayo.co.kr.conf`:

```ini
[renewalparams]
account          = 22da0d74bcce46e9a529907d91401d74
pref_challs      = dns-01,
authenticator    = manual          # ← 원인
server           = https://acme-v02.api.letsencrypt.org/directory
key_type         = ecdsa
```

**certbot 은 `--manual` 로 발급된 인증서를 `--manual-auth-hook` 없이 비대화식으로 갱신하지 않는다.**
사람 입력(DNS TXT 레코드 추가)이 필요하므로 자동 실행 시 **의도적으로 건너뛴다.**

### 근거

| 확인 항목 | 실측 결과 | 해석 |
|---|---|---|
| `systemctl is-enabled/is-active certbot.timer` | `enabled` / `active`, **9시간 전 실행됨** | **타이머는 정상이었다.** 여기가 문제가 아니다 |
| `/etc/letsencrypt/live/ilgayo.co.kr/fullchain.pem` | → `../../archive/ilgayo.co.kr/fullchain**1**.pem` | **2세대가 존재하지 않는다** |
| `/etc/letsencrypt/archive/ilgayo.co.kr/` | `cert1.pem`, `chain1.pem`, `fullchain1.pem`, `privkey1.pem` **뿐** | 5/4 최초 발급 이후 **갱신 성공 0회** |
| `live/` 디렉터리 mtime | `May 4 22:37` | 그날 이후 손댄 적 없음 |
| `df -h /` | 10% 사용 | 디스크는 무관 |
| certbot | 2.9.0 (`/usr/bin/certbot`, apt) | — |

> **즉 타이머는 90일 동안 정상적으로 돌면서 매번 조용히 건너뛰었다.**
> 만료는 우발적 사고가 아니라 **처음부터 예정돼 있던 결과**다.

### 왜 manual / DNS-01 로 발급했나 (제약 확인)

**80 포트가 외부에 열려 있지 않다.**

| 확인 | 결과 |
|---|---|
| 외부에서 `59.21.223.137:80` TCP 연결 | **connection refused** |
| `mfz-nginx` 포트 매핑 (docker-compose.yml) | `"28080:80"` · `"443:443"` — **호스트 80 은 매핑 자체가 없다** |
| nginx conf 의 `.well-known/acme-challenge` location | **없음** (`location /` 로 전부 백엔드 프록시) |

Let's Encrypt HTTP-01 챌린지는 **80 포트**를 요구하므로 처음부터 사용할 수 없었고,
그래서 DNS-01 수동 발급을 택한 것으로 보인다. **이 판단 자체는 합리적이었다** —
빠진 것은 그 뒤의 자동화다.

---

## 3. ⚠️ 인증서만 갱신하면 안 된다 — 컨테이너 reload 필수

TLS 종단은 **호스트 nginx 가 아니다.** 호스트의 `nginx`·`apache2` 는 둘 다 `inactive` 이고,
443 을 잡고 있는 것은 **Docker 컨테이너 `mfz-nginx`** 다.

```yaml
# /home/mfjs/deploy/api-server/docker-compose.yml
  nginx:
    image: nginx:latest
    container_name: mfz-nginx
    restart: unless-stopped
    ports:
      - "28080:80"
      - "443:443"
    volumes:
      - ./nginx/mfz-backend.conf:/etc/nginx/conf.d/default.conf:ro
      - /etc/letsencrypt:/etc/letsencrypt:ro        # ← read-only 마운트
```

nginx 는 **기동 시점에** 인증서를 메모리로 읽는다. 이 컨테이너는 4일째 가동 중이므로,
호스트에서 인증서를 갱신해도 **reload 하지 않으면 만료본을 계속 서빙한다.**

> **`sudo systemctl reload nginx` 는 이 서버에서 아무 효과가 없다** (호스트 nginx 가 안 돈다).
> 반드시 `docker exec mfz-nginx nginx -s reload` 여야 한다.

---

## 4. 조치 ① — 즉시 복구 (대화식)

**소요 시간: DNS 전파 대기 포함 10~30분.** `sudo` + 가비아 DNS 콘솔이 동시에 필요하다.

```bash
# 1) 재발급 — 실행하면 TXT 레코드 값을 화면에 알려주고 대기한다
sudo certbot certonly --manual --preferred-challenges dns \
  -d ilgayo.co.kr -d www.ilgayo.co.kr

# 2) 안내된 값을 가비아 DNS 관리에 TXT 레코드로 추가
#      호스트: _acme-challenge          (ilgayo.co.kr 용)
#      호스트: _acme-challenge.www      (www 용)
#    → 두 도메인을 함께 발급하므로 TXT 를 두 번 물어본다. 둘 다 추가한 뒤 Enter.

# 3) 전파 확인 — 값이 보이면 certbot 쪽에서 Enter
dig +short TXT _acme-challenge.ilgayo.co.kr @8.8.8.8

# 4) ★ 컨테이너 reload — 이 줄을 빼면 만료본을 계속 서빙한다
docker exec mfz-nginx nginx -s reload
```

### 복구 확인

```bash
# NotAfter 가 11월로 바뀌어야 한다
openssl s_client -connect ilgayo.co.kr:443 -servername ilgayo.co.kr </dev/null 2>/dev/null \
  | openssl x509 -noout -dates

# -k 없이 200 이 나와야 한다
curl -sS -o /dev/null -w '%{http_code}\n' https://ilgayo.co.kr/api-docs.json
```

---

## 5. 조치 ② — 재발 방지 (**이게 본론이다**)

조치 ① 만 하면 **11월 초에 똑같이 만료된다.** 같은 사고를 세 달마다 반복하지 않으려면
발급 방식을 자동화 가능한 것으로 바꿔야 한다.

**현재 DNS: 가비아** (`ns.gabia.co.kr`, `ns1.gabia.co.kr`, `ns.gabia.net`)
**설치된 certbot DNS 플러그인: 없음**

| 안 | 방법 | 평가 |
|---|---|---|
| **A** ⭐ | 네임서버만 **Cloudflare** 로 이전(**등록기관은 가비아 그대로**) 후 `certbot-dns-cloudflare` | **권장.** 공식 플러그인, 무료, 완전 자동. **80 포트 제약과 무관**하다 |
| B | 가비아 DNS API 를 호출하는 `--manual-auth-hook` 스크립트 자작 | certbot 공식 플러그인이 없어 직접 구현해야 하고, API 스펙 변경에 취약 |
| C | 80 포트 개방 후 webroot HTTP-01 로 전환 | 공유기 포트포워딩·ISP 정책에 막힐 수 있다. nginx 에 `.well-known` location 추가와 compose 포트 매핑 변경도 필요 |

### A 안 적용 예시

```bash
sudo apt install python3-certbot-dns-cloudflare

sudo install -m 600 /dev/null /root/.secrets/cloudflare.ini
# dns_cloudflare_api_token = <Zone:DNS:Edit 권한 토큰>

sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /root/.secrets/cloudflare.ini \
  -d ilgayo.co.kr -d www.ilgayo.co.kr \
  --deploy-hook "docker exec mfz-nginx nginx -s reload"
```

> **`--deploy-hook` 은 어느 안을 택하든 반드시 건다.** 이걸 빼면 인증서는 자동 갱신되는데
> 컨테이너가 옛 인증서를 계속 물고 있어, **자동화를 해놓고도 똑같이 만료 장애가 난다.**
> 기존 인증서에 뒤늦게 붙이려면 `renewal/ilgayo.co.kr.conf` 의 `[renewalparams]` 에
> `renew_hook = docker exec mfz-nginx nginx -s reload` 를 추가해도 된다.

### 자동 갱신이 실제로 되는지 확인

```bash
sudo certbot renew --dry-run     # 성공해야 자동화가 된 것이다
```

---

## 6. 조치 ③ — 만료 임박 알림

**이번 장애의 진짜 교훈은 90일 동안 아무도 몰랐다는 것이다.** 조치 ② 를 하더라도
갱신이 조용히 멈출 수 있으므로, 결과를 감시하는 장치가 따로 있어야 한다.

```bash
# crontab -e  — 14일 내 만료면 출력(메일/알림 연동)
0 9 * * * openssl s_client -connect ilgayo.co.kr:443 -servername ilgayo.co.kr </dev/null 2>/dev/null \
  | openssl x509 -noout -checkend 1209600 \
  || echo "[경고] ilgayo.co.kr 인증서 14일 내 만료"
```

> 서버에 **Prometheus + Grafana 가 이미 떠 있다**(`prometheus`, `grafana`, `node-exporter` 컨테이너,
> 4개월째 가동). `blackbox_exporter` 를 붙이면 `probe_ssl_earliest_cert_expiry` 메트릭으로
> 인증서 만료를 그래프·알림으로 관리할 수 있다 — cron 보다 이쪽이 기존 구성에 맞는다.

---

## 7. 함께 발견한 것 (급하지 않음)

**`mfz-studio` 컨테이너가 크래시 루프 중이다.**

- `docker ps` 상태: `Restarting (1) Less than a second ago` — **초 단위로 재시작 반복**
- `docker logs mfz-studio`: `prisma studio` **사용법 도움말**만 출력.
  인자 없이 기동돼 즉시 종료되는 상태로 보인다.
- 이번 장애와 무관하고 서비스 영향도 없으나, **4일 이상 초당 재시작 중**이라 로그와 CPU 를
  계속 소모한다. 상시 필요한 컨테이너가 아니면 내리는 편이 낫다
  (`docker compose stop mfz-studio` 또는 compose 에서 제거).

---

## 8. 체크리스트

- [ ] **①** `certbot certonly --manual --preferred-challenges dns` 재발급
- [ ] **①** 가비아 DNS 에 `_acme-challenge` TXT 2건 추가 → 전파 확인
- [ ] **①** `docker exec mfz-nginx nginx -s reload`
- [ ] **①** `curl` 이 `-k` 없이 200 인지 확인 → **여기까지가 장애 복구**
- [ ] **②** 자동 갱신 방식 결정 (A/B/C — A 권장)
- [ ] **②** `--deploy-hook` 또는 `renew_hook` 등록
- [ ] **②** `certbot renew --dry-run` 성공 확인
- [ ] **③** 만료 임박 알림 등록 (cron 또는 blackbox_exporter)
- [ ] (선택) `mfz-studio` 크래시 루프 정리

---

## 부록 — 서버 환경

| | |
|---|---|
| OS | Ubuntu 24.04.3 LTS (`mwaung-server`) |
| 접속 | `59.21.223.137:20022`, user `mfjs` (키 인증) |
| certbot | 2.9.0, `/usr/bin/certbot` (apt) |
| 배포 | `/home/mfjs/deploy/api-server/docker-compose.yml` |
| nginx conf | `/home/mfjs/deploy/api-server/nginx/mfz-backend.conf` (컨테이너에 ro 마운트) |
| 컨테이너 | `mfz-nginx`(443/28080) · `mfz-backend`(8080) · `mfz-postgres`(5432) · `grafana`(3000) · `prometheus`(9090) · `node-exporter`(9100) · `mfz-studio`(크래시 루프) |
| DNS | 가비아 — `ns.gabia.co.kr` / `ns1.gabia.co.kr` / `ns.gabia.net` |
| 80 포트 | **외부 미개방** (connection refused, compose 에 호스트 매핑 없음) |

**연락**: 프론트엔드 (이 문서 작성자) — 복구되면 알려주시면 앱 쪽 검증을 바로 이어서 진행한다.
