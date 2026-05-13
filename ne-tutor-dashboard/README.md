# NE Tutor Ecosystem Impact Dashboard

GA4 시트 HTML보내기와 주문 엑셀을 브라우저에서 읽어 **정적 MVP 대시보드**로 보여 줍니다. GitHub Pages 배포를 전제로 **React + Vite + TypeScript + Plotly.js + SheetJS**로 구성했습니다.

## 요구 데이터 (`public/data/`)

다음 파일을 `ne-tutor-dashboard/public/data/`에 두세요(파일명·공백 규칙 유지).

- `NE Tutor M.html`, `NE Tutor PC.html` … (서비스명 + 공백 + `M` 또는 `PC`)
- `주문별현황2021~2026.xlsx` (컬럼: NO, 아이디, 주문일, 카테고리명, 주문상품, 상태)

파일이 없거나 로드에 실패하면 **샘플 GA 데이터**로 화면이 동작합니다(주문 위젯은 비어 있을 수 있음).

## 로컬 실행

```bash
cd ne-tutor-dashboard
npm install
npm run dev
```

브라우저에서 표시된 주소(기본 `http://localhost:5173`)로 접속합니다. 같은 PC에서 접속이 안 되면 `http://127.0.0.1:5173`으로 시도해 보세요. 다른 기기에서 접속하려면 터미널에 표시된 Network URL을 사용합니다.

## 페이지가 하얗게 비거나 연결 안 될 때

### GitHub Pages

0. **저장소 페이지(github.com/…/tree)가 아니라 사이트 URL로 열기**  
   `https://github.com/<user>/<repo>`는 HTML 사이트가 아니라 404·목록만 보일 수 있습니다. 실제 대시보드는 **`https://<user>.github.io/<repo>/`** (Settings → Pages에 표시된 Visit site 링크)로 접속하세요.

1. **저장소 종류에 맞는 `base`**
   - **프로젝트 사이트** (`https://아이디.github.io/저장소이름/`): 빌드 시 `VITE_BASE=/저장소이름/` 이어야 합니다. 워크플로가 일반 저장소에 대해 자동 설정합니다.
   - **사용자/조직 사이트** (저장소 이름이 `아이디.github.io`인 경우, URL이 `https://아이디.github.io/` 루트): **`base`는 반드시 `/`** 여야 합니다. 이전에는 저장소 이름으로 `base`를 잡아 JS·CSS가 전부 404가 나는 경우가 있었습니다. 현재 워크플로는 `*.github.io` 저장소면 자동으로 `/`를 씁니다.

2. **Settings → Pages**에서 배포 소스가 **GitHub Actions**인지 확인합니다.

3. 브라우저 **개발자 도구 → Network**에서 `assets/*.js`가 404인지 확인합니다. 404면 `npm run build`에 쓴 `VITE_BASE`가 실제 사이트 URL 경로와 다른 것입니다.

4. **Deployments**에 `pages-build-deployment`와 `Deploy GitHub Pages`가 둘 다 있을 때, **Active**가 기본 `pages-build-deployment`이면 저장소 루트 기준 배포가 올라가 `index.html`이 없어 **사이트 전체 404**가 날 수 있습니다. **Actions → Deploy GitHub Pages**에서 최신 성공 실행을 **Re-run all jobs**해 커스텀 배포가 마지막이 되게 하거나, **Actions** 왼쪽에서 **Pages build and deployment** 워크플로를 **Disable workflow**할 수 있으면 비활성화하세요.

### 로컬 (`npm run dev`)

- `dist/index.html`을 파일로 더블클릭해 열면 **동작하지 않습니다**. 반드시 `npm run dev` 또는 `npm run preview`로 서버를 띄운 뒤 브라우저로 접속하세요.

## 프로덕션 빌드

```bash
npm run build
npm run preview
```

## GitHub Pages 배포

1. 이 저장소(또는 `ne-tutor-dashboard`가 포함된 저장소)를 GitHub에 푸시합니다.
2. **Settings → Pages → Build and deployment**에서 **GitHub Actions**를 선택합니다.
3. 워크플로 `.github/workflows/deploy.yml`이 `main` 또는 `master` 브랜치 푸시 시 빌드·배포합니다.

> 저장소 루트가 **`ne-tutor-dashboard` 폴더 자체**인 경우(상위에 모노레포 없음), 워크플로에서 `working-directory`, `cache-dependency-path`, `path`의 `ne-tutor-dashboard/` 접두어를 제거하세요.

4. 저장소가 `https://github.com/<user>/<repo>`인 경우 사이트 URL은 보통 `https://<user>.github.io/<repo>/` 입니다. 이에 맞춰 빌드 시 `VITE_BASE=/<repo>/`가 설정됩니다.

**사용자 페이지(`username.github.io` 루트 저장소)**에만 올리는 경우에는 `vite.config.ts`의 `base`를 `'/'`로 두고, 워크플로의 `VITE_BASE` 환경 변수를 제거하거나 `/`로 맞추면 됩니다.

### 수동 배포 (Actions 없이)

```bash
cd ne-tutor-dashboard
# 프로젝트 사이트인 경우:
set VITE_BASE=/여기에-저장소-이름/
npm run build
```

`dist/` 폴더를 Pages에 업로드합니다.

## MVP 한계(보고 시 유의)

- **MAU·신규 UV**는 일별 시트를 월/구간으로 합산·추정한 값입니다. GA4 고유 사용자 정의와 1:1로 맞지 않을 수 있어 화면에 **MVP 추정치**로 안내합니다.
- **M+PC 합산** 시 동일 사용자가 양쪽에서 집계되면 중복될 수 있습니다.
- **이벤트 세로선**은 이벤트 날짜가 속한 **월 버킷**에 맞춰 그립니다.
- **Sankey(주문)**는 「첫 문뱅 이후 가장 빠른 비문뱅 카테고리 주문」으로 사용자를 한 버킷에만 배분한 단순 모델입니다.

## 라이선스

내부 보고용 MVP — 필요 시 조직 정책에 맞게 라이선스를 지정하세요.
