# 브라우저 회귀검사 실패 추적

2026년 11월 25일 최초 검사에서 191건 중 43건이 통과하고 148건이 실패했다. 각 실패를 원래 파일·줄·시험명으로 대조해 Chrome에서 재실행했다. 결과는 최초 148건에 해당하는 시험만 집계했다. 같은 줄에서 선언한 다른 매개변수 시험은 제외했다.

복홀에서 조달 일손 화면으로 전환할 때 마을 배경이 남던 문제를 재현했다. 두 화면이 쓰는 공통 활성 플래그 때문에 배경 비활성화가 생략됐다. 장면 전환 시 배경을 직접 끄고 복귀 시 복원한 뒤, 실제 Chrome에서 같은 캔버스의 왕복 전환이 통과했다.

| 검사 | 사례 | 통과 | 실패 |
|---|---:|---:|---:|
| 최초 전체 실행 | 191 | 43 | 148 |
| 기존 실패 재실행 | 148 | 45 | 103 |

재실행은 게임 변경 커밋 a57bdb2의 소스와 개발 모드 웹 빌드를 사용했다. 브라우저 페이지의 정적 파일과 API 응답을 로컬에서 제공했다. 일반 개발 서버, PostgreSQL 및 별도 네트워크 컨텍스트는 이 방식으로 검증할 수 없다. 실행 도중 준비한 E2E 수정은 아래 재실행과 구분한다.

| 최초 실패 지점 | 사례 | 재실행 통과 | 판단 근거 |
|---|---:|---:|---|
| 개발 도구 진입 | 61 | 23 | 배포 빌드는 개발 도구 버튼을 만들지 않는다. 개발 빌드에서 같은 테스트가 다음 단계까지 가는지 비교한다. |
| 3D 장면 진단 API | 11 | 7 | 배포 빌드에는 개발 전용 window.__scene이 없다. mesh, particle, camera 조회 자체가 실패했다. |
| 로컬 서버 연결 | 4 | 0 | API 준비 상태는 별도 HTTP 클라이언트에서, 나머지 세 건은 새 브라우저 컨텍스트에서 서버 연결이 거부됐다. 페이지 정적 응답만 제공한 환경에서는 실제 DB를 확인할 수 없다. |
| 문서 요청 오류 | 4 | 1 | 브라우저가 첫 문서 또는 새로고침 응답을 거부했다. 이 시점에는 저장·캠페인 기능 검증에 도달하지 못했다. |
| 배치 후보지 | 4 | 0 | 최초 실행에서 건설 명령이 경사를 이유로 거절됐다. 어획막 세 시험의 좌표 (46, 32)는 재현됐다. 벌목장 한 시험의 좌표 (41, 28)는 지면 공유 수정 후 허용됐다. |
| 식당 인력 저장 검증 | 4 | 0 | 주민 배치 명령을 적용할 때 식당 인력 기록 검증에서 중단됐다. 게임 코어의 대표 식당 인원 동기화 수정 이후 결과를 비교한다. |
| 연구 자원 준비 | 3 | 0 | 연구를 완료한 저장본을 준비하면서 선행 연구 비용을 기본 재고에서 지불하다 실패했다. 준비 재고를 수정하고 날틀·독재·기계 충녕 저장본 3개의 유효성을 다시 확인했다. |
| 조달 화면 진입 | 15 | 8 | 조달 버튼 클릭 단계에서 중단됐다. 실행 시점의 화면, 3D 준비와 버튼 활성화가 모두 선행 조건이다. |
| 모델 파일 | 2 | 0 | 추적 중인 3D 모델 49개를 로컬 파일과 대조했다. 최초 점검 시 여름·겨울 주민 모델 12개가 없었다. |
| 경고 선택자 | 2 | 0 | 다른 모델 경고가 같은 alert 역할로 노출된다. 특정 오류를 유발한 경고 메시지를 검사해야 한다. |
| 3D 준비 시간 | 5 | 3 | 제한 시간 안에 장면 상태가 ‘3D 불러오는 중’에서 ‘준비 완료’로 바뀌지 않았다. 이 로그만으로 지연 원인을 단정할 수 없다. |
| 예제 선택 화면 | 5 | 0 | 예제 건물 선택 버튼이 없는 화면이었다. 현재 마을 선택과 예제 작업 화면을 구별해 확인한다. |
| 건물 비용·주민 대사·배급 | 6 | 0 | 고정된 이전 문구·수치 또는 인원 기대값과 실제 표시가 다르다. 클릭한 건물·주민과 정책을 함께 확인한다. |
| 캠페인 대화·단계 | 7 | 2 | 예상한 대화 제목·대사·선택지가 현재 보고 또는 캠페인 단계와 맞는지 확인한다. |
| 마을 패널·컨트롤 | 15 | 1 | 목표 시설, 시계, HUD, 정책 또는 도구가 기대한 패널 상태에서 나타나지 않았다. 최초 실패 지점만으로 기능 결함 여부는 미확정이다. |

## 개발 빌드에서 남은 실패

