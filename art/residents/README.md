# 스피노사우루스 주민 모델

`generate-spinosaurus.mjs`가 편집 원본이다. 기존 트리케라톱스·벨로키랍토르 모델에서 추출한 파일이 아니라, 이 프로젝트의 후속 작업으로 만든 형상이다. 일반형과 겨울형이 몸통·등돛·주둥이·관절과 동작을 공유하고 겨울형에만 어깨옷과 망토가 붙는다. 재질 색은 스크립트 안에 있으며 별도 텍스처는 필요하지 않다.

- 단위는 미터, 위쪽은 +Y, 정면은 +Z다. 모델 좌표와 게임의 표시 배율을 구분한다.
- 동작 이름은 `Idle`과 `Walk`다. 골격 파일을 참조하지 않고 팔다리 부모 노드를 회전시킨다.
- 저장소 루트에서 지정된 Node와 잠금 파일의 의존성을 설치한 뒤 `node art/residents/generate-spinosaurus.mjs`를 실행한다. `apps/web/public/models/residents/SPINO_Spinosaurus.glb`, `SPINO_Spinosaurus_v2.glb` 두 파일을 다시 만든다. 배포용 압축본을 직접 고치지 않는다.
- 생성 후 `pnpm exec vitest run apps/web/src/spinosaurus-asset.test.ts`를 실행한다. 이 검사는 파일의 구조·표면·동작 데이터를 검사하며 게임 안에서의 외형·발 위치·프레임 검사를 대신하지 않는다.

## 원거리 군중용 모델

세 종 중 하나의 외형을 수정하면 먼저 일반형과 겨울형 원본 GLB를 저장한다. 이어서 저장소 루트에서 `node art/residents/generate-crowd.mjs`를 실행한다. `apps/web/public/models/residents/crowd/`에 원본과 이름이 같은 경량 GLB 6개가 생성된다. 이 파일들은 기본 자세와 색상을 담은 정적 모델이므로 직접 편집하지 않는다.

`node art/residents/generate-crowd.mjs --check`는 파일을 쓰지 않고 재생성 결과를 비교한다. `node --test art/residents/crowd-models.test.mjs`는 원본과의 발 높이·크기 차이와 네 방향에서 본 실루엣을 검사한다. 이 결과는 실제 마을의 프레임 속도와 별개다.
