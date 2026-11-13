# DYNOSTY 개발 기준

- 런타임은 `.nvmrc`, 패키지 매니저는 `package.json`의 `packageManager`를 따른다.
- `apps/web`은 화면·입력·Worker 연결, `apps/api`는 HTTP·DB 접근을 담당한다.
- `packages/game-core`는 React·Babylon.js·DB·브라우저 전역 객체에 의존하지 않는 계산 코드다.
- 공용 게임 상태와 저장 형식은 코어에서 관리하고, HTTP 요청·응답 규격은 API가 관리한다.
- 패키지는 정확한 버전으로 추가하며 `pnpm-lock.yaml`을 함께 갱신한다.
- 기본 검증은 `pnpm check`, 실제 브라우저·API·DB 연결 검증은 로컬 DB를 켠 뒤 `pnpm test:e2e`다.
- DB 설정은 `pnpm run setup`으로 각자의 `.env.local`에 생성한다. 실제 값과 백업 데이터는 커밋하지 않는다.
- `infra/compose.dev.yml`은 로컬 개발용이다. 운영 배포 설정과 혼용하지 않는다.
- 게임 설계 전에는 연결 확인용 예제를 실제 주민·경제·랭킹 규칙으로 확대하지 않는다.
