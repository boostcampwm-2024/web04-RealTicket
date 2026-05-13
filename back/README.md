## Project setup

```bash
$ npm install
```

### 환경 변수 설명
- `NODE_ENV`:
    - 장소적 환경을 구분함 (DB 연결 정보, 로그 저장 설정 등)
    - (development/production)
- `EXEC_MODE`:
    - 실행 모드를 구분함 (개발용/배포용 동작 설정)
    - (dev/release)

### 환경 변수 설정
다음과 같이 환경 변수 파일들을 **"새로"** 생성하세요:

```text
./
└── back/
    └── src/
        └── config/
            └── .env.development
            └── .env.production
            └── .env.sample - (생성되어 있음)(참고용)
```

#### 기본 환경 변수 파일(NODE_ENV)
각 환경에 맞는 `.env` 파일을 생성하고, 필요한 환경 변수를 설정하세요.
이 파일들은 데이터베이스 연결 정보, Redis 설정, 프론트엔드 URL 등을 포함합니다.

경로에 있는 `.env.sample` 파일(참고용)을 참고하여 작성할 수 있습니다.

예시: `.env.development`:
```env
# 표준 시간 설정
TZ=Asia/Seoul

# 데이터베이스 설정
DATABASE_HOST=localhost
DATABASE_PASSWORD=0000
DATABASE_PORT=3306
DATABASE_SCHEMA=real_ticket
DATABASE_SYNCHRONIZE=false
DATABASE_TYPE=mysql
DATABASE_USERNAME=user

# Redis 설정
REDIS_HOST=localhost
REDIS_PORT=6379

# 프론트엔드 URL
FRONT_URL=http://localhost:30000

# 로그 저장 설정
LOG_MAX_SIZE=20m
LOG_MAX_LIFE=30d
LOG_ZIP=true
```

#### 실행 모드별 환경 변수 파일(EXEC_MODE)
장소적 환경과 별개로, 동작 모드를 설정하는 환경 변수가 `.env.execMode.(모드)`에 **"이미"** 정의되어 있습니다.

`.env.execMode.release`는 실제 서비스에 사용되는 설정으로, 임의로 변경하지 않는 것을 권장합니다.

`.env.execMode.dev`는 개발 환경에서 사용되는 설정으로, 개발 중에 필요한 기능을 활성화하거나 비활성화할 수 있습니다.


**`.env.execMode.dev` (개발용)**:
```env
# 로깅 모드
LOGGING_MODE=dev

# 로그 저장 모드
LOG_SAVE_MODE=dev

# 벤치마크 모드
BENCHMARK_MODE=true

# 예매 시퀀스 상태 관리 모드
ENTERING_SESSION_EXPIRE_MODE=prod
DEVELOPING_WAITING_QUEUE_MODE=false
```

## Compile and run the project

### 개발 환경
```bash
# 개발 환경 (watch 모드) - 파일 변경 시 자동 재시작
$ npm run start:dev:watch

# 개발 환경 (컴파일된 파일 실행)
$ npm run build
$ npm run start:dev:compiled

# 개발 환경 (디버그 모드) - 9229 포트에서 디버깅 가능
$ npm run start:dev:debug
```

### 프로덕션 환경 (개발 모드)
```bash
# 프로덕션 환경설정 + 개발 실행모드 (watch 모드)
$ npm run start:prod:watch

# 프로덕션 환경설정 + 개발 실행모드 (컴파일된 파일 실행)
$ npm run build
$ npm run start:prod:compiled

# 프로덕션 환경설정 + 개발 실행모드 (디버그 모드)
$ npm run start:prod:debug
```

### 배포 환경
```bash
# 실제 서비스용 (릴리스 모드)
$ npm run build
$ npm run start:release
```

### Docker 환경에서 실행
Docker 컨테이너에서는 watch 모드 대신 컴파일된 파일을 직접 실행하는 것을 권장합니다:
```bash
# 개발용 컨테이너
$ npm run build
$ npm run start:dev:compiled

# 디버깅이 필요한 경우 (9229 포트 노출 필요)
$ npm run start:dev:debug

# 배포용 컨테이너
$ npm run build
$ npm run start:release
```
