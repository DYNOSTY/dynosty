# 버전 선택 근거

확인일: 2026-11-13. 안정성을 보장한다는 뜻이 아니라, **정식 릴리스·지원 상태·상호 호환성과 실제 실행**을 기준으로 선택했습니다.
시험판·RC·canary는 사용하지 않습니다. Node.js는 최신 Active LTS를 사용합니다.

| 도구                      | 고정 버전      | 확인 근거                                             |
| ------------------------- | -------------- | ----------------------------------------------------- |
| Node.js                   | 26.13.1        | 공식 배포 목록의 최신 LTS, 공식 SHA256 검증           |
| pnpm                      | 12.18.0        | npm 공식 레지스트리의 latest                          |
| TypeScript                | 7.0.2          | npm latest                                            |
| React / React DOM         | 19.3.1         | npm latest, 두 패키지 버전 일치                       |
| Babylon.js Core / Loaders | 9.36.0         | npm latest, 두 패키지 버전 일치                       |
| Vite / React 플러그인     | 8.3.8 / 6.3.0  | npm latest 및 peer 의존성 일치                        |
| Fastify                   | 5.12.8         | npm latest                                            |
| PostgreSQL                | 18.7 Alpine    | 공식 지원 중 최신 정식 메이저의 최신 패치. 19 RC 제외 |
| pg                        | 8.23.1         | npm latest                                            |
| Vitest / Playwright       | 5.1.0 / 1.65.0 | npm latest                                            |
| Biome                     | 2.6.7          | npm latest                                            |

패키지의 직접 버전과 `pnpm-lock.yaml`을 고정했습니다. 설치는 `--frozen-lockfile`로 동일한 의존성을 재현합니다.
PostgreSQL 이미지는 버전과 digest를 함께 고정했습니다. CI 액션도 확인한 정식 릴리스의 커밋 SHA로 고정했습니다.

pnpm에서 의존성 빌드 스크립트는 필요한 `esbuild`만 허용했습니다.
설치 시 릴리스 대기 정책에 걸린 Babylon.js 두 패키지만 확인한 정확한 버전에 한해 예외로 기록했습니다.
다른 새 패키지가 자동 예외로 추가되지 않도록 `minimumReleaseAgeStrict`를 켰습니다.
업데이트할 때는 버전·lockfile·정책을 함께 검토하고 `pnpm check`와 브라우저 검사를 다시 수행합니다.

공식 근거:

- [Node.js 지원 정책](https://nodejs.org/en/about/previous-releases), [공식 배포 목록](https://nodejs.org/dist/index.json)
- [Vite 시작 및 런타임 요구사항](https://vite.dev/guide/)
- [Fastify 지원 정책](https://fastify.dev/docs/latest/Reference/LTS/)
- [PostgreSQL 버전 정책](https://www.postgresql.org/support/versioning/)
- [npm 패키지 메타데이터 API](https://github.com/npm/registry/blob/main/docs/REGISTRY-API.md)
- [pnpm 의존성 빌드 정책](https://pnpm.io/settings)
