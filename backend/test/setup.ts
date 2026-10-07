import { configureTestDatabase } from './database';
// Set limits before decorators build Multer interceptors.
configureTestDatabase();
process.env.MAX_IMPORT_ROWS = '3';
process.env.MAX_IMPORT_FILE_MB = '1';
