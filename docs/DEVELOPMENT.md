# 개발 시작하기

## 커밋 메시지

커밋 제목과 본문은 영어로 작성합니다. 문서와 팀 대화는 기존처럼 한국어를 사용할 수 있습니다.
변경한 내용과 목적을 짧고 구체적으로 적습니다.

```text
feat: add procurement order validation
fix: preserve inventory when loading a game
docs: clarify local development setup
chore: configure the monorepo development environment
```

## 준비

- Node.js: `.nvmrc`에 적힌 버전. nvm 사용자는 `nvm install` 후 `nvm use`를 실행합니다.
- pnpm: `npm install --global pnpm@12.18.0`
- Docker Desktop 또는 Docker Engine + Compose v2: 로컬 DB 실행에 사용합니다.

## 처음 한 번

```sh
git clone https://github.com/DYNOSTY/dynosty.git
cd dynosty
pnpm install --frozen-lockfile
pnpm run setup
pnpm db:up
pnpm db:check
```

`setup`은 DB 접속 정보를 `.env.local`에 생성합니다. 비밀번호는 무작위이며, 기존 파일은 덮어쓰지 않습니다.
이 파일은 각 개발자의 PC에만 두고 공유하거나 커밋하지 않습니다.

## 평소 개발

```sh
pnpm dev
```

브라우저에서 <http://127.0.0.1:5173>을 열면 3D 예제와 API 연결 상태가 보입니다.
**하루 진행**을 누르면 Web Worker 안의 Core가 날짜를 증가시킵니다.
터미널에서 Ctrl+C를 누르면 이번에 실행한 개발 프로세스가 함께 종료됩니다.

API는 <http://127.0.0.1:3101>에서 실행됩니다. DB 없이도 화면과 게임 계산, API 기본 응답을 개발할 수 있습니다.
DB를 끄면 DB 준비 상태 확인은 실패하는 것이 정상입니다. 로그인·온라인 저장 기능은 아직 없습니다.

| 명령                                 | 하는 일                              |
| ------------------------------------ | ------------------------------------ |
| `pnpm dev`                           | Core 감시 빌드 + API + Web 동시 실행 |
| `pnpm check`                         | 코드 스타일·타입·테스트·빌드 검사    |
| `pnpm format`                        | 코드 스타일 자동 정리                |
| `pnpm db:up`                         | 로컬 DB 실행 및 준비 대기            |
| `pnpm db:check`                      | 실제 DB에 간단한 쿼리 실행           |
| `pnpm db:down`                       | 로컬 DB 종료, 데이터 볼륨 유지       |
| `pnpm build`                         | Core·API·Web 배포용 산출물 생성      |
| `pnpm --filter @dynosty/api start`   | 빌드한 API 실행                      |
| `pnpm --filter @dynosty/web preview` | 빌드한 웹을 로컬에서 확인            |

`preview`는 운영용 웹 서버가 아닙니다. 실제 배포 방법은 별도로 구성합니다.
VS Code에서는 선택적으로 Biome 확장을 설치하면 저장소의 포맷·검사 설정을 사용할 수 있습니다.

## 브라우저까지 검사

`pnpm dev`를 종료하고 DB를 켠 상태에서 실행합니다. 검사가 자체 Web·API 서버를 띄우고 종료합니다.

```sh
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux에서 브라우저 시스템 의존성이 부족하면 관리자 권한을 확인한 뒤
`pnpm exec playwright install --with-deps chromium`을 사용합니다. CI는 이 경로를 사용합니다.
헤드리스 검사는 소프트웨어 그래픽으로 연결을 확인하며 실제 기기의 FPS 평가가 아닙니다.

## 환경 설정

| 변수                                                | 용도                       |
| --------------------------------------------------- | -------------------------- |
| `POSTGRES_USER`, `POSTGRES_DB`, `POSTGRES_PASSWORD` | 로컬 DB 계정·이름·비밀번호 |
| `POSTGRES_PORT`                                     | 개발 PC의 DB 포트          |
| `DATABASE_URL`                                      | API의 DB 접속 정보         |
| `API_HOST`, `API_PORT`                              | API가 수신할 주소와 포트   |

DB 포트를 바꾸면 `DATABASE_URL`의 포트도 함께 맞춥니다.
로컬 DB 설정 파일은 API 실행 시 읽으며, 브라우저 코드에 포함하지 않습니다.
브라우저에 공개되는 `VITE_` 변수에 비밀번호나 토큰을 넣지 않습니다.
포트가 이미 사용 중이면 기존 서비스를 종료하지 말고 개발 설정을 조정합니다.

## 기본 API

| 경로                | 확인 내용                                          |
| ------------------- | -------------------------------------------------- |
| `/api/health`       | API 프로세스 응답                                  |
| `/api/game/initial` | 공용 Core의 초기 게임 상태                         |
| `/api/ready`        | 실제 PostgreSQL 연결. 미설정·연결 실패 시 HTTP 503 |

PR과 main 변경 시 GitHub Actions가 같은 검사와 브라우저·DB 연결 검사를 수행합니다. 운영 배포는 수행하지 않습니다.
