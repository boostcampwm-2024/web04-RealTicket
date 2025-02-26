import * as dotenv from 'dotenv';

dotenv.config({ path: `./src/config/.env.${process.env.NODE_ENV}` });
