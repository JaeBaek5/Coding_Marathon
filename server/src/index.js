import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(__dirname, '../.env') });

const { default: app } = await import('./app.js');

const port = process.env.PORT || 8787;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
