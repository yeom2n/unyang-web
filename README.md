# 운양고 School-Hub

나이스(NEIS) 공개 데이터를 매일 수집하여 급식·학사 일정을 표시합니다. 기존 반별 시간표는 수동 데이터입니다.

## 처음 한 번 설정하기

1. https://open.neis.go.kr/ 에서 로그인 후 **활용가이드 → 인증키 신청**으로 키를 발급합니다. 나이스 학생 로그인 비밀번호가 아닙니다.
2. 이 저장소의 **Settings → Secrets and variables → Actions → New repository secret**에서 이름을 `NEIS_API_KEY`, 값을 발급받은 키로 저장합니다. 키를 소스 코드나 채팅에 붙여 넣지 마세요.
3. 변경 브랜치의 PR을 확인하여 `main`에 병합합니다.
4. **Settings → Pages → Build and deployment → Source**를 **GitHub Actions**로 설정합니다.
5. **Actions → Update school data and deploy → Run workflow**를 실행합니다. 성공 후 배포 주소에서 급식과 마지막 갱신 시각을 확인합니다.

매일 한국시간 06:17에 실행되도록 설정했습니다. GitHub 사정으로 지연되거나 장기간 활동이 없는 공개 저장소의 예약 작업이 비활성화될 수 있으므로 Actions 실행 기록을 확인하세요. 브랜치 보호 정책이 자동 커밋을 막으면 데이터 저장 단계가 실패하므로 해당 정책에 맞춘 PR 기반 갱신 방식이 필요합니다.

## 데이터 처리

- 운양고등학교: 경기도교육청 `J10`, 학교코드 `7531103` (나이스 학교기본정보로 확인).
- 급식: 전월부터 다음 달까지. 오늘 카드는 중식, 월별 목록은 모든 식사 구분을 표시합니다. 알레르기 번호를 보존합니다.
- 일정: 현재 학년도 3월부터 다음 해 2월까지(2월에는 다음 달까지 포함). 선택 학년에 해당하는 일정과 학년 미지정 일정을 표시합니다.
- D-day: 해당 학년의 예정 일정 중 행사명으로 시험·방학식·수능을 찾습니다. 이름이 다르거나 등록되지 않으면 '일정 미등록'으로 표시합니다. 시험 기간 자동 판별은 지원하지 않습니다.
- API 전체 페이지를 수집하고 두 API 및 데이터 변환이 모두 성공한 뒤 파일을 교체합니다. 실패 시 저장된 파일과 이전 배포를 유지합니다. 48시간 이상 오래된 데이터는 화면에 갱신 지연을 표시합니다.
- 정상 응답에 자료가 없으면 '등록된 정보 없음', 파일 조회 실패는 '불러오기 실패'로 구분합니다. 최초 빈 파일은 '아직 자동 갱신된 정보가 없습니다'로 표시합니다.
- 공식 API 등록 상황에 따라 실제 학교 공지와 차이가 있을 수 있습니다. 초기 적용 시 학교 공지와 대조하세요.
- 정적 파일만 배포합니다. 키는 수집 프로세스의 환경변수로만 전달하며 JSON에 포함되지 않습니다.
- GITHUB_TOKEN 자동 커밋만으로 Pages 갱신이 시작되지 않으므로 같은 workflow에서 Pages 배포까지 수행합니다.

## 로컬 실행과 검증

Python 3.12와 Node.js가 있는 환경:

```sh
python -m unittest discover -s tests
node --check school-data.js
node tests/test_ui.cjs
python -m http.server 8000
```

브라우저에서 http://localhost:8000 을 엽니다. HTML 파일을 더블클릭하면 JSON fetch가 차단될 수 있습니다. 실제 수집은 환경변수 `NEIS_API_KEY`를 설정하고 `python scripts/update_neis.py`로 실행합니다. 키 없이 전체 API 수집 검증은 할 수 없습니다.

## 공식 문서

- https://open.neis.go.kr/
- https://docs.github.com/en/actions/concepts/security/github_token
- https://docs.github.com/en/pages/getting-started-with-github-pages/using-custom-workflows-with-github-pages
