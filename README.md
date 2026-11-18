# Break Brake AI

사람과 브라우저 내 AI가 플레이하는 정적 웹 벽돌깨기 게임입니다. 원본의 핵심 플레이 감각과 제공 명세의 6×10 격자·9→10행 패배 규칙을 반영했습니다.

## 실행

```bash
python3 -m http.server 8000 --directory dist
```

브라우저에서 `http://localhost:8000`을 엽니다. 별도 백엔드나 Python AI 프로세스는 필요하지 않습니다. 게임 화면을 드래그해 직접 발사하거나 **AI 플레이**를 누르면 브라우저 Web Worker가 화면 픽셀을 읽어 각도를 선택합니다. `속도` 버튼은 공 애니메이션을 빠르게 진행합니다.

## 개발

```bash
npm test
npm run train
```

`STATES=1000000 npm run train`은 게임 엔진으로 여러 게임을 진행하면서 보드 상태 100만 개를 수집합니다. 매 게임은 실제 초기 배치로 시작하고 최대 100턴까지 진행합니다. 학습과 검증은 게임 단위로 분리합니다. 학습이 끝나면 `dist/model.json`을 갱신하며, 사용한 게임 엔진의 SHA-256과 검증 RMSE를 기록합니다.

`WORKERS`로 병렬 작업 수를 지정할 수 있습니다. 다른 모델을 보존하며 시험하려면 `MODEL_PATH=/tmp/break-brake-model.json STATES=800 npm run train`처럼 출력 경로를 지정하세요. 모델 간 플레이 성능은 같은 시드에서 생존 턴 수로 비교하세요.

## GitHub Pages

저장소의 **Settings → Pages → Source**를 **GitHub Actions**로 설정합니다. `main`에 푸시하면 테스트가 실행되고, 통과하면 `dist/`가 사이트 루트에 배포됩니다. 모델을 갱신할 때도 `dist/model.json`을 커밋해 푸시합니다.

## 구조

- `dist/core.js`: 게임 규칙과 턴 시뮬레이션
- `dist/app.js`: Canvas 렌더링, 사람 입력, AI 모드
- `dist/ai-worker.js`: 화면 픽셀 인식, 후보각 탐색, 로컬 모델 추론
- `dist/model.json`: 학습된 작은 후보 평가 모델
- `tools/train.js`: 결정적 데이터 생성과 모델 학습
- `tests/`: 핵심 게임 규칙 테스트

게임·AI·모델 추론은 사용자 브라우저에서 실행됩니다. 웹 서버는 정적 파일만 전달합니다.