| 재실행 증상 | 건수 |
|---|---:|
| 선택한 역할에 요소가 둘 이상 | 28 |
| UI 조작·표시 대기 | 27 |
| 기대값과 관찰값 불일치 | 18 |
| 조달 버튼 진입 | 10 |
| 시나리오 준비 단계에서 게임 명령 거절 | 7 |
| 서버·문서 접근 | 5 |
| 기타 개별 증상 | 4 |
| 모델 파일과 경고 | 3 |
| 개발 도구 진입 | 1 |

## 검사 코드 수정 후 확인

검사 코드 수정 후 별도로 실행한 15건과 화면 왕복·음원 재연결 2건, 배급 재검사 1회를 실행 순서로 표시했다. 배급은 같은 시험을 다시 실행한 사례다. 위 148건 재실행의 통과 수에는 더하지 않았다. 세 연구 노선은 별도로 저장과 복원까지 검증했다. 어획막 원래 좌표(46, 32)와 수정한 좌표(28, 48)에서도 같은 건설 명령을 비교했다.

| 시험 | 결과 | 남은 단서 |
|---|---|---|
| 목록 저장 실패 시 기존 목록·연결·재생을 보존하고 다시 저장한다 | 통과 | — |
| 브라우저에서 API·Worker·3D 연결을 확인한다 | 통과 | — |
| 시설 개량 버튼으로2단계 생산 배율과 저장 복원을 확인한다 | 실패 | - waiting for getByText('완공 시설 1곳', { exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 브라우저 쓰기 실패 후에도 최근·직전 저장을 모두 불러올 수 있다 | 통과 | — |
| 어획막의 다섯 인원으로 별도 운반 없이 공동 어류가 즉시 증가한다 | 실패 | - waiting for getByText('완공 시설 1곳', { exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 개발 패널을 접어도 음원 파일 연결과 재생을 유지한다 | 통과 | — |
| 반란 진압 노선의 날틀 연구 완료가10배와 새 삽화를 표시한다 | 실패 | - waiting for getByRole('button', { name: '시간 재개', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 독재 노선에서 시설을 지정해야 강제 작업과 새 삽화가 켜진다 | 실패 | - waiting for getByText('완공 시설 2곳', { exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 메카 노선은 사망자의 뼈로 한 개체만 제작하고 저장해도 중복 제작하지 않는다 | 실패 | - waiting for getByRole('button', { name: '주민 60의 뼈로 메카 제작', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 둥지 완성 모델을 커서로 옮겨 회전·취소하고 클릭 확정 뒤 자재를 운반해 건설한다 | 실패 | Locator: getByTestId('home-placement-status') · Received string:    "온돌 둥지 · 기존 시설이 차지한 구획이에요. · 방향 180°←→키로15° 회전 · 클릭 배치 · Esc 취소 · 목재50건물 배치 취소" |
| 손상 저장과 저장 공간 오류는 현재 상태·기존 원본을 보존한다 | 통과 | — |
| 배급 방식과 거주 현황을 보여 주고 고기 없는 식당 직원도 어류를 배급받는다 | 실패 | - waiting for getByRole('button', { name: '필요량 배급', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 거주 공간이 부족한 합류 주민을 둥지 증설 후 자동 입주시킨다 | 실패 | Locator: getByTestId('home-placement-status') · Received string:    "온돌 둥지 · 기존 시설이 차지한 구획이에요. · 방향 180°←→키로15° 회전 · 클릭 배치 · Esc 취소 · 목재50건물 배치 취소" |
| 주민의 느낌표에 마우스를 올리면 요구 사유를 읽을 수 있다 | 실패 | Received string:    "" |
| 결빙 수역과 어획막을 표시하고 물가의 직원이 어류를 계속 입고한다 | 실패 | Locator:  getByText('수역: 결빙 · 얼음 구멍 낚시 가능', { exact: true }) · Received: hidden |
| 이름 변경은 재생을 유지하고 여러 음원의 연결을 전환하며 새로고침 뒤 재연결한다 | 통과 | — |
| 새 HUD와 실제 GLB 마을에서 조달 현장으로 전환하고 같은 마을·캔버스로 돌아온다 | 통과 | — |
| 배급 방식과 거주 현황을 보여 주고 고기 없는 식당 직원도 어류를 배급받는다 | 통과 | — |

## 개별 사례

재실행 실패 단서에는 새로 멈춘 위치도 포함한다. 시간 초과만으로 게임 결함을 확정할 수 없는 사례는 해당 단계로 표시했다.

| 번호 | 최초 위치 | 시험 | 최초 중단 지점 | 재실행 | 재실행 실패 단서 |
|---:|---|---|---|---|---|
| 1 | bootstrap.spec.ts:4 | 웹 프록시를 통해 실제 PostgreSQL 연결을 확인한다 | 로컬 서버 연결 | 실패 | Error: apiRequestContext.get: connect EACCES 127.0.0.1:5173 |
| 2 | campaign-visual.spec.ts:40 | 기본 겨울 3D 관아에도 복홀 관아 현판이 보인다 | 3D 장면 진단 API | 통과 | — |
| 3 | audio-catalog.spec.ts:81 | 이름 변경은 재생을 유지하고 여러 음원의 연결을 전환하며 새로고침 뒤 재연결한다 | 개발 도구 진입 | 실패 | Error: expect(received).toEqual(expected) // deep equality |
| 4 | bootstrap.spec.ts:15 | 브라우저에서 API·Worker·3D 연결을 확인한다 | 개발 도구 진입 | 실패 | Locator: getByRole('status') · Error: strict mode violation: getByRole('status') resolved to 2 elements: |
| 5 | campaign-visual.spec.ts:72 | 같은 번호의 다른 저장을 불러오면 3D 법령 게시문이 바뀐다 | 3D 장면 진단 API | 통과 | — |
| 6 | audio-catalog.spec.ts:149 | 종류별 이름 검사와 제거를 처리하고 다른 채널·게임 저장·음량 설정을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 7 | approved-play.spec.ts:130 | 식량 고갈 경고는 식성별로 한 번 표시하고 1일분 보충 시 해제한다 | 개발 도구 진입 | 실패 | Locator:  getByTestId('food-warnings').locator('p') · Received: 0 |
| 8 | development.spec.ts:55 | 시설 개량 버튼으로2단계 생산 배율과 저장 복원을 확인한다 | 배치 후보지 | 실패 | Error: 경사가 가파릅니다. 완만한 터를 골라 주세요. |
| 9 | bootstrap.spec.ts:34 | Worker의 표시 정보가 3D 객체 갱신까지 전달된다 | 개발 도구 진입 | 통과 | — |
| 10 | audio-catalog.spec.ts:206 | 목록 저장 실패 시 기존 목록·연결·재생을 보존하고 다시 저장한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 11 | approved-play.spec.ts:207 | 대표 모델 파일·대기/걷기 전환과 카메라 한계·기본 시점을 실제 장면에서 확인한다 | 개발 도구 진입 | 실패 | Received: 720 |
| 12 | development.spec.ts:100 | 야근 선택은 추가 식량을 차감하지 않고 부상 기록을 남긴다 | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 13 | campaign.spec.ts:174 | 쉬움 · 함께 돌아온 정찰대는 보고별로 열리고 완료 뒤 다음 단계는 플레이어가 선택한다 | 캠페인 대화·단계 | 통과 | — |
| 14 | exchange.spec.ts:63 | 불량4 회수·재납품·재검수·수령은 물량20을 보존하고 배급3명과 동시에 완료한다 | 개발 도구 진입 | 통과 | — |
| 15 | audio-catalog.spec.ts:264 | 손상된 목록을 덮어쓰지 않고 직접 재생과 미연결 항목 등록을 지원한다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '개발 도구', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 16 | approved-play.spec.ts:289 | 대표 모델 요청 실패는 명확히 안내하고 대체 표시로 게임을 유지한다 | 경고 선택자 | 실패 | Locator: getByRole('alert') · Received string:    "일부 마을 모델을 불러오지 못했습니다. 연결 예제로 표시합니다." |
| 17 | development.spec.ts:137 | 공방 연구가 완료되고 미연결 기술은 실행되지 않으며 교역 범위 선택이 거래량을 바꾼다 | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '시간 재개', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 18 | exchange.spec.ts:116 | 교환 예약 취소 후 현장 보완을 선택해 기존12h·배급11h 경로를 유지한다 | 개발 도구 진입 | 통과 | — |
| 19 | hospital.spec.ts:10 | 병원 클릭으로 주민별 회복을 보고 저장 후 야간 자동 퇴원한다 | 마을 패널·컨트롤 | 실패 | - waiting for getByText('완공 시설 1곳', { exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 20 | hud-integration.spec.ts:40 | 새 HUD와 실제 GLB 마을에서 조달 현장으로 전환하고 같은 마을·캔버스로 돌아온다 | 3D 장면 진단 API | 실패 | Received: true |
| 21 | local-save.spec.ts:21 | 날짜·3D 상태와 직전 저장을 복원하고 새로고침해도 저장을 보존한다 | 개발 도구 진입 | 통과 | — |
| 22 | exchange.spec.ts:138 | 회수 도중·재검수 도중의 최신/이전 저장을 복원해 추가 비용 없이 남은 시간부터 진행한다 | 개발 도구 진입 | timedOut | Test timeout of 120000ms exceeded. |
| 23 | labor.spec.ts:38 | A: 같은 시간에 목재·배급 작업이 진행되고 줄이 줄며 각각 완료한다 | 조달 화면 진입 | 통과 | — |
| 24 | local-save.spec.ts:76 | 잘못된 저장(json)을 거부하고 현재 상태와 원본 기록을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 25 | hud-integration.spec.ts:103 | 지도에 연구가 적용된 정찰 왕복 시간과 귀환을 표시한다 | 캠페인 대화·단계 | 실패 | - waiting for getByRole('button', { name: '남겨 두고 정찰을 마친다' }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 26 | exchange.spec.ts:174 | 실제v1 저장은 진행·담당과 기존 목재/생존 저장 원문을 유지하며 읽기 호환한다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 27 | labor.spec.ts:57 | 재배치는 중복 없이 보완을 멈추고 저장·새로고침 후 남은 시간부터 이어간다 | 개발 도구 진입 | 통과 | — |
| 28 | local-save.spec.ts:76 | 잘못된 저장(version)을 거부하고 현재 상태와 원본 기록을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 29 | campaign.spec.ts:385 | 좁은 화면의 5단계 컷씬과 성안 변종 없는 반란을 이어 본다 | 캠페인 대화·단계 | 실패 | Locator: getByRole('dialog') · Received string:    "두 그릇을 놓고접기포 복홀 어른들, 안녕하세요! 쥬신의 왕자 포예요!혜 저도 왕자예요! 혜라고 불러 주세요!복홀에 들어온 이들의 첫 배급나르미사람이 늘어 물독부터 봐야겠어요. 취수장과 온상 재배소에 일손을 보내고, 공동 식당에도 배식할 분을 남겨  |
| 30 | exchange.spec.ts:229 | 손상 교환 저장(missing-departure)은 현재 진행과 저장 원문을 보존한다 | 조달 화면 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 31 | local-save.spec.ts:76 | 잘못된 저장(day)을 거부하고 현재 상태와 원본 기록을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 32 | labor.spec.ts:88 | B: 운송 중 남은3명으로 배급을 정시에 끝내고 목재도12시간에 사용한다 | 개발 도구 진입 | 통과 | — |
| 33 | exchange.spec.ts:229 | 손상 교환 저장(fake-receive)은 현재 진행과 저장 원문을 보존한다 | 조달 화면 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 34 | hud-integration.spec.ts:198 | 찬님 GLB 일부 요청 실패를 안내하며 대체 모델·선택과 게임 상태를 유지한다 | 3D 장면 진단 API | 실패 | - waiting for getByRole('button', { name: '명령 열기', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 35 | local-save.spec.ts:112 | 브라우저 쓰기 실패 후에도 최근·직전 저장을 모두 불러올 수 있다 | 문서 요청 오류 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 36 | campaign.spec.ts:536 | 붉은 눈의 주민에게 치안대를 보내고 훼손된 둥지만 수리한다 | 문서 요청 오류 | 통과 | — |
| 37 | labor.spec.ts:106 | 손상 저장 거부 시 현재 배정과 저장 원문을 모두 보존한다 | 문서 요청 오류 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 38 | exchange.spec.ts:229 | 손상 교환 저장(out-of-range-end)은 현재 진행과 저장 원문을 보존한다 | 문서 요청 오류 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 39 | multi-facilities.spec.ts:65 | 두 식당의 인원 지시는 독립적이고 단계별 설계와 좌상단 시각이 보인다 | 식당 인력 저장 검증 | 실패 | - waiting for getByText('완공 시설 2곳', { exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 40 | labor.spec.ts:133 | 기존 저장과 이전 일손 저장을 보존하고 다른 체험으로 나가면 멈춘다 | 개발 도구 진입 | 통과 | — |
| 41 | exchange.spec.ts:263 | 교환 운송과 배급 준비는 실제 Worker 배속에서 함께 진행하고 비활성 신호에서 정지한다 | 조달 화면 진입 | 통과 | — |
| 42 | media.spec.ts:70 | BGM·음성을 함께 재생하고 복원된 음량·음소거와 정지를 각각 적용한다 | 개발 도구 진입 | 실패 | Received: 1 |
| 43 | media.spec.ts:155 | 음성 자연 종료와 BGM 파일 교체·참조 해제를 처리한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 44 | exchange.spec.ts:284 | 좁은 화면에서도 교환 요청·출발·담당 잠금이 가능하고 가로 넘침이 없다 | 조달 화면 진입 | 통과 | — |
| 45 | labor.spec.ts:167 | 좁은 화면에서도 일손 배치 조작이 가능하고 가로 넘침이 없다 | 개발 도구 진입 | 통과 | — |
| 46 | multi-facilities.spec.ts:110 | 두 연구소의 동시 연구 완료와 저장 복원은 연구를 중복 적용하지 않는다 | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '시간 재개', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 47 | multi-facilities.spec.ts:158 | 어획막의 다섯 인원으로 별도 운반 없이 공동 어류가 즉시 증가한다 | 배치 후보지 | 실패 | Error: 경사가 가파릅니다. 완만한 터를 골라 주세요. |
| 48 | labor.spec.ts:181 | 일손 저장 쓰기 실패는 현재 진행과 최근·이전 저장을 보존한다 | 조달 화면 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 49 | media.spec.ts:218 | 손상된 음원과 재생 거부를 안내하고 새 파일로 다시 재생할 수 있다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 50 | play-clarity.spec.ts:38 | 다음 조작 링크는 실제 공급·약정·출발로 이동하고 장소 보기는 카메라/포커스를 옮긴다 | 조달 화면 진입 | 통과 | — |
| 51 | campaign.spec.ts:714 | 기한 1분 전 세 번째 행렬을 보내면 왕의 결말에서 남하 호송으로 이어진다 | 캠페인 대화·단계 | 실패 | - waiting for getByRole('button', { name: '남문 · 피난 수레', exact: true }).first() · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 52 | multi-facilities.spec.ts:215 | 방문 상인의 초상과 재협상 · 계약 입고 | 마을 패널·컨트롤 | 실패 | Locator: getByRole('dialog', { name: '상인 계약 선택' }) · Error: expect(locator).toBeVisible() failed |
| 53 | labor.spec.ts:215 | 실제 Worker 배속과 비활성 신호는 일손 시간을 멈춘 뒤 명시적으로 재개한다 | 조달 화면 진입 | 통과 | — |
| 54 | play-layout.spec.ts:8 | 첫 화면의 중심에 실제 3D 장면을 표시하고 저장·개발 메뉴는 접어 둔다 | 개발 도구 진입 | 실패 | Locator:  locator('canvas') · Received: viewport ratio 0.9424132108688354 |
| 55 | play-clarity.spec.ts:80 | 보완 역할 표지·먼저 배분 링크·장소 이동·빈 바닥·저장 복원을 유지한다 | 개발 도구 진입 | 통과 | — |
| 56 | play-layout.spec.ts:36 | 메뉴를 여닫아도 장면·날짜를 유지하고 저장 메뉴에서 예제를 복원한다 | 3D 준비 시간 | 실패 | Locator: getByText('2일차', { exact: true }) · Error: expect(locator).toBeVisible() failed |
| 57 | labor.spec.ts:246 | 경과 시간상 불가능한 저장(prep-at-open)을 거부하고 현재 진행·원문을 보존한다 | 조달 화면 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 58 | campaign.spec.ts:801 | 양녕의 피난 명부와 입고 장부가 복홀 인구와 네 재고 증가분에 맞는다 | 캠페인 대화·단계 | 실패 | Locator: getByRole('dialog') · Received string:    "두 그릇을 놓고접기양녕이 백성들은 나의 것이다. 그 같은 일이 또 벌어진다면 내 아들에게 이들을 맡기겠다. 그날은 나도 아버지처럼 홀로 남겠다.  이전 대사다음 대사 · 7/15" |
| 59 | play-clarity.spec.ts:128 | 1280px 일손 현장으로 이동한 뒤 개발 도구 없이 대상을 선택하고 시점을 복귀한다 | 개발 도구 진입 | 통과 | — |
| 60 | multi-facilities.spec.ts:281 | 희망과 절망 중 높은 쪽 저울 접시가 내려간다 | 마을 패널·컨트롤 | 실패 | Locator: getByRole('figure', { name: '희망 80, 절망 20' }) · Error: expect(locator).toBeVisible() failed |
| 61 | play-layout.spec.ts:84 | 개발 패널을 접어도 음원 파일 연결과 재생을 유지한다 | 개발 도구 진입 | 통과 | — |
| 62 | labor.spec.ts:246 | 경과 시간상 불가능한 저장(repair-paused)을 거부하고 현재 진행·원문을 보존한다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 63 | play-clarity.spec.ts:128 | 375px 일손 현장으로 이동한 뒤 개발 도구 없이 대상을 선택하고 시점을 복귀한다 | 개발 도구 진입 | 통과 | — |
| 64 | play-layout.spec.ts:134 | 좁은 화면도 가로 넘침 없이 표시하고 키보드로 메뉴를 여닫는다 | 3D 준비 시간 | 실패 | Locator:  locator('canvas') · Received: viewport ratio 0.7054886221885681 |
| 65 | quality-flow.spec.ts:14 | 품질흐름: 제안 비교와 운송·검사 분리는 실제 검사 전 결과를 확정하지 않는다 | 개발 도구 진입 | 통과 | — |
| 66 | campaign.spec.ts:929 | 반란 선택부터 결말 재생까지 · mechanical-late | 식당 인력 저장 검증 | timedOut | Test timeout of 240000ms exceeded. |
| 67 | resource-sites.spec.ts:73 | 복홀 지도의 광맥·물고기 못에 깎은 자원 터 여섯 곳이 선다 | 3D 장면 진단 API | 통과 | — |
| 68 | research-routes.spec.ts:99 | 초기 연구 화면은 후반 사건과 기술을 공개하지 않는다 | 마을 패널·컨트롤 | 실패 | Locator: getByRole('region', { name: '연구와 교역망' }).getByLabel('연구 기술') · Error: expect(locator).toBeAttached() failed |
| 69 | quality-flow.spec.ts:43 | 품질흐름: 배분과 보완 재고를 중복 없이 표시하고 저장·복원·손상 파일 거부 후에도 유지한다 | 조달 화면 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 70 | play-clarity.spec.ts:163 | 375px 키보드 장소 이동·기본 복귀·기호 표지는 가로 넘침이나 클릭 가림이 없다 | 개발 도구 진입 | 통과 | — |
| 71 | campaign.spec.ts:929 | 반란 선택부터 결말 재생까지 · hope | 식당 인력 저장 검증 | 실패 | - waiting for getByRole('dialog').getByRole('button', { name: /^다음 대사/ }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 72 | research-routes.spec.ts:107 | 반란 진압 노선의 날틀 연구 완료가10배와 새 삽화를 표시한다 | 연구 자원 준비 | 실패 | Error: 필요한 자원이 부족합니다. |
| 73 | resource-sites.spec.ts:110 | 자원 터 모델을 못 읽으면 광맥 자리 표시용 바위가 그대로 남는다 | 3D 장면 진단 API | 통과 | — |
| 74 | campaign.spec.ts:929 | 반란 선택부터 결말 재생까지 · order | 식당 인력 저장 검증 | 실패 | - waiting for getByRole('dialog').getByRole('button', { name: /^다음 대사/ }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 75 | research-routes.spec.ts:142 | 독재 노선에서 시설을 지정해야 강제 작업과 새 삽화가 켜진다 | 연구 자원 준비 | 실패 | Error: 필요한 자원이 부족합니다. |
| 76 | save-file.spec.ts:43 | 최근·직전 저장을 실제 파일로 내보내고 가져오기 확정 후 복원한다 | 개발 도구 진입 | 통과 | — |
| 77 | quality-flow.spec.ts:85 | 품질흐름: 교환 처리4와 정상 배분16을 분리하고 예약·실제 비용·수령 결과를 보존한다 | 개발 도구 진입 | 통과 | — |
| 78 | research-routes.spec.ts:185 | 메카 노선은 사망자의 뼈로 한 개체만 제작하고 저장해도 중복 제작하지 않는다 | 연구 자원 준비 | 실패 | Error: 필요한 자원이 부족합니다. |
| 79 | quality-flow.spec.ts:125 | 품질흐름: 375px에서 B 제안 선택과 정상20 검사 결과를 표시하고 넘치지 않는다 | 로컬 서버 연결 | 실패 | Error: page.goto: net::ERR_NETWORK_ACCESS_DENIED at http://127.0.0.1:5173/ |
| 80 | scene-selection.spec.ts:33 | 건물·주민을 실제 클릭해 테두리와 정보를 전환하고 빈 바닥에서 해제한다 | 예제 선택 화면 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 81 | save-file.spec.ts:143 | 잘못된 가져오기 파일(broken.json)이 현재 상태와 두 저장을 바꾸지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 82 | site-life.spec.ts:10 | 공급 선택부터 실제 운송·하역·검수 안내가 전환되고 안내를 접어도 게임을 유지한다 | 개발 도구 진입 | 통과 | — |
| 83 | campaign.spec.ts:1067 | 마지막 장을 덮은 뒤 다시 하기로 복홀의 5단계 시작 장부를 복원한다 | 캠페인 대화·단계 | timedOut | Test timeout of 120000ms exceeded. |
| 84 | save-file.spec.ts:143 | 잘못된 가져오기 파일(future.json)이 현재 상태와 두 저장을 바꾸지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 85 | scene-selection.spec.ts:87 | 카메라 드래그·우클릭은 대상 선택이나 선택 해제로 처리하지 않는다 | 예제 선택 화면 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 86 | save-file.spec.ts:143 | 잘못된 가져오기 파일(day.json)이 현재 상태와 두 저장을 바꾸지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 87 | scene-selection.spec.ts:106 | 장면 갱신·저장 복원·메뉴 토글 후에도 같은 대상의 최신 예제 정보를 표시한다 | 예제 선택 화면 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 88 | campaign.spec.ts:1146 | 도성 실패 화면에 무음 피습 장면이 열린다 | 캠페인 대화·단계 | 통과 | — |
| 89 | site-life.spec.ts:38 | 교환 운송 저장·새로고침 복원과 재검수·수령·완료 안내를 보존한다 | 개발 도구 진입 | 통과 | — |
| 90 | settings.spec.ts:74 | 손상·미지원 설정은 기본값으로 시작하고 읽기만으로 덮어쓰지 않는다: {"settingsVersion":99,"masterVolume":90,"muted":false} | 마을 패널·컨트롤 | 통과 | — |
| 91 | scene-selection.spec.ts:141 | 좁은 터치 화면 › 터치로 선택하고 키보드 버튼으로 전환·해제하며 가로 넘침 없이 표시한다 | 예제 선택 화면 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 92 | save-file.spec.ts:143 | 잘못된 가져오기 파일(large.json)이 현재 상태와 두 저장을 바꾸지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 93 | site-life.spec.ts:78 | 모바일에서 주민 담당·보완 인원 부족·배급 병행 안내와 선택을 확인한다 | 개발 도구 진입 | 통과 | — |
| 94 | save-file.spec.ts:143 | 잘못된 가져오기 파일(wrong.txt)이 현재 상태와 두 저장을 바꾸지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 95 | scene-selection.spec.ts:165 | 마당의 시설과 주민, 게시판을 눌러도 하단 콘솔이 움직이지 않는다 | 예제 선택 화면 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 96 | site-progress.spec.ts:13 | 선택하지 않은 세 장소의 상태와 현장 번호를 표시하며 클릭·카메라 입력을 가리지 않는다 | 개발 도구 진입 | 통과 | — |
| 97 | site-selection.spec.ts:32 | 검수대·배급소 실제 클릭의 테두리·정보·단일 선택과 빈 바닥 해제를 확인한다 | 조달 화면 진입 | 실패 | Locator: getByRole('button', { name: '건물 예제 선택', exact: true }) · Error: strict mode violation: getByRole('button', { name: '건물 예제 선택', exact: true }) resolved to 7 elements: |
| 98 | campaign.spec.ts:1217 | 출문 대화 중 실제 3D 장면에서 불길이 그려진다 | 3D 장면 진단 API | 실패 | Received:   0 |
| 99 | site-zones.spec.ts:11 | 빈 구역의 표식·글자 안내는 유지하고 실제 목재 클릭·테두리·바닥 해제를 보존한다 | 개발 도구 진입 | 통과 | — |
| 100 | campaign.spec.ts:1257 | 3D 관아 선택과 해제가 순라 패널에 반영된다 | 3D 준비 시간 | 통과 | — |
| 101 | save-file.spec.ts:167 | 가져오기 쓰기 실패는 원문과 현재 상태를 유지하며 재시도 시 직전 저장을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 102 | site-progress.spec.ts:47 | 재배치의 부족 이유·진행량을 복원하고 실패 불러오기는 알림·현재 상태·원문을 보존한다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 103 | site-selection.spec.ts:56 | 검수·격리품·배급소 현장 명령으로 교환과 배급을 완료하며 숨은 격리품 선택은 해제한다 | 조달 화면 진입 | 통과 | — |
| 104 | site-zones.spec.ts:43 | 묶음 표시의 저장 복원·사용 후 빈 구역·모드 종료를 확인한다 | 개발 도구 진입 | timedOut | Test timeout of 120000ms exceeded. |
| 105 | site-selection.spec.ts:96 | 현장 재배치는 보완 진행량을 보존하고 저장·새로고침 복원에서 선택만 해제한다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 106 | save-file.spec.ts:206 | 파일 읽기 실패는 기존 기록을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 107 | site-progress.spec.ts:103 | 교환의 대기·예약 인원·재검수·수령 완료를 보여주고 완료 저장을 읽어도 알리지 않는다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 108 | site-zones.spec.ts:85 | 모바일에서도 글자·기호로 구역을 구분하고 카메라·키보드 선택을 유지한다 | 로컬 서버 연결 | 실패 | Error: page.goto: net::ERR_NETWORK_ACCESS_DENIED at http://127.0.0.1:5173/ |
| 109 | save-file.spec.ts:226 | 기존 로컬 저장이 손상되었으면 유효한 가져오기 파일로도 자동 덮어쓰지 않는다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 110 | timber.spec.ts:16 | coal-west 작업장에 배치하면 광물을 자동 입고하고 저장 후 이어진다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 111 | site-progress.spec.ts:147 | 자동 시간 tick도 진행량을 갱신하고 일시정지하면 같은 진행량을 유지한다 | 조달 화면 진입 | 통과 | — |
| 112 | site-selection.spec.ts:133 | 손상 저장 불러오기 실패는 현재 선택·진행·원문을 보존한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 113 | site-progress.spec.ts:180 | 375px 터치와 키보드에서 항상 표시한 카드가 넘치지 않고 현장 선택이 가능하다 | 로컬 서버 연결 | 실패 | Error: page.goto: net::ERR_NETWORK_ACCESS_DENIED at http://127.0.0.1:5173/ |
| 114 | town.spec.ts:41 | 시설 완성 모습으로 회전 배치하고 자재를 확보한 두 공사를 저장·재개해 완공한다 | 3D 장면 진단 API | 실패 | Error: page.evaluate: Execution context was destroyed, most likely because of a navigation. |
| 115 | site-selection.spec.ts:156 | 장소 전환은Worker를 초기화하지 않고 모드 종료·재시작에서는 선택이 남지 않는다 | 조달 화면 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 116 | town.spec.ts:124 | 결빙 수역과 어획막을 표시하고 물가의 직원이 어류를 계속 입고한다 | 배치 후보지 | 실패 | Error: 경사가 가파릅니다. 완만한 터를 골라 주세요. |
| 117 | video.spec.ts:53 | 영상 수동 재생·정지·자연 종료에 저장된 음량·음소거가 적용된다 | 개발 도구 진입 | 실패 | Received: 1 |
| 118 | timber.spec.ts:16 | iron-north 작업장에 배치하면 광물을 자동 입고하고 저장 후 이어진다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 119 | video.spec.ts:127 | 영상 정지·파일 교체가 BGM을 멈추지 않고 이전 파일 참조를 해제한다 | 개발 도구 진입 | 실패 | Received: 1 |
| 120 | site-selection.spec.ts:179 | 카메라 드래그는 장소 선택을 바꾸지 않고 바닥 클릭만 해제한다 | 개발 도구 진입 | 통과 | — |
| 121 | village-hud.spec.ts:12 | HUD 건설·연구 메뉴와 저장·개발 도구가 같은 마을 진행을 유지한다 | 마을 패널·컨트롤 | 실패 | Locator: getByRole('region', { name: '건설과 식량 수급', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 122 | video.spec.ts:184 | 잘못된 영상과 재생 거부를 안내하고 올바른 파일로 복구한다 | 개발 도구 진입 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 123 | timber.spec.ts:16 | stone-east 작업장에 배치하면 광물을 자동 입고하고 저장 후 이어진다 | 개발 도구 진입 | 실패 | - waiting for getByRole('button', { name: '마른 목재 20 조달', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 124 | site-selection.spec.ts:199 | 작은 터치 화면 › 터치·키보드로 현장을 선택하고 해제하며 가로 넘침이 없다 | 조달 화면 진입 | 통과 | — |
| 125 | village-hud.spec.ts:67 | 출문 후 연구 가지와 건설 목록에 현재 단계 도면을 표시한다 | 3D 준비 시간 | 통과 | — |
| 126 | village-region.spec.ts:61 | 병원 건물을 누르면 해당 일터의 운영 인원만 바로 배치한다 | 3D 준비 시간 | 통과 | — |
| 127 | winter-visuals.spec.ts:4 | winter village loads its models and preserves the example building | 모델 파일 | 실패 | Locator:  locator('.model-warning') · Received: 1 |
| 128 | village-portraits.spec.ts:4 | selecting a village building shows its portrait without replacing the existing selection flow | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '명령 열기', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 129 | timber.spec.ts:147 | 둥지 완성 모델을 커서로 옮겨 회전·취소하고 클릭 확정 뒤 자재를 운반해 건설한다 | 건물 비용·주민 대사·배급 | 실패 | - waiting for getByRole('button', { name: '온돌 둥지 증설 · 목재20', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 130 | winter-visuals.spec.ts:4 | summer village loads its models and preserves the example building | 모델 파일 | 실패 | Locator:  locator('.model-warning') · Received: 1 |
| 131 | village-portraits.spec.ts:75 | a missing building portrait leaves its selection text usable | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '명령 열기', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 132 | village-region.spec.ts:155 | 복홀에서 땅을 드래그해 회전하고 마우스 휠로 확대한다 | 3D 장면 진단 API | 통과 | — |
| 133 | winter-visuals.spec.ts:81 | winter village keeps a selectable office when its winter model is unavailable | 3D 장면 진단 API | 통과 | — |
| 134 | village-region.spec.ts:189 | 철광맥 표식에서 철광산의 건설 비용과 지면 미리보기를 확인한다 | 3D 장면 진단 API | 통과 | — |
| 135 | timber.spec.ts:202 | 제재소·저장소의 인원 지정으로 자동 운반·입고하고 저장 후 이어진다 | 개발 도구 진입 | 통과 | — |
| 136 | timber.spec.ts:274 | 다른 숲 권역의 자유 배치 시설과 기존 시설의 자원을 따로 보존한다 | 배치 후보지 | 실패 | Error: 경사가 가파릅니다. 완만한 터를 골라 주세요. |
| 137 | timber.spec.ts:313 | 식성별 주민 구성과 수레 내려놓기·이탈 단계를 표시한다 | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '일시정지', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 138 | timber.spec.ts:340 | 검사 명령 없이 허기 요구가 생기고 식당을 건설하면 각자 이용한다 | 건물 비용·주민 대사·배급 | 실패 | Locator:  getByLabel('식당 운영 인원', { exact: true }) · Received: "0" |
| 139 | timber.spec.ts:404 | 계약 한 번으로 주민 선택 없이 전 과정과 공동 재고·다음 임무가 자동 진행된다 | 마을 패널·컨트롤 | 실패 | - waiting for getByLabel('진행 속도', { exact: true }) · TimeoutError: locator.selectOption: Timeout 30000ms exceeded. |
| 140 | timber.spec.ts:435 | B도 직접 수령이나 배분 없이 공동 재고에 입고한다 | 개발 도구 진입 | 실패 | Locator:  getByTestId('resource-RES_WOOD') · Received: "1,020" |
| 141 | timber.spec.ts:450 | 운송 중 저장과 새로고침 복원은 자동 업무와 공동 재고의 중복 정산을 막는다 | 마을 패널·컨트롤 | 실패 | - waiting for getByRole('button', { name: '일시정지', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 142 | timber.spec.ts:477 | 마을 현황으로 돌아가도 같은 공동 재고를 유지한다 | 개발 도구 진입 | 실패 | Locator:  getByTestId('resource-RES_WOOD') · Received: "1,020" |
| 143 | timber.spec.ts:526 | 건물 체력은 마우스를 올리면 나타나며 화재 손상 뒤 직접 보수한다 | 건물 비용·주민 대사·배급 | 실패 | Locator: getByRole('tooltip') · Received string:    "온돌 둥지4입주 10명 · 공간 16/20" |
| 144 | timber.spec.ts:617 | 손상 저장과 저장 공간 오류는 현재 상태·기존 원본을 보존한다 | 경고 선택자 | 실패 | Locator: getByRole('alert') · Error: strict mode violation: getByRole('alert') resolved to 2 elements: |
| 145 | timber.spec.ts:653 | 탭 비활성과 저장 복원은 명시적 재개를 기다린다 | 마을 패널·컨트롤 | 실패 | Locator: getByRole('button', { name: '시간 재개', exact: true }) · Error: expect(locator).toBeVisible() failed |
| 146 | timber.spec.ts:682 | 배급 방식과 거주 현황을 보여 주고 고기 없는 식당 직원도 어류를 배급받는다 | 건물 비용·주민 대사·배급 | 실패 | Locator: getByTestId('ration-table') · Received string:    "주민한 끼하루 한도트리케라톱스520벨로키랍토르2.510스피노사우루스520" |
| 147 | timber.spec.ts:745 | 거주 공간이 부족한 합류 주민을 둥지 증설 후 자동 입주시킨다 | 건물 비용·주민 대사·배급 | 실패 | - waiting for getByRole('button', { name: '온돌 둥지 증설 · 목재20', exact: true }) · TimeoutError: locator.click: Timeout 30000ms exceeded. |
| 148 | timber.spec.ts:788 | 주민의 느낌표에 마우스를 올리면 요구 사유를 읽을 수 있다 | 건물 비용·주민 대사·배급 | 실패 | Received string:    "주민 45마을 주민" |
