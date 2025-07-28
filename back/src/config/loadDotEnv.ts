import * as fs from 'fs';

import * as dotenv from 'dotenv';

const envPath = `./src/config/.env.${process.env.NODE_ENV}`;

if (!fs.existsSync(envPath)) {
  console.error(
    `'${envPath}' 파일이 존재하지 않습니다. 파일을 생성해주세요. ('/src/config/.env.sample' 파일 및 '/back/README.md' 참고)`,
  );
  process.exit(1);
}
try {
  dotenv.config({ path: envPath });
} catch (error) {
  console.error(
    `'${envPath}' 파일 로드 중 오류가 발생했습니다. ('/src/config/.env.sample' 파일 및 '/back/README.md' 참고)`,
    error,
  );
  throw error;
}

const execModePath = `./src/config/.env.execMode.${process.env.EXEC_MODE}`;

try {
  dotenv.config({ path: execModePath });
} catch (error) {
  console.error(`'${execModePath}' 파일 로드 중 오류가 발생했습니다.`, error);
  throw error;
}
