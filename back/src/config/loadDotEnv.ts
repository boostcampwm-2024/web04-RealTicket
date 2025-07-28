import * as dotenv from 'dotenv';

dotenv.config({ path: `./src/config/.env.${process.env.NODE_ENV}` });

dotenv.config({ path: `./src/config/.env.execMode.${process.env.EXEC_MODE}` });
